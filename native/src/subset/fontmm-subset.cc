// fontmm-subset — 英文字体自动子集化 (issue #10)
// SPDX-License-Identifier: GPL-3.0
//
// 背景: fonts.xml 中 sans-serif / sys-sans-en 家族排在 zh-Hans / zh-Hant 之前,
// 因此 en.ttf 一旦自带 CJK 字形, 就会把这些字形也用于中文渲染, 从而盖掉
// hans.ttf / hant.ttf —— 表现为「换了中文字体但部分汉字没变」。
//
// Android 的 fonts.xml 无法限定某个字体「只负责英文」, 唯一可靠做法是在应用前
// 把 en.ttf 裁剪成只含拉丁字符的子集。
//
// 实现: 直接使用 harfbuzz 的 subset API (静态链接进本程序)。
//   - 相比 Pyodide + fontTools: 体积与启动开销小几个数量级 (无需 Python 运行时)
//   - 可作为独立 CLI 运行于设备端, 因此 WebUI 与手动放字体两条路径都能覆盖
//   - 完整保留可变字体特性: fvar / gvar / STAT 与 GSUB / GPOS / GDEF 均不丢失
//     (已实测: 子集后 wght 轴范围与各字形变形数据都在, 字重覆写功能不受影响)
//
// 用法:
//   fontmm-subset -check <font.ttf>
//       检测字体是否含 CJK 字形。含则退出码 1, 不含则 0 (供调用方判断是否需要处理)。
//   fontmm-subset -in <font.ttf> -out <subset.ttf> [-minimal] [-keep-cjk]
//       生成子集。默认保留拉丁/希腊/西里尔与常用符号;
//       -minimal 仅保留 ASCII/西欧 (体积更小, 但希腊/西里尔会缺字);
//       -keep-cjk 额外保留 CJK 区块 (默认不保留)。
//   fontmm-subset -metrics -in <font.ttf> -out <carrier.ttf>
//       把现成字体挖空: 只留度量与各类空格字形, 用作固定行距/字距的载体 (issue #17)。

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>
#include <string>

#include <hb.h>
#include <hb-subset.h>
#include <hb-ot.h>

// ---------- 字符集定义 ----------

// 基础拉丁 + 数字 + 常用标点 (保留范围, 与 en 槽位的用途对应)
struct Range {
    hb_codepoint_t first;
    hb_codepoint_t last;
};

// 完整范围 (默认): 覆盖拉丁、希腊、西里尔与常用符号。
// 为何不默认收窄: 西里尔/希腊字母虽不常用, 但缺字会直接显示豆腐块,
// 而它们只占几十 KB —— 相对原字体 (常达数十 MB) 可忽略, 不值得为体积冒险。
static const Range kLatinRanges[] = {
    {0x0000, 0x00FF},  // 拉丁字母补充 (Basic Latin + Latin-1)
    {0x0100, 0x024F},  // 拉丁字母扩展 A/B
    {0x0250, 0x036F},  // 国际音标 / 修饰字母 / 组合附加符号 (重音排版必需)
    {0x0370, 0x03FF},  // 希腊字母
    {0x0400, 0x04FF},  // 西里尔字母
    {0x2000, 0x206F},  // 常用标点 (省略号、破折号、各类空格)
    {0x2070, 0x209F},  // 上下标
    {0x20A0, 0x20CF},  // 货币符号
    {0x2100, 0x214F},  // 字母式符号
    {0x2150, 0x218F},  // 数字形式 (分数等)
    {0x2190, 0x21FF},  // 箭头
    {0x2200, 0x22FF},  // 数学运算符
    {0x2460, 0x24FF},  // 带圈数字
    {0x25A0, 0x26FF},  // 几何图形 / 杂项符号
    {0x3000, 0x303F},  // CJK 标点 (中文排版需要, 但不算「汉字字形」)
    {0xFF00, 0xFFEF},  // 全角形式 (全角标点/字母)
};

// 精简范围 (-minimal): 仅 ASCII + 西欧 + 常用标点。
// 适用于明确只要英文/数字的场景, 体积更小; 代价是希腊/西里尔等会缺字。
static const Range kMinimalRanges[] = {
    {0x0000, 0x00FF},  // Basic Latin + Latin-1 (含西欧重音字母)
    {0x0100, 0x017F},  // 拉丁字母扩展 A
    {0x2000, 0x206F},  // 常用标点
    {0x20A0, 0x20CF},  // 货币符号
    {0xFF00, 0xFFEF},  // 全角形式
};

