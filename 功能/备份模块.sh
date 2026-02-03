#!/bin/bash
# FontMM ColorOS 16
# 备份模块脚本

# --- 配置 ---
SCRIPT_DIR="$(dirname "$(dirname "$(readlink -f "$0")")")"
COMP_LEVEL="5"
TMP_DIR="$SCRIPT_DIR/.tmp"
MODDIR_BASE="/data/adb/modules"
# -----------

clear
time=$(date +'%Y%m%d_%H%M%S')
mod_id_line="$(cat "$SCRIPT_DIR/module.prop" | grep id)"
mod_name_line="$(cat "$SCRIPT_DIR/module.prop" | grep name)"

mod_id="${mod_id_line#*=}"
mod_name="${mod_name_line#*=}"

# 复制指定目录第一层文件的函数

copy() {
    local src_dir="$1"
    local dest_dir="$2"
    
    mkdir -p "$dest_dir"
    find "$src_dir" -maxdepth 1 -type f -exec cp -t "$dest_dir" {} +
}


# 备份

BACKUP() {
    local MODDIR="$1"
    local filename="MODULE_Backup_$time.zip"
    
    if [ ! -d "$MODDIR" ] || [[ -z "$MODDIR" ]]; then
        echo "! 模块目录 $MODDIR 不存在，请确认"
        exit 1
    fi
    
    rm -rf "$TMP_DIR"
    mkdir -p "$TMP_DIR"
    copy "$MODDIR" "$TMP_DIR" # /
    copy "$MODDIR/ttf" "$TMP_DIR/ttf" # /ttf/
    copy "$MODDIR/tools" "$TMP_DIR/tools" # /tools/
    copy "$MODDIR/system" "$TMP_DIR/system" # /system/
    copy "$MODDIR/system/etc" "$TMP_DIR/system/etc" # /system/etc/
    copy "$MODDIR/system/fonts" "$TMP_DIR/system/fonts" # /system/fonts/
    copy "$MODDIR/system/system_ext/etc" "$TMP_DIR/system/system_ext/etc" # /system/system_ext/etc/
    
    # 需要删掉由刷入模块负责的 Sys*.ttf
    find "${TMP_DIR}/system/fonts" -maxdepth 1 -name "Sys*.ttf" -delete
    # 已刷入的模块没有刷入脚本，所以需要从模板包中提取
    unzip -o "$SCRIPT_DIR/template/template.zip" "customize.sh" "META-INF/com/google/android/update-binary" "META-INF/com/google/android/updater-script" -d "$TMP_DIR/"  # 竟然是updater-script，不要忘记加r

    # 压缩
    cd "$TMP_DIR" || exit 1
    zip -r -"$COMP_LEVEL" "$filename" .
    if [ -f "./$filename" ]; then
        mv "./$filename" "/sdcard/"
    else
        echo "! 备份失败，请反馈给开发者"
        exit 2
    fi
    
    rm -rf "$TMP_DIR"
    echo -e "\nOK，备份成功：/sdcard/$filename"
}

CHOICE() {
    local input
    
    echo -n "请输入一个模块完整路径 或者模块ID："
    read -r input
    
    # 模块 id 不含斜杠
    if echo "$input" | grep "/" > /dev/null; then
        BACKUP "$input"
    else
        # 模块目录名字就是 id
        BACKUP "$MODDIR_BASE/$input"
    fi
}

echo
echo "此脚本用于备份当前已安装的字体模块"
echo
echo "- 正在读取本地 prop..."
echo
echo "- 请核对信息："
echo "模块名字：$mod_name"
echo "模块 ID ：$mod_id"
echo

echo -n "请问以上信息正确吗？(y/N)  "
read -r confirm

case $confirm in
    y|Y)
        BACKUP "$MODDIR_BASE/$mod_id"
        ;;
    *)
        CHOICE
        ;;
esac