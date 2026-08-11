#!/usr/bin/env bash
set -euo pipefail

# dev/gen-sha256.sh — 生成模块可执行文件的 SHA256 校验文件
# 1. src/SHA256SUMS: 记录模块内脚本/二进制的 sha256 (随 zip 打包, 供设备端 verify-sha256.sh 校验)
# 2. dist/*.sha256: 记录打包产物 zip 的 sha256 (发布时作为 release asset)
#
# 用法: bash dev/gen-sha256.sh [--no-dist]
#   --no-dist: 只生成 src/SHA256SUMS, 跳过 dist 产物校验 (供 cd.sh 打包前调用)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/src"
DIST_DIR="$ROOT_DIR/dist"
NO_DIST=0
[ "${1:-}" = "--no-dist" ] && NO_DIST=1

command -v sha256sum >/dev/null 2>&1 || {
    echo "[!] 未找到 sha256sum 命令" >&2
    exit 1
}

# 生成 src/SHA256SUMS: 只收录可执行文件 (脚本/二进制), 路径相对模块根
# 注: SHA256SUMS 自身不收录 (自引用无意义)
gen_module_sum() {
    local out="$SRC_DIR/SHA256SUMS"
    local tmp
    tmp="$(mktemp)"

    local f=""
    while IFS= read -r f; do
        [ -z "$f" ] && continue
        local rel="${f#"$SRC_DIR"/}"
        sha256sum "$f" | awk -v r="$rel" '{ print $1 "  " r }' >>"$tmp"
    done < <(find "$SRC_DIR" -type f \
        \( -name '*.sh' -o -name 'fontmm-wght' -o -name 'update-binary' -o -name 'updater-script' \) \
        -not -path '*/webroot/*' | sort)

    mv "$tmp" "$out"
    echo "[✓] 已生成 $out ($(wc -l <"$out") 条可执行文件校验)"
}

# 生成 dist/*.sha256 (发布产物校验)
gen_dist_sum() {
    [ "$NO_DIST" -eq 1 ] && return 0
    [ -d "$DIST_DIR" ] || { echo "[-] 无 dist 目录, 跳过"; return 0; }
    local z=""
    while IFS= read -r z; do
        [ -z "$z" ] && continue
        sha256sum "$z" >"$z.sha256"
        echo "[✓] 已生成 ${z}.sha256"
    done < <(find "$DIST_DIR" -maxdepth 1 -name '*.zip' | sort)
}

gen_module_sum
gen_dist_sum

echo "[✓] SHA256 校验文件生成完成"
