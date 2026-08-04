#!/system/bin/sh
# FontMM 工具: 下载国际版小米主题字体并解压提取 (v1.0.0)
# 用法: mi-font-download.sh "<标题>" "<主题ID>" "<URL编码标题>"
# 流程: 详情API取下载地址 -> 下载 .mtz -> 解压提取 fonts/ 目录字体

DOWN_DIR="/storage/emulated/0/Download/xttdown"
DETAILS_API="https://api.zhuti.intl.xiaomi.com/app/v9/uipages/theme/"
DL_BASE="https://f17.market.xiaomi.com/issue/"

TITLE="$1"
ID="$2"
ENCODED="$3"

[ -z "$TITLE" ] || [ -z "$ID" ] || [ -z "$ENCODED" ] && {
    echo "[x] 参数不足: <标题> <主题ID> <URL编码标题>"
    echo "__DONE__"
    exit 1
}

# 文件名安全化
SAFE_TITLE=$(printf "%s" "$TITLE" | tr -c 'A-Za-z0-9._-' '_')

echo "[*] 获取「$TITLE」下载链接..."
DOWN_URL=$(curl -s "${DETAILS_API}${ID}" | sed -n 's/.*"downloadUrl":"\([^"]*\)".*/\1/p' | head -1)
[ -z "$DOWN_URL" ] && {
    echo "[x] 获取下载链接失败"
    echo "__DONE__"
    exit 1
}

DL_URL="${DL_BASE}${DOWN_URL}/${ENCODED}.mtz"
SAVE="${DOWN_DIR}/${SAFE_TITLE}.mtz"
echo "[*] 下载: ${DL_URL}"
mkdir -p "$DOWN_DIR"
if ! curl -sL -o "$SAVE" "$DL_URL" || [ ! -s "$SAVE" ]; then
    echo "[x] 下载失败"
    echo "__DONE__"
    exit 1
fi
echo "[✓] 下载完成: ${SAVE} ($(du -h "$SAVE" | cut -f1))"

EXTRACT_DIR="${DOWN_DIR}/extracted/${SAFE_TITLE}"
echo "[*] 解压 mtz 并提取字体..."
mkdir -p "$EXTRACT_DIR"
unzip -o -j "$SAVE" 'fonts/*' -d "$EXTRACT_DIR" >/dev/null 2>&1

# 收集提取出的字体文件 (ttf/otf)
FONTS=''
for f in "$EXTRACT_DIR"/*.ttf "$EXTRACT_DIR"/*.otf; do
    [ -f "$f" ] && FONTS="${FONTS} $(basename "$f")"
done

if [ -n "$FONTS" ]; then
    echo "[✓] 提取字体:"
    for f in $FONTS; do
        echo "    ${EXTRACT_DIR}/${f}"
    done
else
    echo "[-] 未在 mtz 中找到字体文件, 原始包保留在 ${SAVE}"
fi
echo "__DONE__"
