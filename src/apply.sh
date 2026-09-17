#!/system/bin/sh
# shellcheck shell=ash
# FontMM apply.sh — 应用字体: 把 FONTS/ 里的字体安装到 system/fonts
# 用法: apply.sh [模块目录]   默认 /data/adb/modules/FontMM
# 回退逻辑: hant/en 缺失时回退到 hans; mono/emoji 缺失时恢复系统原字体
MODDIR="${1:-/data/adb/modules/FontMM}"
FONTS_DIR="$MODDIR/FONTS"
SYS_FONT_DIR="$MODDIR/system/fonts"

# 注意: SysFont-Regular.ttf 是 fonts.xml 中 sans-serif 家族第一位的默认字体,
# 作为西文槽位处理 (中文字体自带西文字形, 若同时占用该槽位会覆盖西文字体, issue #6)
hans_fonts='SysSans-Hans-Regular.ttf
SysFont-Static-Regular.ttf
SysFont-Myanmar.ttf
SysFont-Hans-Regular.ttf'
hant_fonts='SysSans-Hant-Regular.ttf
SysFont-Hant-Regular.ttf'
en_fonts='SysSans-En-Regular.ttf
SysFont-Regular.ttf'

[ -f "$FONTS_DIR/hans.ttf" ] || {
    echo "[✗] FONTS/hans.ttf 不存在, 请先在 WebUI 选择字体"
    exit 1
}

mkdir -p "$SYS_FONT_DIR"

install_from() {
    local src="$1" list="$2" line=""
    while IFS= read -r line; do
        cp -f "$src" "$SYS_FONT_DIR/$line" || {
            echo "[✗] 复制 $line 失败"
            exit 1
        }
        echo "[*] 安装: $line"
    done <<EOF
$list
EOF
}

# 执行模块内的原生工具。
# 刷入后 tools/ 下的文件权限是 0644 (KernelSU 解压时不保留 zip 里的执行位),
# 因此不能靠 -x 判断可用性, 而是执行前临时加执行位、执行后立即还原,
# 避免长期留下可执行文件。退出码为工具自身的退出码, 工具缺失返回 127。
run_tool() {
    local tool="$1"
    shift
    [ -f "$tool" ] || return 127
    chmod 0755 "$tool" 2>/dev/null
    "$tool" "$@"
    local rc=$?
    chmod 0644 "$tool" 2>/dev/null
    return "$rc"
}

# 准备英文字体: 含 CJK 字形时裁成纯拉丁子集, 否则原样使用 (issue #10)
# 用法: prepare_english_font <源字体> <子集输出路径>
# 成功 (含子集化) 时输出子集路径; 无需处理或工具不可用时返回非 0, 调用方回退原字体。
#
# 不做结果缓存: 实测检测与子集化各约 13-21ms (x86; 设备端同量级),
# 每次重算比维护缓存 (失效判断、陈旧文件清理) 更简单可靠。
prepare_english_font() {
    local src="$1"
    local out="$2"
    local tool="$MODDIR/tools/fontmm-subset"

    [ -f "$src" ] || return 1

    # 工具缺失 (旧版本模块升级、文件被删): 跳过, 用原字体
    if [ ! -f "$tool" ]; then
        echo "[-] 未找到字体子集化工具, 跳过英文子集化"
        return 1
    fi

    # 先检测是否含 CJK: 不含则无需处理 (常见情况, 无额外开销)
    # 退出码: 0=不含 CJK, 1=含 CJK, 2=文件无效/读取失败, 126/127=工具无法执行
    # 只有明确返回 1 (含 CJK) 才做子集化; 其余情况一律跳过,
    # 避免工具损坏时还去调用一次子集化 (那样会误报「子集化失败」)
    run_tool "$tool" -check "$src" >/dev/null 2>&1
    local rc=$?

    if [ "$rc" -eq 0 ]; then
        echo "[-] 英文字体不含 CJK 字形, 无需子集化"
        return 1
    fi
    if [ "$rc" -ne 1 ]; then
        echo "[-] 无法检测字体 (工具返回 $rc), 跳过英文子集化"
        return 1
    fi

    echo "[*] 英文字体含 CJK 字形, 生成拉丁子集..."
    if ! run_tool "$tool" -in "$src" -out "$out" 2>&1; then
        # 子集化失败不阻断安装: 退回原字体, 并提示可能出现的问题
        echo "[!] 子集化失败, 使用原字体 (中文可能被英文字体的字形覆盖)"
        rm -f "$out"
        return 1
    fi

    echo "[✓] 已生成子集, 汉字字形不再覆盖中文字体"
    return 0
}