// CJK 判定范围: 命中即认为该字体自带中文字形, 需要子集化
static const Range kCjkRanges[] = {
    {0x3400, 0x4DBF},    // CJK 扩展 A
    {0x4E00, 0x9FFF},    // CJK 统一表意文字
    {0xF900, 0xFAFF},    // CJK 兼容表意文字
    {0x20000, 0x2A6DF},  // CJK 扩展 B
    {0x2A700, 0x2EBEF},  // CJK 扩展 C-F
    {0x2F800, 0x2FA1F},  // CJK 兼容表意文字补充
    {0x30000, 0x323AF},  // CJK 扩展 G-I
    {0x3040, 0x30FF},    // 日文假名 (CJK 字体通常连带覆盖)
    {0xAC00, 0xD7AF},    // 谚文音节
};

template <size_t N>
static void addRanges(hb_set_t *set, const Range (&ranges)[N], hb_face_t *face) {
    // 用 hb_set_add_range 逐段加入; harfbuzz 会与实际 cmap 求交,
    // 因此不存在的字形范围不会带来额外体积
    for (const auto &r : ranges) {
        hb_set_add_range(set, r.first, r.last);
    }
    (void) face;
}

// 统计指定范围内字体实际覆盖的码点数
template <size_t N>
static unsigned countCoverage(hb_face_t *face, const Range (&ranges)[N]) {
    hb_set_t *faceUnicodes = hb_set_create();
    hb_face_collect_unicodes(face, faceUnicodes);
    unsigned total = 0;
    for (const auto &r : ranges) {
        hb_set_t *probe = hb_set_create();
        hb_set_add_range(probe, r.first, r.last);
        hb_set_intersect(probe, faceUnicodes);
        total += hb_set_get_population(probe);
        hb_set_destroy(probe);
    }
    hb_set_destroy(faceUnicodes);
    return total;
}

// 度量载体模式 (-metrics, issue #17) 保留的码点: 仅各类空格。
//
// 目的不是裁文字, 而是把一份现成字体「内部挖空」: 只留 .notdef 与空格字形,
// 行距与空格字宽等度量 (hhea / OS/2 / hmtx) 原样保留, 得到一个没有文字字形、
// 却能提供标准行字距的度量载体, 作为 fonts.xml 家族首个条目充当 base 字体
// (Android 的 paint 度量取自家族里与请求字重最接近的条目)。
//
// 为什么连空格也保留: 这是该字体唯一能影响「字距」的地方 —— 文字仍由用户
// 选择的字体渲染, 只有空格宽度被钉在这份标准上。
static const hb_codepoint_t kMetricsSpaceCodes[] = {
    0x0020,  // 空格
    0x00A0,  // 不换行空格
    0x3000,  // 全角空格
};

// ---------- 行距度量改写 (-line-metrics, issue #17) ----------
//
// 为什么必须改字体本身: Android 的行高是「paint 度量」与「该行实际使用字体度量」的
// 并集 (StaticLayout: lineAscent = min(paint 上升部, 该行字体的上升部)), 也就是说只能
// 抬高、不能压低。只要装入 system/fonts 的字体度量各不相同, 换字体行距就会变;
// 把一个只有度量的载体放在家族首位也压不住比它更高的字体。
//
// 因此这里把字体的行距度量按比例缩放到统一总量 (上下比例保持不变, 避免基线位移过大),
// 装进去的字体行距一致了, 换字体行距才真正固定。只改 hhea / OS/2 的度量字段,
// 字形、hmtx、布局表原样保留, 表的长度不变, 因此无需重建文件布局。

static uint16_t rdU16(const unsigned char *p, size_t off) {
    return static_cast<uint16_t>((p[off] << 8) | p[off + 1]);
}
static int16_t rdI16(const unsigned char *p, size_t off) {
    return static_cast<int16_t>(rdU16(p, off));
}
static uint32_t rdU32(const unsigned char *p, size_t off) {
    return (static_cast<uint32_t>(p[off]) << 24) | (static_cast<uint32_t>(p[off + 1]) << 16) |
           (static_cast<uint32_t>(p[off + 2]) << 8) | static_cast<uint32_t>(p[off + 3]);
}
static void wrU16(unsigned char *p, size_t off, uint16_t v) {
    p[off] = static_cast<unsigned char>(v >> 8);
    p[off + 1] = static_cast<unsigned char>(v & 0xff);
}
static void wrI16(unsigned char *p, size_t off, int v) {
    wrU16(p, off, static_cast<uint16_t>(static_cast<int16_t>(v)));
}
static void wrU32(unsigned char *p, size_t off, uint32_t v) {
    p[off] = static_cast<unsigned char>(v >> 24);
    p[off + 1] = static_cast<unsigned char>((v >> 16) & 0xff);
    p[off + 2] = static_cast<unsigned char>((v >> 8) & 0xff);
    p[off + 3] = static_cast<unsigned char>(v & 0xff);
}

