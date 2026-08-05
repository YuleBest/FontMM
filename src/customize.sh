#!/system/bin/sh
# shellcheck shell=ash
# shellcheck disable=SC2034
# FontMM ColorOS 16 — 刷入脚本
# 字体安装统一交给 apply.sh (与 WebUI 共用同一套逻辑)

REPLACE=""
REMOVE=""

# ---------- 路径 ----------
if [ -z "${MODPATH+x}" ]; then
    case "$0" in
    */*) MODPATH="${0%/*}" ;;
    *) MODPATH="." ;;
    esac
fi

MOD_WORK_PATH="$MODPATH/FONTS"
UPDATE_MODE=0

# ---------- 日志 ----------
log() {
    local msg="$1"
    echo "[-] $msg"
}

log_err() {
    local msg="$1"
    local code="${2:-1}"
    if command -v abort >/dev/null 2>&1; then
        abort "$msg"
    fi
    echo "[✗] $msg"
    exit "$code"
}

log_succ() {
    local msg="$1"
    echo "[*] $msg"
}

# ---------- 更新模式 ----------
# 检测旧版 FontMM 是否已安装
DETECT_UPDATE_MODE() {
    if [ -d /data/adb/modules/FontMM ]; then
        UPDATE_MODE=1
        log "检测到已安装的 FontMM, 进入更新模式"
    else
        log "全新安装"
    fi
}

# 更新模式: 以旧包为主继承字体
IMPORT_OLD_FONTS() {
    [ "$UPDATE_MODE" -eq 1 ] || return 0

    local old_fonts="/data/adb/modules/FontMM/FONTS"
    if [ ! -d "$old_fonts" ]; then
        log "注意: 旧模块中没有 FONTS 目录, 将使用新包字体"
        return 0
    fi

    mkdir -p "$MOD_WORK_PATH"
    local f=""
    for f in hans.ttf hant.ttf en.ttf mono.ttf emoji.ttf; do
        if [ -f "$old_fonts/$f" ]; then
            if cp -f "$old_fonts/$f" "$MOD_WORK_PATH/$f"; then
                log_succ "已从旧模块继承字体: $f"
            else
                log_err "继承字体 $f 失败"
            fi
        else
            log "旧包没有 $f, 使用新包字体"
        fi
    done
}

# ---------- 系统检查 ----------
# 仅支持 ColorOS 且版本 >= 16.0, 否则拒绝安装
CHECK_COLOROS() {
    local oplus_api=""
    oplus_api="$(getprop ro.build.version.oplus.api 2>/dev/null || true)"

    if [ -z "$oplus_api" ]; then
        log_err "当前系统不是 ColorOS, 本模块仅支持 ColorOS 16.0+"
    fi

    local oplus_display=""
    oplus_display="$(getprop ro.build.version.oplusrom.display 2>/dev/null || true)"
    local major="${oplus_display%%.*}"

    if [ "${major:-0}" -lt 16 ] 2>/dev/null; then
        log_err "ColorOS 版本过低 (${oplus_display:-未知}), 需要 16.0 及以上"
    fi

    log_succ "ColorOS ${oplus_display}"
}

# ---------- 检查元模块 ----------
CHECK_META_MODULE() {
    if [ ! -f /data/adb/ksud ]; then
        log "非 KernelSU 环境, 跳过元模块检查"
        return 0
    fi

    local ksud_version=""
    ksud_version="$(/data/adb/ksud --version 2>/dev/null | tr -d '\r' || true)"
    local ver_num
    ver_num="$(printf '%s' "$ksud_version" |
        grep -o '[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*' |
        head -n 1 || true)"
    log_succ "KernelSU v${ver_num}"
    local major="${ver_num%%.*}"

    if [ "${major:-0}" -lt 3 ] 2>/dev/null; then
        log "KernelSU 版本 ${ver_num:-未知} < 3.0.0, 无需元模块"
        return 0
    fi

    if [ ! -f /data/adb/metamodule/module.prop ]; then
        log "警告: KernelSU >= 3.0.0 需要元模块, 请先安装"
        return 1
    fi

    local meta_name=""
    meta_name="$(sed -n 's/^name=//p' /data/adb/metamodule/module.prop | head -n 1 || true)"
    if [ -n "$meta_name" ]; then
        log_succ "元模块已安装: $meta_name"
    else
        log "元模块已安装 (但读不到 name 字段)"
    fi
    return 0
}

# ---------- 判断 FontLoader ----------
CHECK_FONTLOADER() {
    local fontloader_moddir="/data/adb/modules/fontloader"
    local fontloader_github="https://github.com/KernelSU-Modules-Repo/fontloader/releases"

    if [ ! -d "$fontloader_moddir" ]; then
        log "注意: 你还没安装 FontLoader, 如果字体显示效果不佳请安装"
        log "前往 $fontloader_github 安装 FontLoader"
        return 0
    fi

    local prop_file="$fontloader_moddir/module.prop"
    local version_code=""
    if [ -f "$prop_file" ]; then
        version_code="$(sed -n 's/^versionCode=//p' "$prop_file")"
    fi
    version_code="$(printf '%s' "$version_code" | tr -cd '0-9')"

    if [ -z "$version_code" ]; then
        log "注意: 无法读取 FontLoader 版本号, 建议更新到最新版"
        log "前往 $fontloader_github 更新 FontLoader"
        return 0
    fi

    if [ "$version_code" -lt 33 ] 2>/dev/null; then
        log "注意: 你的 FontLoader 版本过低, 建议更新到 v1.2.3+"
        log "前往 $fontloader_github 更新 FontLoader"
    else
        log_succ "FontLoader 版本正常"
    fi
}

# ---------- 主流程 ----------
MAIN() {
    CHECK_COLOROS
    if ! CHECK_META_MODULE; then
        log_err "元模块检查不通过"
    fi
    CHECK_FONTLOADER

    echo && log "开始准备字体..."
    DETECT_UPDATE_MODE
    IMPORT_OLD_FONTS

    # 备份模块内嵌的补充字库 Emoji 字体, 供用户清除 emoji 槽位时恢复
    if [ -f "$MODPATH/system/fonts/NotoColorEmoji.ttf" ] && [ ! -f "$MODPATH/backup/NotoColorEmoji.ttf" ]; then
        mkdir -p "$MODPATH/backup"
        cp -f "$MODPATH/system/fonts/NotoColorEmoji.ttf" "$MODPATH/backup/NotoColorEmoji.ttf"
    fi

    echo && log "开始安装字体..."
    if sh "$MODPATH/apply.sh" "$MODPATH"; then
        echo && log_succ "所有字体安装成功, 重启设备后生效"
    else
        echo && log_err "字体安装出现问题, 请联系开发者"
    fi
}

MAIN