echo "[*] 安装简体字体..."
install_from "$FONTS_DIR/hans.ttf" "$hans_fonts"

echo "[*] 处理繁体字体..."
if [ -f "$FONTS_DIR/hant.ttf" ]; then
    install_from "$FONTS_DIR/hant.ttf" "$hant_fonts"
else
    echo "[-] 未设置繁体, 回退使用简体"
    install_from "$FONTS_DIR/hans.ttf" "$hant_fonts"
fi

# 英文槽位: 若 en.ttf 自带 CJK 字形需先子集化 (issue #10)
# fonts.xml 中 sans-serif / sys-sans-en 排在 zh-Hans / zh-Hant 之前, 因此 en.ttf
# 里的汉字字形会被用于中文渲染, 盖掉 hans.ttf / hant.ttf, 表现为「中文没换干净」。
# Android 的 fonts.xml 无法限定字体只负责英文, 所以只能在应用前把 CJK 裁掉。
echo "[*] 处理英文&数字..."
EN_SUBSET="$FONTS_DIR/.en-subset.ttf"
EN_SRC="$FONTS_DIR/en.ttf"
if [ ! -f "$FONTS_DIR/en.ttf" ]; then
    echo "[-] 未设置英文, 回退使用简体"
    rm -f "$EN_SUBSET" # 清理上一次留下的子集, 避免残留
    # 未选西文时仍用简体覆盖英文槽位; 西文字体在 fonts.xml 中排最前,
    # 简体仅在缺字形时兜底 (issue #6)
    install_from "$FONTS_DIR/hans.ttf" "$en_fonts"
else
    # 子集化成功则改用子集文件, 否则沿用原字体 (失败不阻断安装)。
    # 未用子集时清掉上次留下的文件, 使 FONTS/.en-subset.ttf 的存在即代表
    # 「本次应用确实用了子集」—— WebUI 据此展示裁切结果 (issue #14)
    if prepare_english_font "$FONTS_DIR/en.ttf" "$EN_SUBSET"; then
        EN_SRC="$EN_SUBSET"
    else
        rm -f "$EN_SUBSET"
    fi
    install_from "$EN_SRC" "$en_fonts"
fi

echo "[*] 处理等宽字体..."
if [ -f "$FONTS_DIR/mono.ttf" ]; then
    # 直接替换系统等宽字体 DroidSansMono.ttf (overlay 生效)
    install_from "$FONTS_DIR/mono.ttf" 'DroidSansMono.ttf'
else
    echo "[-] 未设置等宽字体, 恢复系统等宽字体"
    rm -f "$SYS_FONT_DIR/DroidSansMono.ttf"
fi

echo "[*] 处理 Emoji 字体..."
if [ -f "$FONTS_DIR/emoji.ttf" ]; then
    # 首次设置前备份模块内嵌的补充字库 NotoColorEmoji.ttf, 供清除时恢复
    if [ -f "$SYS_FONT_DIR/NotoColorEmoji.ttf" ] && [ ! -f "$MODDIR/backup/NotoColorEmoji.ttf" ]; then
        mkdir -p "$MODDIR/backup"
        cp -f "$SYS_FONT_DIR/NotoColorEmoji.ttf" "$MODDIR/backup/NotoColorEmoji.ttf"
    fi
    # 直接替换系统 emoji 字体 NotoColorEmoji.ttf (overlay 生效)
    install_from "$FONTS_DIR/emoji.ttf" 'NotoColorEmoji.ttf'
else
    echo "[-] 未设置 Emoji 字体, 恢复默认"
    if [ -f "$MODDIR/backup/NotoColorEmoji.ttf" ]; then
        cp -f "$MODDIR/backup/NotoColorEmoji.ttf" "$SYS_FONT_DIR/NotoColorEmoji.ttf"
    fi
fi

echo "[*] 全部完成, 重启后生效"
