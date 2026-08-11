#!/system/bin/sh
# shellcheck shell=ash
# FontMM 一键校验: 校验模块内可执行文件的 SHA256 完整性
# 用法: sh verify-sha256.sh [模块目录]   默认 /data/adb/modules/FontMM
# 依赖: SHA256SUMS (随模块打包), sha256sum (toybox 自带)

MODDIR="${1:-/data/adb/modules/FontMM}"
SUMS="$MODDIR/SHA256SUMS"

[ -f "$SUMS" ] || {
    echo "[✗] 未找到 $SUMS, 请确认模块已正确安装"
    exit 1
}

command -v sha256sum >/dev/null 2>&1 || {
    echo "[✗] 系统缺少 sha256sum 命令"
    exit 1
}

cd "$MODDIR" || exit 1

echo "[*] 正在校验 $(wc -l <"$SUMS") 个文件..."

# 逐条校验, 便于指出具体是哪个文件不匹配
FAIL=0
while IFS= read -r line; do
    [ -z "$line" ] && continue
    expected="${line%%  *}"
    file="${line#*  }"
    [ -f "$file" ] || {
        echo "[✗] 文件缺失: $file"
        FAIL=1
        continue
    }
    actual="$(sha256sum "$file" | awk '{ print $1 }')"
    if [ "$actual" = "$expected" ]; then
        echo "[✓] $file"
    else
        echo "[✗] 校验失败: $file"
        FAIL=1
    fi
done <"$SUMS"

if [ "$FAIL" -eq 0 ]; then
    echo "[*] 全部文件校验通过"
else
    echo "[✗] 存在校验失败的文件, 建议重新安装模块"
    exit 1
fi
