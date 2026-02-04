#!/bin/bash
# FontMM
# TTC 文件拆分
# By Yule
# shellcheck disable=SC2154

# 配置
SCRIPT_DIR="$(dirname "$(dirname "$(readlink -f "$0")")")"
WORK_DIR="$SCRIPT_DIR/WORK"
export PATH="$PATH:$SCRIPT_DIR/功能/bin"
FT_BIN="$SCRIPT_DIR/功能/bin/fonttool"
clear

# 环境检查
if ! command -v yq >/dev/null 2>&1; then
    echo -e "${re}[错误] 缺少 yq，请安装后重试${res}"
    exit 1
fi

mkdir -p "$WORK_DIR/ttc_separated"

echo -en "- 输入一个 TTC 文件完整路径："
read -r ttc_file

if [ ! -f "$ttc_file" ]; then
    echo "! $ttc_file 文件不存在"
    exit 1
fi

if ! file "$ttc_file" | grep -q "TrueType font collection"; then
    echo "! 这不是一个 TTC 文件"
    exit 2
fi

echo "~ 正在使用 fonttool 拆分 TTC..."
"$FT_BIN" split "$ttc_file" "$WORK_DIR/ttc_separated"

if [ $? -eq 0 ]; then
    echo "~ 拆分成功"
    exit 0
else
    echo "! 拆分失败"
    exit 3
fi
