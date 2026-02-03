# shellcheck disable=SC2148
# FontMM ColorOS 16
# 刷入脚本
FLASH_RENAMER() {
    # 兜底字体
    if [ ! -f "$MODPATH/ttf/ch.ttf" ]; then
        abort "缺少 ch.ttf，终止"
    fi
    
    # 存在则用，不存在自动回退 ch.ttf
    hans="$MODPATH/ttf/ch.ttf"
    hant="$MODPATH/ttf/ch.ttf"
    en="$MODPATH/ttf/ch.ttf"
    
    [ -f "$MODPATH/ttf/tc.ttf" ] && hant="$MODPATH/ttf/tc.ttf"
    [ -f "$MODPATH/ttf/en.ttf" ] && en="$MODPATH/ttf/en.ttf"
    
    cp -v "$hant" "$MODPATH/system/fonts/SysSans-Hant-Regular.ttf"
    cp -v "$hans" "$MODPATH/system/fonts/SysSans-Hans-Regular.ttf"
    cp -v "$en"   "$MODPATH/system/fonts/SysSans-En-Regular.ttf"

    cp -v "$hans" "$MODPATH/system/fonts/SysFont-Static-Regular.ttf"
    cp -v "$hans" "$MODPATH/system/fonts/SysFont-Myanmar.ttf"   
    cp -v "$hant" "$MODPATH/system/fonts/SysFont-Hant-Regular.ttf"
    cp -v "$hans" "$MODPATH/system/fonts/SysFont-Hans-Regular.ttf"
    cp -v "$hans" "$MODPATH/system/fonts/SysFont-Regular.ttf"
    
    echo "重命名并复制完成"
}

FLASH_RENAMER