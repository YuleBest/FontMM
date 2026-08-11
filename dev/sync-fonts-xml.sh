#!/usr/bin/env bash
set -euo pipefail

# dev/sync-fonts-xml.sh — 以 fonts.xml 为唯一源, 复制生成各派生字体配置 (仅开发期用)
# 注意: 该脚本仅用于开发期本地对照/调试; 模块打包 (dev/cd.sh) 不再包含派生配置,
#       由刷入脚本 (src/customize.sh) 在设备端扫描系统 XML 生成, 提升兼容性 (issue #7)

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
