#!/system/bin/sh
# shellcheck shell=ash
# FontMM apply.sh — 应用字体: 把 FONTS/ 里的字体安装到 system/fonts
# 用法: apply.sh [模块目录]   默认 /data/adb/modules/FontMM
# 回退逻辑: hant/en 缺失时回退到 hans; mono 缺失时不覆盖系统等宽字体
MODDIR="${1:-/data/adb/modules/FontMM}"
FONTS_DIR="$MODDIR/FONTS"
SYS_FONT_DIR="$MODDIR/system/fonts"

hans_fonts='SysSans-Hans-Regular.ttf
SysFont-Static-Regular.ttf
SysFont-Myanmar.ttf
SysFont-Hans-Regular.ttf
SysFont-Regular.ttf'
hant_fonts='SysSans-Hant-Regular.ttf
SysFont-Hant-Regular.ttf'
en_fonts='SysSans-En-Regular.ttf'

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

echo "[*] 安装简体字体..."
install_from "$FONTS_DIR/hans.ttf" "$hans_fonts"

echo "[*] 处理繁体字体..."
if [ -f "$FONTS_DIR/hant.ttf" ]; then
    install_from "$FONTS_DIR/hant.ttf" "$hant_fonts"
else
    echo "[-] 未设置繁体, 回退使用简体"
    install_from "$FONTS_DIR/hans.ttf" "$hant_fonts"
fi

echo "[*] 处理英文&数字..."
if [ -f "$FONTS_DIR/en.ttf" ]; then
    install_from "$FONTS_DIR/en.ttf" "$en_fonts"
else
    echo "[-] 未设置英文, 回退使用简体"
    install_from "$FONTS_DIR/hans.ttf" "$en_fonts"
fi

echo "[*] 处理等宽字体..."
if [ -f "$FONTS_DIR/mono.ttf" ]; then
    install_from "$FONTS_DIR/mono.ttf" 'DroidSansMono.ttf'
else
    echo "[-] 未设置等宽字体, 不覆盖系统 DroidSansMono.ttf"
    rm -f "$SYS_FONT_DIR/DroidSansMono.ttf"
fi

echo "[*] 全部完成, 重启后生效"
