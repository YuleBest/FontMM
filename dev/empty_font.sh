#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FONT_DIR="$SCRIPT_DIR/src/system/fonts"

# 字体清单（记得和 customize.sh 保持一致）
all_fonts='SysSans-Hans-Regular.ttf
SysFont-Static-Regular.ttf
SysFont-Myanmar.ttf
SysFont-Hans-Regular.ttf
SysFont-Regular.ttf
SysSans-Hant-Regular.ttf
SysFont-Hant-Regular.ttf
SysSans-En-Regular.ttf'

mkdir -p "$FONT_DIR"

count=0
while IFS= read -r font; do
    [ -z "$font" ] && continue
    : > "$FONT_DIR/$font"
    echo "[*] 已生成空字体: $font"
    count=$((count + 1))
done <<< "$all_fonts"

echo "[✓] 完成，共 $count 个空字体 -> $FONT_DIR"
