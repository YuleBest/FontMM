#!/usr/bin/env bash
set -euo pipefail

# dev/cd.sh — 打包 FontMM 模块 (preplace / template 两版)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/src"
DIST_DIR="$ROOT_DIR/dist"
PROP_FILE="$SRC_DIR/module.prop"

command -v zip >/dev/null 2>&1 || {
    echo "[!] 未找到 zip 命令, 请先安装" >&2
    exit 1
}

# 1. 从 module.prop 读版本号: version=26.8.0-beta.1(260800001)
VERSION="$(sed -n 's/^version=//p' "$PROP_FILE" 2>/dev/null | head -n 1 | tr -d '\r' || true)"
if [ -z "$VERSION" ]; then
    echo "[!] 无法从 $PROP_FILE 读取 version 字段" >&2
    exit 1
fi

# 文件名安全化: 括号 -> 点 (GitHub Release 网页上传会把括号改写为点, 导致 URL 不一致)
# 26.8.0-beta.1(260800001) -> 26.8.0-beta.1.260800001
FILE_VERSION="$(printf '%s' "$VERSION" | sed 's/(/./g; s/)//g')"

PRE_OUT="$DIST_DIR/FontMM_v${FILE_VERSION}_preplace.zip"
TPL_OUT="$DIST_DIR/FontMM_v${FILE_VERSION}_template.zip"

mkdir -p "$DIST_DIR"
rm -f "$PRE_OUT" "$TPL_OUT"   # 先删旧的, 防止 zip 增量更新残留已删除的文件

# 0. 同步派生字体配置 (fonts.xml 为唯一源, 复制生成 fonts_base/ule/font_fallback 等)
bash "$ROOT_DIR/dev/sync-fonts-xml.sh"

# 0.5 交叉编译 fontmm-wght (Go -> android-arm64, 字重范围覆写用)
bash "$ROOT_DIR/dev/build-wght.sh"
# 保证工具二进制可执行 (zip 权限位 -> Magisk 安装后保持)
chmod 755 "$SRC_DIR/tools/fontmm-wght"

# 2. 打包函数: $1=输出路径, $2=额外排除模式 (可选)
#    (zip 根 = 模块根, 不含 src 这层目录)
pack() {
    local out="$1" extra="${2:-}"
    local args=(-r -2 "$out" . -x '*.git*' -x '*.DS_Store' -x '*.swp' -x '*~' -x '*.bak')
    if [ -n "$extra" ]; then
        args+=(-x "$extra")
    fi
    (
        cd "$SRC_DIR"
        zip "${args[@]}"
    )
}

echo "[*] 打包 preplace 版 (含预置字体)..."
pack "$PRE_OUT"
echo "[*] 打包 template 版 (FONT 目录为空)..."
pack "$TPL_OUT" 'FONTS/*'
# -x 'FONTS/*' 会连目录条目一起排除, 这里补回空的 FONTS/ 目录
(
    cd "$SRC_DIR"
    zip -g "$TPL_OUT" 'FONTS/'
)

# 3. 产物校验: 必须含 module.prop, 防止打包错目录
#    注意: 不能用 grep -q, 它匹配后立即退出会使上游 unzip 收到 SIGPIPE (141),
#    在 pipefail 下整个管道被判失败, 产生"缺少 module.prop"的偶发误报
check() {
    local out="$1"
    if ! unzip -l "$out" | grep 'module\.prop' >/dev/null; then
        echo "[!] 打包产物缺少 module.prop: $out" >&2
        exit 1
    fi
}
check "$PRE_OUT"
check "$TPL_OUT"

# 4. template 版校验: FONTS 目录必须不含字体文件 (保留空目录)
if unzip -l "$TPL_OUT" | grep 'FONTS/.*\.ttf' >/dev/null; then
    echo "[!] template 版不应包含 FONTS 字体文件" >&2
    exit 1
fi

echo "[✓] 打包完成:"
echo "  preplace: $PRE_OUT ($(du -h "$PRE_OUT" | cut -f1))"
echo "  template: $TPL_OUT ($(du -h "$TPL_OUT" | cut -f1))"
