# FontMM ColorOS 16
# 更换字体脚本
MODDIR=$(dirname $(readlink -f $0))
sleep 1 # 这是必须的，防止上一次选择连续触发

# 通用按键选择函数
choose_option() {
    local timeout=15 # 设置 15 秒超时，防止用户挂机导致刷入卡死
    local result=""
    
    echo "- 请在 $timeout 秒内按音量键选择："
    echo "  音量+ : 是 (YES)"
    echo "  音量- : 否 (NO)"
    
    result=$(timeout $timeout /system/bin/getevent -l -c 1 2>/dev/null | grep -m 1 -E "KEY_VOLUMEUP|KEY_VOLUMEDOWN")
    
    case "$result" in
        *KEY_VOLUMEUP*)
            echo "  选择: YES"
            return 0
            ;;
        *KEY_VOLUMEDOWN*)
            echo "  选择: NO"
            return 1
            ;;
        *)
            echo "  超时或错误，使用默认值: NO"
            return 1
            ;;
    esac
}

# 兜底字体
if [ ! -f "$MODDIR/ttf/ch.ttf" ]; then
    echo "缺少 ch.ttf，终止"
    sleep 2
    exit 1
fi

# 存在则用，不存在自动回退 ch.ttf
hans="$MODDIR/ttf/ch.ttf"
hant="$MODDIR/ttf/ch.ttf"
en="$MODDIR/ttf/ch.ttf"

[ -f "$MODDIR/ttf/tc.ttf" ] && hant="$MODDIR/ttf/tc.ttf"
[ -f "$MODDIR/ttf/en.ttf" ] && en="$MODDIR/ttf/en.ttf"

echo "------------ FontMM - ColorOS 16 ---------"
echo "---------------- 更换字体 ----------------"
echo

echo "︎● 字体将更换为以下配置："
echo "- 中文简体：$hans"
echo "- 中文繁体：$hant"
echo "- 英文数字：$en"
echo

echo "确认更换吗？"
if choose_option "YES"; then
    cp -v "$hant" "$MODDIR/system/fonts/SysSans-Hant-Regular.ttf"
    cp -v "$hans" "$MODDIR/system/fonts/SysSans-Hans-Regular.ttf"
    cp -v "$en"   "$MODDIR/system/fonts/SysSans-En-Regular.ttf"
    
    cp -v "$hans" "$MODDIR/system/fonts/SysFont-Static-Regular.ttf"
    cp -v "$hans" "$MODDIR/system/fonts/SysFont-Myanmar.ttf"   
    cp -v "$hant" "$MODDIR/system/fonts/SysFont-Hant-Regular.ttf"
    cp -v "$hans" "$MODDIR/system/fonts/SysFont-Hans-Regular.ttf"
    cp -v "$hans" "$MODDIR/system/fonts/SysFont-Regular.ttf"
    echo
    echo "字体更换完成，重启生效！"
else
    echo "取消更换"
fi
