# shellcheck disable=SC2148
# FontMM ColorOS 16
# 刷入脚本（带完整性校验）

COPY_WITH_VERIFY() {
    src="$1"
    dst="$2"

    [ ! -f "$src" ] && abort "源文件不存在: $src"
    sha_src=$(sha256sum "$src" | awk '{print $1}')
    cp -f "$src" "$dst" || abort "复制失败: $dst"
    sha_dst=$(sha256sum "$dst" | awk '{print $1}')
    [ "$sha_src" != "$sha_dst" ] && abort "SHA256校验失败: $dst"
    chmod 0644 "$dst" || abort "权限设置失败: $dst"
    echo "✔ 已校验并安装: $(basename "$dst")"
}

FLASH_RENAMER() {
    # 兜底字体
    [ ! -f "$MODPATH/ttf/ch.ttf" ] && abort "缺少 ch.ttf，终止"

    hans="$MODPATH/ttf/ch.ttf"
    hant="$MODPATH/ttf/ch.ttf"
    en="$MODPATH/ttf/ch.ttf"

    [ -f "$MODPATH/ttf/tc.ttf" ] && hant="$MODPATH/ttf/tc.ttf"
    [ -f "$MODPATH/ttf/en.ttf" ] && en="$MODPATH/ttf/en.ttf"

    # === 开始复制 + 校验 ===
    COPY_WITH_VERIFY "$hant" "$MODPATH/system/fonts/SysSans-Hant-Regular.ttf"
    COPY_WITH_VERIFY "$hans" "$MODPATH/system/fonts/SysSans-Hans-Regular.ttf"
    COPY_WITH_VERIFY "$en"   "$MODPATH/system/fonts/SysSans-En-Regular.ttf"

    COPY_WITH_VERIFY "$hans" "$MODPATH/system/fonts/SysFont-Static-Regular.ttf"
    COPY_WITH_VERIFY "$hans" "$MODPATH/system/fonts/SysFont-Myanmar.ttf"
    COPY_WITH_VERIFY "$hant" "$MODPATH/system/fonts/SysFont-Hant-Regular.ttf"
    COPY_WITH_VERIFY "$hans" "$MODPATH/system/fonts/SysFont-Hans-Regular.ttf"
    COPY_WITH_VERIFY "$hans" "$MODPATH/system/fonts/SysFont-Regular.ttf"

    echo "所有字体复制、校验、权限设置完成"
}

FLASH_RENAMER