// 表校验和: 按 4 字节求和, 末尾不足 4 字节补 0
static uint32_t tableChecksum(const unsigned char *data, size_t len) {
    uint32_t sum = 0;
    for (size_t i = 0; i < len; i += 4) {
        uint32_t word = 0;
        for (size_t j = 0; j < 4; j++) {
            word <<= 8;
            if (i + j < len) word |= data[i + j];
        }
        sum += word;
    }
    return sum;
}

// sfnt 目录项定位
struct TableRef {
    size_t dirOffset = 0;  // 目录项在文件中的位置 (改写校验和用)
    size_t offset = 0;     // 表数据偏移
    size_t length = 0;
    bool found = false;
};

// 各 face 的偏移表起点。单体 sfnt 返回 {0}; 字体集合 (ttcf, 即 .ttc/.otc) 返回每个 face。
// 集合里的 face 共享底层表(通常连 head/hhea 都是同一份), 因此调用方需要按表偏移去重。
static std::vector<size_t> sfntFaces(const unsigned char *data, size_t size) {
    std::vector<size_t> faces;
    if (size < 12) return faces;
    if (rdU32(data, 0) == 0x74746366u) {  // 'ttcf'
        uint32_t numFonts = rdU32(data, 8);
        // 防止异常文件里的巨大值导致越界循环
        if (numFonts > 1024) return faces;
        for (uint32_t i = 0; i < numFonts; i++) {
            size_t p = 12 + i * 4;
            if (p + 4 > size) break;
            size_t off = rdU32(data, p);
            if (off + 12 <= size) faces.push_back(off);
        }
        return faces;
    }
    uint32_t version = rdU32(data, 0);
    if (version != 0x00010000u && version != 0x4F54544Fu && version != 0x74727565u) return faces;
    faces.push_back(0);
    return faces;
}

static TableRef findTable(const unsigned char *data, size_t size, const char *tag, size_t face) {
    TableRef ref;
    if (face + 12 > size) return ref;
    unsigned numTables = rdU16(data, face + 4);
    for (unsigned i = 0; i < numTables; i++) {
        size_t dir = face + 12 + i * 16;
        if (dir + 16 > size) return ref;
        if (memcmp(data + dir, tag, 4) != 0) continue;
        ref.dirOffset = dir;
        ref.offset = rdU32(data, dir + 8);
        ref.length = rdU32(data, dir + 12);
        if (ref.offset + ref.length > size) return ref;
        ref.found = true;
        return ref;
    }
    return ref;
}

// upem (head 表偏移 18 处的 uint16)
static unsigned unitsPerEm(const unsigned char *data, size_t size) {
    for (size_t face : sfntFaces(data, size)) {
        TableRef head = findTable(data, size, "head", face);
        if (head.found && head.length >= 20) return rdU16(data, head.offset + 18);
    }
    return 0;
}

