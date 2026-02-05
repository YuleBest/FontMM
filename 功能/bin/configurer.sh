#!/bin/bash
# FontMM 环境配置脚本
# use `. "configurer.sh"`

# 配置
C_NOW_DIR="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
BIN_DIR="$C_NOW_DIR"
LIB_DIR="$(dirname "$C_NOW_DIR")/lib"
TERGET_BIN_DIR="/data/adb/local/tmp/fontmm/bin"
TERGET_LIB_DIR="/data/adb/local/tmp/fontmm/lib"

copy() {
    local src_dir="$1"
    local dest_dir="$2"
    
    mkdir -p "$dest_dir"
    find "$src_dir" -maxdepth 1 -type f -exec cp -t "$dest_dir" {} +
}

rm -rf $TERGET_BIN_DIR; rm -rf $TERGET_LIB_DIR
mkdir -p $TERGET_BIN_DIR; mkdir -p $TERGET_LIB_DIR; 

copy "$BIN_DIR" "$TERGET_BIN_DIR"
if export PATH="$PATH:$TERGET_BIN_DIR"; then
    chmod -R 755 "$TERGET_BIN_DIR"
    echo "[OK] 1/2"
else
    echo "[ERROR] 环境配置失败，部分功能无法使用"
fi

copy "$LIB_DIR" "$TERGET_LIB_DIR"
if export LD_LIBRARY_PATH=$TERGET_LIB_DIR:$LD_LIBRARY_PATH; then
    chmod -R 755 "$TERGET_LIB_DIR"
    echo "[OK] 2/2"
else
    echo "[ERROR] 环境配置失败，部分功能无法使用"
    sleep 2
fi

echo "[OK] 环境配置结束"