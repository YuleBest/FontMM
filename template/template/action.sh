# shellcheck disable=SC2148
# shellcheck disable=SC1091

# FontMM ColorOS 16
# Action 脚本
MODDIR=${0%/*}

# 音量键选择
choose() {
    local timeout=15 # 设置 15 秒超时，防止用户挂机导致刷入卡死
    local result=""
    
    echo "请在 $timeout 秒内按音量键选择功能："
    echo "  音量+ : 更换字体（请在 模块目录/ttf 目录放新字体）"
    # echo "  音量- : 导出当前字体为模块"
    echo "  其他: 退出选择"
    echo
    
    result=$(timeout $timeout /system/bin/getevent -l -c 1 2>/dev/null | grep -m 1 -E "KEY_VOLUMEUP|KEY_VOLUMEDOWN")
    
    case "$result" in
        *KEY_VOLUMEUP*)
            echo "  选择: 更换字体"
            return 0
            ;;
        # *KEY_VOLUMEDOWN*)
            # echo "  选择: 导出当前字体为模块"
            # return 1
            # ;;
        *)
            echo "  超时或用户退出"
            return 2
            ;;
    esac
}

echo
echo "-------- FontMM 功能 -------"
echo

choose
choose_mode=$?
case $choose_mode in
    0) . "$MODDIR/tools/replace_font.sh" ;;
    # 1) . "$MODDIR/tools/export_module.sh" ;;
    2) exit 1 ;;
esac