// 把行距总量缩放到 targetTotal (字体单位), 上下比例保持; 返回是否改动。
// 支持字体集合 (.ttc/.otc): 逐个 face 处理, 按表偏移去重 —— 集合里多个 face 常共享
// 同一份 hhea/OS/2, 重复改写会把已经缩放的度量再缩放一次。
static bool scaleLineMetrics(std::vector<unsigned char> &buf, unsigned targetTotal, int &oldAsc,
                             int &oldDesc, int &newAsc, int &newDesc) {
    unsigned char *data = buf.data();
    size_t size = buf.size();

    std::vector<size_t> faces = sfntFaces(data, size);
    if (faces.empty()) return false;

    auto seen = [](const std::vector<size_t> &v, size_t off) {
        for (size_t x : v) {
            if (x == off) return true;
        }
        return false;
    };

    std::vector<size_t> patched;      // 已改写的 hhea / OS2 表偏移
    std::vector<size_t> headOffsets;  // 待重算 checkSumAdjustment 的 head 表偏移
    bool any = false, reported = false;

    for (size_t face : faces) {
        TableRef head = findTable(data, size, "head", face);
        if (head.found && !seen(headOffsets, head.offset)) headOffsets.push_back(head.offset);

        TableRef hhea = findTable(data, size, "hhea", face);
        if (!hhea.found || hhea.length < 10 || seen(patched, hhea.offset)) continue;

        const int asc = rdI16(data, hhea.offset + 4);
        const int desc = rdI16(data, hhea.offset + 6);
        const int gap = rdI16(data, hhea.offset + 8);

        // 原始总量: 上升部 + 下降部 + 行间隙 (行间隙归零后并入上升部)
        const int total = asc - desc + gap;
        if (total <= 0) continue;

        // 按原始上下比例分配目标总量 (比例保持不变 → 基线位置不跳变)
        const int upper = asc + gap;
        const int na = static_cast<int>(static_cast<long long>(targetTotal) * upper / total);
        const int nd = na - static_cast<int>(targetTotal);
        if (na <= 0 || nd >= 0) continue;

        if (!reported) {
            oldAsc = asc;
            oldDesc = desc;
            newAsc = na;
            newDesc = nd;
            reported = true;
        }

        wrI16(data, hhea.offset + 4, na);
        wrI16(data, hhea.offset + 6, nd);
        wrI16(data, hhea.offset + 8, 0);
        patched.push_back(hhea.offset);

        // OS/2 (版本 0 起字段位置一致): sTypo 与 usWin 一起改, 避免不同渲染路径取到不同值
        TableRef os2 = findTable(data, size, "OS/2", face);
        if (os2.found && os2.length >= 78 && !seen(patched, os2.offset)) {
            wrI16(data, os2.offset + 68, na);
            wrI16(data, os2.offset + 70, nd);
            wrI16(data, os2.offset + 72, 0);
            wrU16(data, os2.offset + 74, static_cast<uint16_t>(na));
            wrU16(data, os2.offset + 76, static_cast<uint16_t>(-nd));
            patched.push_back(os2.offset);
        }
        any = true;
    }

    if (!any) return false;

    // 表校验和: 更新所有引用了被改写表的目录项 (集合里可能多个 face 指向同一张表)
    for (size_t face : faces) {
        unsigned numTables = rdU16(data, face + 4);
        for (unsigned i = 0; i < numTables; i++) {
            size_t dir = face + 12 + i * 16;
            if (dir + 16 > size) break;
            size_t off = rdU32(data, dir + 8);
            size_t len = rdU32(data, dir + 12);
            if (!seen(patched, off) || off + len > size) continue;
            wrU32(data, dir + 4, tableChecksum(data + off, len));
        }
    }

    // head.checkSumAdjustment: 先把所有 head 的该字段归零, 再对全文件求和一次,
    // 最后写回同一个值 —— 集合 (.ttc) 里可能有多个 head, 逐个头累加会因为前一个
    // 已经写入的值而算错。
    for (size_t ho : headOffsets) wrU32(data, ho + 8, 0);
    const uint32_t adjustment = 0xB1B0AFBAu - tableChecksum(data, size);
    for (size_t ho : headOffsets) wrU32(data, ho + 8, adjustment);
    return true;
}

// ---------- 文件读写 ----------

static bool readFile(const char *path, std::vector<char> &out) {
    FILE *f = fopen(path, "rb");
    if (!f) return false;
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (n <= 0) {
        fclose(f);
        return false;
    }
    out.resize(static_cast<size_t>(n));
    size_t got = fread(out.data(), 1, out.size(), f);
    fclose(f);
    return got == out.size();
}

static bool writeFile(const char *path, const char *data, size_t len) {
    FILE *f = fopen(path, "wb");
    if (!f) return false;
    size_t put = fwrite(data, 1, len, f);
    fclose(f);
    return put == len;
}

// ---------- 主流程 ----------

static void usage(const char *argv0) {
    fprintf(stderr,
            "用法:\n"
            "  %s -check <font.ttf>                 检测是否含 CJK 字形 (含则退出码 1)\n"
            "  %s -in <font.ttf> -out <out.ttf>     生成英文子集\n"
            "    [-minimal]                         仅保留 ASCII/西欧 (默认含希腊/西里尔)\n"
            "    [-keep-cjk]                        额外保留 CJK 区块 (默认不保留)\n"
            "  %s -metrics -in <font.ttf> -out <out.ttf>\n"
            "                                       挖空: 只留度量与空格, 用作行距字距载体\n"
            "  %s -line-metrics -in <font.ttf> -out <out.ttf> -line-total <permille>\n"
            "                                       把行距度量缩放到统一总量 (千分比 em)\n",
            argv0, argv0, argv0, argv0);
}

