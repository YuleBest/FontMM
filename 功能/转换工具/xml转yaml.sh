#!/bin/bash
# FontMM
# 将 fonts.xml 转换为 yaml
# By Yule

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
mkdir -p "$WORK_DIR/yaml"
mkdir -p "$WORK_DIR/tmp"

# 转换函数

conversion() {
    local mode="xml2yaml"
    local input="$1"
    local output="$2"
    
    yq -p xml -o yaml "$input" > "$output"
}

# 提取所有 fonts.xml

unzip -oj "$SCRIPT_DIR/template/template.zip" \
          "system/etc/fonts.xml" \
          "system/etc/font_fallback.xml" \
          "system/system_ext/etc/fonts_base.xml" \
          "system/system_ext/etc/fonts_ule.xml" \
          -d "$WORK_DIR/tmp/"

# 对每一个进行转换

conversion "$WORK_DIR/tmp/fonts.xml" "$WORK_DIR/yaml/fonts.yaml"
conversion "$WORK_DIR/tmp/font_fallback.xml" "$WORK_DIR/yaml/font_fallback.yaml"
conversion "$WORK_DIR/tmp/fonts_base.xml" "$WORK_DIR/yaml/fonts_bass.yaml"
conversion "$WORK_DIR/tmp/fonts_ule.xml" "$WORK_DIR/yaml/fonts_ule.yaml"

echo
echo "完成：$WORK_DIR/yaml"