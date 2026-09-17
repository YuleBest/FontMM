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
            "    [-keep-cjk]                        额外保留 CJK 区块 (默认不保留)\n",
            argv0, argv0);
}

int main(int argc, char **argv) {
    const char *checkPath = nullptr;
    const char *inPath = nullptr;
    const char *outPath = nullptr;
    bool keepCjk = false;
    bool minimal = false;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-check") == 0 && i + 1 < argc) {
            checkPath = argv[++i];
        } else if (strcmp(argv[i], "-in") == 0 && i + 1 < argc) {
            inPath = argv[++i];
        } else if (strcmp(argv[i], "-out") == 0 && i + 1 < argc) {
            outPath = argv[++i];
        } else if (strcmp(argv[i], "-keep-cjk") == 0) {
            keepCjk = true;
        } else if (strcmp(argv[i], "-minimal") == 0) {
            minimal = true;
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
    if (minimal) {
        addRanges(unicodes, kMinimalRanges, face);
    } else {
        addRanges(unicodes, kLatinRanges, face);
    }
    if (keepCjk) addRanges(unicodes, kCjkRanges, face);

    // NOTDEF_OUTLINE: 保留 .notdef 字形轮廓。缺失时部分渲染器会显示空白框异常
    hb_subset_input_set_flags(input, HB_SUBSET_FLAGS_NOTDEF_OUTLINE);
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
