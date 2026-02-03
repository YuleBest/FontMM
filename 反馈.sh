#!/bin/bash
# FontMM - ColorOS 16 反馈脚本
# By Yule
SCRIPT_DIR="$(dirname $(readlink -f $0))"

# while [ "$(stty size | cut -d' ' -f2)" -le 80 ]; do
    # clear
    # current_cols=$(stty size | cut -d' ' -f2)
    # echo "当前列数: $current_cols"
    # echo "----------------------------------------"
    # echo "检测到窗口过窄，请缩小屏幕..."
    # echo "（列数需 > 80 才能继续运行）"
    # echo "----------------------------------------"
    # sleep 1
# done
clear

WELCOME() {
    echo -e "======================================"
    echo -e "       FontMM - ColorOS 16 反馈脚本"
    echo -e "          Author: 于乐 Yule"
    echo -e "       您的反馈会令这个项目更好"
    echo -e "======================================"
    echo ""
}
WELCOME

echo "手机型号：$(getprop ro.product.brand) | $(getprop ro.product.model) | $(getprop ro.vendor.oplus.market.enname)"
echo "系统版本：$(getprop ro.build.display.full_id)"
echo "安卓版本: $(getprop ro.build.version.release)"
echo "SELINUX 状态：$(getenforce)"
echo

echo -n "当前Root管理器："
if [ -d "/data/adb/magisk" ]; then
    echo "Magisk (/data/adb/magisk)"
elif [ -d "/data/adb/ksu" ]; then
    echo "KernelSU (/data/adb/ksu)"
elif [ -d "/data/adb/apatch" ]; then
    echo "APatch (/data/adb/apatch)"
elif [ -f "/data/adb/ksu/bin/ksud" ]; then
    echo "KernelSU (/data/adb/ksu/bin/ksud)"
else
    echo "未检测到 Root 环境"
fi

echo -n "- 元模块：$(cat /data/adb/metamodule/module.prop | grep name)"

echo
echo
echo "FontMM 文件列表："
ls -R $SCRIPT_DIR

echo
echo "已安装模块列表："
ls /data/adb/modules/

echo
echo "系统 fonts 列表 (筛选)："
ls -s -k /system/fonts/ | grep Sys

echo
echo "模块 fonts 列表 (筛选)："
mod_id_line="$(cat "$SCRIPT_DIR/module.prop" | grep id)"
mod_id="${mod_id_line#*=}"
ls -s -k "/data/adb/modules/$mod_id/system/fonts/" | grep Sys

echo
echo "系统 fonts.xml SHA256：$(sha256sum "/system/etc/fonts.xml" | cut -f1 -d" ")"
echo "模块 fonts.xml SHA256：$(sha256sum "/data/adb/modules/$mod_id/system/etc/fonts.xml" | cut -f1 -d" ")"

echo
echo "[请缩小屏幕截图以上信息给开发者，感谢您的支持！]"