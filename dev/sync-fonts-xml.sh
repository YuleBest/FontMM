#!/usr/bin/env bash
set -euo pipefail

# dev/sync-fonts-xml.sh — 以 fonts.xml 为唯一源, 复制生成各派生字体配置
# ColorOS 在不同场景加载 fonts.xml / fonts_base.xml / fonts_ule.xml / font_fallback.xml,
# 参考 MakeFontsGreatAgain 的做法, 开发阶段直接复制, 避免维护多份几乎重复的 XML

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT_DIR/src/system/etc/fonts.xml"

[ -f "$SRC" ] || {
    echo "[!] 找不到源文件: $SRC" >&2
    exit 1
}

DEST=(
    "$ROOT_DIR/src/system/etc/fonts_base.xml"
    "$ROOT_DIR/src/system/etc/fonts_ule.xml"
    "$ROOT_DIR/src/system/etc/font_fallback.xml"
    "$ROOT_DIR/src/system/system_ext/etc/fonts_base.xml"
    "$ROOT_DIR/src/system/system_ext/etc/fonts_ule.xml"
)

for f in "${DEST[@]}"; do
    cp -f "$SRC" "$f"
    echo "[✓] 已同步: $f"
done

echo "[✓] 完成, 共 ${#DEST[@]} 个派生文件"
