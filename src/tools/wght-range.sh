#!/bin/sh
# wght-range.sh - 读取可变字体 wght 轴范围，输出 "min max"
# 用法: sh wght-range.sh <字体.ttf>

font=$1

[ -n "$font" ] || {
    echo "usage: sh $0 <font.ttf>" >&2
    exit 1
}
[ -f "$font" ] || {
    echo "error: file not found: $font" >&2
    exit 1
}

# 读 1 字节
byte() {
    od -An -tu1 -j "$1" -N1 "$font" 2>/dev/null | tr -d ' '
}

# 读 2 字节大端无符号整数
u16() {
    b0=$(byte "$1") || return 1
    b1=$(byte "$(($1 + 1))") || return 1
    [ -n "$b0" ] && [ -n "$b1" ] || return 1
    echo $(((b0 << 8) | b1))
}

# 读 4 字节大端无符号整数
u32() {
    b0=$(byte "$1") || return 1
    b1=$(byte "$(($1 + 1))") || return 1
    b2=$(byte "$(($1 + 2))") || return 1
    b3=$(byte "$(($1 + 3))") || return 1
    [ -n "$b0" ] && [ -n "$b1" ] && [ -n "$b2" ] && [ -n "$b3" ] || return 1
    echo $(((b0 << 24) | (b1 << 16) | (b2 << 8) | b3))
}

# 读 4 字节 ASCII tag
tag4() {
    dd if="$font" bs=1 skip="$1" count=4 2>/dev/null
}

num_tables=$(u16 4) || {
    echo "error: cannot read font: $font" >&2
    exit 1
}

# 在 sfnt 表目录里找 fvar 表
# offset 12 起，每条 16 字节：tag/checksum/offset/length
i=0
fvar_off=
while [ "$i" -lt "$num_tables" ]; do
    pos=$((12 + i * 16))
    if [ "$(tag4 "$pos")" = "fvar" ]; then
        fvar_off=$(u32 "$((pos + 8))")
        break
    fi
    i=$((i + 1))
done

[ -n "$fvar_off" ] || {
    echo "error: no fvar table (not a variable font?)" >&2
    exit 1
}

axis_off=$((fvar_off + $(u16 "$((fvar_off + 4))")))
axis_count=$(u16 "$((fvar_off + 8))")
axis_size=$(u16 "$((fvar_off + 10))")

# 遍历轴找 wght
# min/max 是 Signed Fixed 16.16，整数部分 = 高 16 位
j=0
while [ "$j" -lt "$axis_count" ]; do
    p=$((axis_off + j * axis_size))
    if [ "$(tag4 "$p")" = "wght" ]; then
        hi=$(u16 "$((p + 4))") # minValue 高 16 位
        [ "$hi" -ge 32768 ] && hi=$((hi - 65536))
        min=$hi
        hi=$(u16 "$((p + 12))") # maxValue 高 16 位
        [ "$hi" -ge 32768 ] && hi=$((hi - 65536))
        max=$hi
        echo "$min $max"
        exit 0
    fi
    j=$((j + 1))
done

echo "error: no wght axis in font" >&2
exit 1
