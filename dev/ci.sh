#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

# ---------- Termux 兼容 ----------
# Termux 的 shellcheck / shfmt 安装在 app 私有目录, 需手动加入 PATH 与 LD_LIBRARY_PATH;
# 其他环境 (Linux/macOS 等) 直接使用系统 PATH 中的工具
if [ -n "${PREFIX:-}" ] && [ -d "$PREFIX/bin" ]; then
    export PATH="$PREFIX/bin:${PATH}"
    export LD_LIBRARY_PATH="$PREFIX/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
elif [ -d /data/user/0/com.termux/files/usr/bin ]; then
    export PATH="/data/user/0/com.termux/files/usr/bin:${PATH}"
    export LD_LIBRARY_PATH="/data/user/0/com.termux/files/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi

# 工具可用性检查
command -v shellcheck >/dev/null 2>&1 || {
    echo "[!] 未找到 shellcheck, 请先安装" >&2
    exit 1
}
command -v shfmt >/dev/null 2>&1 || {
    echo "[!] 未找到 shfmt, 请先安装" >&2
    exit 1
}

shopt -s nullglob globstar
files=("$SCRIPT_DIR/src"/**/*.sh)

for f in "${files[@]}"; do
    echo "> Checking: $f"
    shellcheck "$f" || exit 1
done

for f in "${files[@]}"; do
    echo "> Formatting: $f"
    shfmt -i 4 -w -d "$f"
done
