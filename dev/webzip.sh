#!/usr/bin/env bash
set -euo pipefail

# dev/webzip.sh — 仅把构建产物 src/webroot 压缩为 dist/webroot.zip (调试 WebUI 用)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT_DIR/src/webroot"
OUT="$ROOT_DIR/dist/webroot.zip"

command -v zip >/dev/null 2>&1 || {
    echo "[!] 未找到 zip 命令, 请先安装" >&2
    exit 1
}

[ -d "$SRC" ] || {
    echo "[!] $SRC 不存在, 请先执行 pnpm -C web build" >&2
    exit 1
}

mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"

# zip 根 = webroot 内容 (不含 webroot 这层目录)
(
    cd "$SRC"
    zip -r -9 "$OUT" . \
        -x '*.git*' \
        -x '*.DS_Store'
)

echo "[✓] 已打包: $OUT ($(du -h "$OUT" | cut -f1))"
