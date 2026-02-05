#!/bin/bash
# FontMM - ColorOS 16 打包脚本
# By Yule
# shellcheck disable=SC2086

# --- 配置 ---
COMP_LEVEL="9"
USE_FONT_META="1" # 尝试使用中文简体字体元信息的名称作为模块的 name，开启后，module.prop 的自定义可能不生效。未成功解析时会自动返回到您的配置。设置为 1 开启，0 关闭。
SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
TEMP_DIR="$SCRIPT_DIR/template"
TTF_DIR="$SCRIPT_DIR/ttf"
BUILD_DIR="$SCRIPT_DIR/.build"
MODULE_FILE="$SCRIPT_DIR/MODULE.zip"

# --- 颜色定义 ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

# --- 环境配置 ---
export PATH="$PATH:$SCRIPT_DIR/功能/bin"

# --- 计时开始 ---
START_TIME=$(date +%s.%N)

# --- 辅助函数 ---
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_succ() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WAIT]${NC} $1"; }
log_err() { echo -e "${RED}[ERROR]${NC} $1"; }

extract_ttf_name() {
    if [ -z "$1" ]; then
        echo "Usage: $0 <font_file.ttf>"
        exit 1
    fi
    FONT_FILE=$1
    
    # 提取逻辑：ttx -> yq -> 过滤 -> 去重
    mapfile -t NAMES < <(fonttool ttx -t name -o - "$FONT_FILE" 2>/dev/null | \
        yq -p xml -o json '.ttFont.name.namerecord[] | select(.["+@nameID"] == "1" or .["+@nameID"] == "16") | .["+content"]' | \
        sed 's/^"//;s/"$//' | \
        grep -v "null" | \
        sort -u)
    
    # 检查结果数量
    COUNT=${#NAMES[@]}
    
    if [ "$COUNT" -eq 0 ]; then
        echo "错误：未能解析到字体家族名称。" # 跳过解析
        return 1
    elif [ "$COUNT" -eq 1 ]; then
        # 只有一个候选名，直接选定
        SELECTED_NAME="${NAMES[0]}"
        echo "仅找到一个候选名称: $SELECTED_NAME"
    else
        # 多个候选名，展示交互菜单
        echo -e "\n-----------------------------------"
        echo "发现多个 Font Family 候选名称："
        for i in "${!NAMES[@]}"; do
            printf "[%d] %s\n" "$((i+1))" "${NAMES[$i]}"
        done
        echo "-----------------------------------"
    
        read -r -p "请选择一个名称 (输入数字, 默认选 1): " CHOICE
        CHOICE=${CHOICE:-1}
    
        # 简单校验输入合法性
        if [[ ! "$CHOICE" =~ ^[0-9]+$ ]] || [ "$CHOICE" -lt 1 ] || [ "$CHOICE" -gt "$COUNT" ]; then
            echo "无效选择，操作取消。"
            exit 1
        fi
        SELECTED_NAME="${NAMES[$((CHOICE-1))]}"
        log_succ "已确认名称: $SELECTED_NAME"
    fi
    echo
    
    # 替换 prop
    ttf_meta_name="$SELECTED_NAME"
    cp "$SCRIPT_DIR/module.prop" "$SCRIPT_DIR/module.prop.base"
    sed -i "s/^name=.*$/name=$ttf_meta_name/" "$SCRIPT_DIR/module.prop"
}

CHECK_ENVIRONMENT() {
    local ARCH
    ARCH=$(uname -m)
    
    echo -e "${CYAN}>>${NC} 检查运行环境..."
    if [ "$EUID" -ne 0 ]; then
        log_err "请授权 Root 权限后运行"
        exit 1
    fi
    
    if [ "$ARCH" != "arm64" ] && [ "$ARCH" != "aarch64" ]; then
        log_error "$ARCH"
        exit 1
    fi
    
    if ! command -v zip >/dev/null 2>&1; then
        log_err "未找到 zip 工具，请运行 pkg install zip"
        exit 1
    fi
    if ! command -v yq >/dev/null 2>&1; then
        log_err "未找到 ya 工具，请运行 pkg install yq"
        exit 1
    fi
    if ! command -v fonttool >/dev/null 2>&1; then
        log_err "未找到 fonttool 工具，请确认文件完整"
        exit 1
    fi
    
    log_succ "环境就绪"
}

WELCOME() {
    clear
    echo -e "${PURPLE}${BOLD}======================================"
    echo -e "       FontMM - ColorOS 16 打包脚本"
    echo -e "          Author: 于乐 Yule"
    echo -e "======================================"${NC}
    echo ""
}

SETUP_BUILD_ENV() {
    log_warn "清理并准备构建目录..."
    rm -rf "$BUILD_DIR"
    rm -f "$MODULE_FILE"
    mkdir -p "$BUILD_DIR"    
    cp "$TEMP_DIR/template.zip" "$BUILD_DIR/" >/dev/null
    log_succ "构建环境已初始化"
}

SHOW_MODULE_INFO() {
    local PROP_FILE="$SCRIPT_DIR/module.prop"
    
    if [ ! -f "$PROP_FILE" ]; then
        log_err "未找到 module.prop，跳过信息展示"
        return 1
    fi

    echo
    echo -e "${YELLOW}${BOLD}------------- 模块信息预览 ------------${NC}"
    echo
    # 逐行读取 module.prop
    while IFS= read -r line || [ -n "$line" ]; do
        # 跳过空行和注释
        [[ -z "$line" || "$line" =~ ^# ]] && continue
        
        # 以第一个等号为界分割 Key 和 Value
        local key="${line%%=*}"
        local value="${line#*=}"
        
        # 渲染输出：Key 用灰色，Value 用高亮青色
        # %-12s 是为了让等号左边对齐，看起来更整齐
        printf "\033[0;90m%-12s\033[0m = \033[1;36m%s\033[0m\n" "$key" "$value"
        
    done < "$PROP_FILE"
    echo
}

SHOW_FONT_INFO() {
    local hans hant en
    
    echo
    # 字体检查
    if [ ! -f "$TTF_DIR/ch.ttf" ]; then
        echo ""
        log_err "致命错误: 缺少核心字体 ch.ttf"
        exit 1
    fi
    hans="$TTF_DIR/ch.ttf"
    
    echo -e "${YELLOW}${BOLD}------------- 字体配置预览 ------------${NC}"
    echo
    echo -e "${BOLD}中文简体：${NC}$hans"
    [ -f "$TTF_DIR/tc.ttf" ] && hant="$TTF_DIR/tc.ttf" && echo -e "${BOLD}中文繁体：${NC}$hant" || echo -e "${BOLD}中文繁体：${NC}跟随「中文简体」"
    [ -f "$TTF_DIR/en.ttf" ] && en="$TTF_DIR/en.ttf" && echo -e "${BOLD}英文数字：${NC}$en" || echo -e "${BOLD}英文数字：${NC}跟随「中文简体」"
    echo
    echo -e "${YELLOW}${BOLD}----------------------------------------${NC}"
    echo
}

PACKER() {
    local TARGET_ZIP="$BUILD_DIR/template.zip"
    
    log_warn "正在同步字体文件..."
    mkdir -p "$BUILD_DIR/ttf"
    cp "$TTF_DIR/ch.ttf" "$BUILD_DIR/ttf/"
    [ -f "$TTF_DIR/tc.ttf" ] && cp "$TTF_DIR/tc.ttf" "$BUILD_DIR/ttf/"
    [ -f "$TTF_DIR/en.ttf" ] && cp "$TTF_DIR/en.ttf" "$BUILD_DIR/ttf/"
    
    if [ "$USE_FONT_META" -eq 1 ]; then
        extract_ttf_name "$TTF_DIR/ch.ttf" # v1.3-beta
    fi

    log_warn "正在封包 (Level: $COMP_LEVEL)..."
    (
        cd "$BUILD_DIR" || exit
        zip -"${COMP_LEVEL}"urq "template.zip" "ttf"
        zip -"${COMP_LEVEL}"ujq "template.zip" "$SCRIPT_DIR/module.prop"
    )
    
    rm -rf "$BUILD_DIR/ttf"
    mv "$TARGET_ZIP" "$SCRIPT_DIR/MODULE.zip"
    log_succ "资源已成功注入压缩包"
}

CALC_TIME() {
    local END_TIME
    END_TIME=$(date +%s.%N)
    # 计算差值并保留两位小数
    local DURATION
    DURATION="$(echo "$END_TIME - $START_TIME" | bc 2>/dev/null || echo "0")"
    
    # prop 处理
    [ -f "$SCRIPT_DIR/module.prop.base" ] && mv "$SCRIPT_DIR/module.prop.base" "$SCRIPT_DIR/module.prop"
    
    echo ""
    echo -e "${PURPLE}--------------------------------------${NC}"
    echo -e "${GREEN}${BOLD}打包完成!${NC}"
    echo -e "${CYAN}累计耗时: ${NC}${DURATION}s"
    echo -e "${CYAN}输出路径: ${NC}${BOLD}$SCRIPT_DIR/MODULE.zip${NC}"
    echo -e "${PURPLE}--------------------------------------${NC}"
}

MAIN() {
    WELCOME
    CHECK_ENVIRONMENT
    SETUP_BUILD_ENV
    SHOW_MODULE_INFO; SHOW_FONT_INFO
    PACKER
    CALC_TIME
}

MAIN
