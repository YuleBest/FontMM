#!/bin/bash
# FontMM
# TTC 文件拆分
# By Yule
# shellcheck disable=SC2154

# 配置
SCRIPT_DIR="$(dirname "$(dirname "$(readlink -f "$0")")")"
WORK_DIR="$SCRIPT_DIR/WORK"
export PATH="$PATH:$SCRIPT_DIR/功能/bin"
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

if ttc_splitter "$ttc_file" -o "$WORK_DIR/ttc_separated"; then
    echo "~ 拆分成功"
    exit 0
else
    echo "! 有文件拆分失败"
    exit 3
fi
