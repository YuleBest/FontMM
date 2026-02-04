#!/bin/bash
# FontMM
# 将 json 转换为 xml
# By Yule
# shellcheck disable=SC2154

# 配置
SCRIPT_DIR="$(dirname "$(dirname "$(dirname "$(readlink -f "$0")")")")"
WORK_DIR="$SCRIPT_DIR/WORK"
export PATH="$PATH:$SCRIPT_DIR/功能/bin"
mkdir -p "$DOWN_DIR" >/dev/null 2>&1
clear

# 环境检查
if ! command -v yq >/dev/null 2>&1; then
    echo -e "${re}[错误] 缺少 yq，请安装后重试${res}"
    exit 1
fi

mkdir -p "$WORK_DIR/xml"
mkdir -p "$WORK_DIR/json"
mkdir -p "$WORK_DIR/tmp"

# 转换函数

conversion() {
    # local mode="json2xml"
    local input="$2"
    local output="$1"
    
    yq -p json -o xml "$input" > "$output"
}

# 对每一个进行转换

conversion "$WORK_DIR/xml/fonts.xml" "$WORK_DIR/json/fonts.json"
conversion "$WORK_DIR/xml/font_fallback.xml" "$WORK_DIR/json/font_fallback.json"
conversion "$WORK_DIR/xml/fonts_base.xml" "$WORK_DIR/json/fonts_base.json"
conversion "$WORK_DIR/xml/fonts_ule.xml" "$WORK_DIR/json/fonts_ule.json"

echo "完成：$WORK_DIR/xml"