#!/bin/bash

echo "
===============================================
 FontMM 检查更新
===============================================
"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' 

# 获取项目根目录
ROOT_DIR="$(dirname "$(dirname "$(readlink -f "$0")")")"
LOCAL_PROP="$ROOT_DIR/update.prop"
REMOTE_PROP_URL="https://raw.githubusercontent.com/YuleBest/FontMM/main/update.prop"
BASE_WEB_URL="https://github.com/YuleBest/FontMM/releases/tag"

# UI 组件
draw_line() { echo -e "${BLUE}--------------------------------------------------${NC}"; }

# 提取函数
get_vc_pure() { grep "^${1}=" "$2" | cut -d'=' -f2- | tr -cd '0-9'; }
get_prop() { grep "^${1}=" "$2" | cut -d'=' -f2- | tr -d '\r' | xargs; }

# 环境准备

echo -e "${YELLOW}[*] 正在检索云端最新版本...${NC}"

if [ ! -f "$LOCAL_PROP" ]; then
    echo -e "${RED}[!] 错误: 找不到本地 update.prop${NC}"
    echo -e "${RED}    路径: $LOCAL_PROP${NC}"
    exit 1
fi

TEMP_PROP=$(mktemp)
if ! curl -sL --connect-timeout 10 "$REMOTE_PROP_URL" -o "$TEMP_PROP"; then
    echo -e "${RED}[!] 错误: 无法连接至 GitHub (raw.githubusercontent.com)。${NC}"
    rm -f "$TEMP_PROP"
    exit 1
fi

# 解析版本信息
LOCAL_NOW_VC=$(get_vc_pure "nowVersionCode" "$LOCAL_PROP")
LOCAL_NOW_VC=${LOCAL_NOW_VC:-0}

LOCAL_NOW_VER=$(get_prop "nowVersion" "$LOCAL_PROP")
LOCAL_NOW_VER=${LOCAL_NOW_VER:-0}

REMOTE_VC=$(get_vc_pure "versionCode" "$TEMP_PROP")
REMOTE_VER=$(get_prop "version" "$TEMP_PROP")

TEST_VC=$(get_vc_pure "testVersionCode" "$TEMP_PROP")
TEST_VER=$(get_prop "testVersion" "$TEMP_PROP")

HAS_STABLE=false
HAS_TEST=false
[ -n "$REMOTE_VC" ] && [ "$REMOTE_VC" -gt "$LOCAL_NOW_VC" ] && HAS_STABLE=true
[ -n "$TEST_VC" ] && [ "$TEST_VC" -gt "$LOCAL_NOW_VC" ] && HAS_TEST=true

# 信息展示
echo -e "${GREEN}[+] 本地当前版本: ${BOLD}$LOCAL_NOW_VER($LOCAL_NOW_VC)${NC}"
draw_line

show_link() {
    local ver=$1
    echo -e "\n${CYAN}>>> 请手动下载更新包:${NC}"
    echo -e "GitHub：${BOLD}${UNDERLINE}${BASE_WEB_URL}/${ver}${NC}"
    echo -e "123网盘：https://www.123912.com/s/3ygsvd-AtCl"
    echo -e "${YELLOW}(复制到浏览器打开)${NC}\n"
}

if $HAS_STABLE && $HAS_TEST; then
    echo -e "${PURPLE}发现多个更新版本可用:${NC}"
    echo -e "  1) ${GREEN}正式版${NC}: $REMOTE_VER (Code: $REMOTE_VC)"
    echo -e "  2) ${YELLOW}测试版${NC}: $TEST_VER (Code: $TEST_VC)"
    echo -e "  3) 暂时不更新"
    echo
    read -rp "选择查看的版本 [1-3]: " choice
    case $choice in
        1) show_link "$REMOTE_VER" ;;
        2) show_link "$TEST_VER" ;;
        *) echo -e "${BLUE}操作取消。${NC}" ;;
    esac
elif $HAS_STABLE; then
    echo -e "${GREEN}[!] 发现新正式版: ${BOLD}$REMOTE_VER${NC} (Code: $REMOTE_VC)"
    read -rp "是否查看下载链接？(y/n): " choice
    [[ "$choice" =~ ^[Yy]$ ]] && show_link "$REMOTE_VER"
elif $HAS_TEST; then
    echo -e "${YELLOW}[!] 发现新测试版: ${BOLD}$TEST_VER${NC} (Code: $TEST_VC)"
    read -rp "是否查看下载链接？(y/n): " choice
    [[ "$choice" =~ ^[Yy]$ ]] && show_link "$TEST_VER"
else
    echo -e "${CYAN}[~] 当前已是最新版，无需更新。${NC}"
fi

# 清理
rm -f "$TEMP_PROP"
draw_line