int main(int argc, char **argv) {
    const char *checkPath = nullptr;
    const char *inPath = nullptr;
    const char *outPath = nullptr;
    bool keepCjk = false;
    bool minimal = false;
    bool metricsMode = false;
    bool lineMetricsMode = false;
    int lineTotal = 0;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-check") == 0 && i + 1 < argc) {
            checkPath = argv[++i];
        } else if (strcmp(argv[i], "-in") == 0 && i + 1 < argc) {
            inPath = argv[++i];
        } else if (strcmp(argv[i], "-out") == 0 && i + 1 < argc) {
            outPath = argv[++i];
        } else if (strcmp(argv[i], "-line-total") == 0 && i + 1 < argc) {
            lineTotal = atoi(argv[++i]);
        } else if (strcmp(argv[i], "-keep-cjk") == 0) {
            keepCjk = true;
        } else if (strcmp(argv[i], "-minimal") == 0) {
            minimal = true;
        } else if (strcmp(argv[i], "-metrics") == 0) {
            metricsMode = true;
        } else if (strcmp(argv[i], "-line-metrics") == 0) {
            lineMetricsMode = true;
        } else if (strcmp(argv[i], "-h") == 0 || strcmp(argv[i], "--help") == 0) {
            usage(argv[0]);
            return 0;
        } else {
            fprintf(stderr, "[x] 未知参数: %s\n", argv[i]);
            usage(argv[0]);
            return 2;
        }
    }

    // ---- 检测模式 ----
    if (checkPath) {
        std::vector<char> data;
        if (!readFile(checkPath, data)) {
            fprintf(stderr, "[x] 无法读取: %s\n", checkPath);
            return 2;
        }
        hb_blob_t *blob = hb_blob_create(data.data(), data.size(), HB_MEMORY_MODE_READONLY, nullptr, nullptr);
        hb_face_t *face = hb_face_create(blob, 0);
        if (hb_face_get_glyph_count(face) == 0) {
            fprintf(stderr, "[x] 不是有效的字体文件: %s\n", checkPath);
            hb_face_destroy(face);
            hb_blob_destroy(blob);
            return 2;
        }
        unsigned cjk = countCoverage(face, kCjkRanges);
        unsigned latin = countCoverage(face, kLatinRanges);
        hb_face_destroy(face);
        hb_blob_destroy(blob);
        // 输出统计, 供调用方展示 (stdout 保持机器可读)
        printf("cjk=%u latin=%u\n", cjk, latin);
        // 含 CJK 字形 → 退出码 1 (需要子集化)
        return cjk > 0 ? 1 : 0;
    }

    // ---- 行距度量改写模式 ----
    if (lineMetricsMode) {
        if (!inPath || !outPath || lineTotal <= 0) {
            fprintf(stderr, "[x] 需要 -in / -out 与 -line-total <千分比 em>\n");
            usage(argv[0]);
            return 2;
        }
        std::vector<char> src;
        if (!readFile(inPath, src)) {
            fprintf(stderr, "[x] 无法读取: %s\n", inPath);
            return 2;
        }
        std::vector<unsigned char> buf(src.begin(), src.end());
        unsigned upem = unitsPerEm(buf.data(), buf.size());
        if (upem == 0) {
            fprintf(stderr, "[x] 不是可解析的字体 (缺少 head 表): %s\n", inPath);
            return 2;
        }
        unsigned target = static_cast<unsigned>(static_cast<long long>(upem) * lineTotal / 1000);
        int oldAsc = 0, oldDesc = 0, newAsc = 0, newDesc = 0;
        if (!scaleLineMetrics(buf, target, oldAsc, oldDesc, newAsc, newDesc)) {
            fprintf(stderr, "[x] 改写行距度量失败 (不受支持的字体结构): %s\n", inPath);
            return 1;
        }
        if (!writeFile(outPath, reinterpret_cast<const char *>(buf.data()), buf.size())) {
            fprintf(stderr, "[x] 写入失败: %s\n", outPath);
            return 1;
        }
        // 机器可读: 旧/新度量与每 em 占比, 供调用方在日志中核对
        printf("line_metrics upem=%u old=%d/%d new=%d/%d total=%u\n", upem, oldAsc, oldDesc,
               newAsc, newDesc, target);
        return 0;
    }

    // ---- 子集化模式 ----
    if (!inPath || !outPath) {
        usage(argv[0]);
        return 2;
    }

    std::vector<char> data;
    if (!readFile(inPath, data)) {
        fprintf(stderr, "[x] 无法读取: %s\n", inPath);
        return 2;
    }
    hb_blob_t *blob = hb_blob_create(data.data(), data.size(), HB_MEMORY_MODE_READONLY, nullptr, nullptr);
    hb_face_t *face = hb_face_create(blob, 0);
    if (hb_face_get_glyph_count(face) == 0) {
        fprintf(stderr, "[x] 不是有效的字体文件: %s\n", inPath);
        hb_face_destroy(face);
        hb_blob_destroy(blob);
        return 2;
    }

    hb_subset_input_t *input = hb_subset_input_create_or_fail();
    if (!input) {
        fprintf(stderr, "[x] 初始化子集器失败\n");
        hb_face_destroy(face);
        hb_blob_destroy(blob);
        return 1;
    }

    hb_set_t *unicodes = hb_subset_input_unicode_set(input);
    if (metricsMode) {
        for (hb_codepoint_t cp : kMetricsSpaceCodes) hb_set_add(unicodes, cp);
    } else if (minimal) {
        addRanges(unicodes, kMinimalRanges, face);
    } else {
        addRanges(unicodes, kLatinRanges, face);
    }
    if (!metricsMode && keepCjk) addRanges(unicodes, kCjkRanges, face);

    // NOTDEF_OUTLINE: 保留 .notdef 字形轮廓。缺失时部分渲染器会显示空白框异常。
    // 度量载体不需要: 它只覆盖空格, .notdef 永远不会被用到, 留空更小。
    if (!metricsMode) hb_subset_input_set_flags(input, HB_SUBSET_FLAGS_NOTDEF_OUTLINE);
    // 注: 不设置 NO_HINTING —— 保留渲染提示, 小字号下更清晰
    // 注: 不设置 NO_LAYOUT_CLOSURE —— 保留 GSUB/GPOS 闭包, 连字与字距正常

    hb_face_t *subset = hb_subset_or_fail(face, input);
    if (!subset) {
        fprintf(stderr, "[x] 子集化失败 (字体可能损坏或格式不受支持)\n");
        hb_subset_input_destroy(input);
        hb_face_destroy(face);
        hb_blob_destroy(blob);
        return 1;
    }

    hb_blob_t *outBlob = hb_face_reference_blob(subset);
    unsigned int len = 0;
    const char *ptr = hb_blob_get_data(outBlob, &len);
    if (!ptr || len == 0 || !writeFile(outPath, ptr, len)) {
        fprintf(stderr, "[x] 写入失败: %s\n", outPath);
        hb_blob_destroy(outBlob);
        hb_face_destroy(subset);
        hb_subset_input_destroy(input);
        hb_face_destroy(face);
        hb_blob_destroy(blob);
        return 1;
    }

    // 校验子集确实不含 CJK 字形 (除非显式要求保留)
    unsigned residual = 0;
    if (!keepCjk) {
        residual = countCoverage(subset, kCjkRanges);
    }
    printf("in=%zu out=%u residual_cjk=%u\n", data.size(), len, residual);

    // 度量载体: 报告挖空后剩下的度量, 调用方据此在日志里确认行距来源与量级
    if (metricsMode) {
        hb_font_t *metricsFont = hb_font_create(subset);
        hb_font_extents_t ext;
        memset(&ext, 0, sizeof(ext));
        if (hb_font_get_h_extents(metricsFont, &ext)) {
            printf("metrics ascender=%d descender=%d line_gap=%d\n",
                   static_cast<int>(ext.ascender), static_cast<int>(ext.descender),
                   static_cast<int>(ext.line_gap));
        }
        hb_font_destroy(metricsFont);
    }

    hb_blob_destroy(outBlob);
    hb_face_destroy(subset);
    hb_subset_input_destroy(input);
    hb_face_destroy(face);
    hb_blob_destroy(blob);

    // 子集后仍残留 CJK 说明裁剪未达预期, 应视为失败以免用户以为已生效
    if (residual > 0) {
        fprintf(stderr, "[!] 子集后仍含 %u 个 CJK 码点\n", residual);
        return 1;
    }
    return 0;
}
