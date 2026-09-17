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

log_warn() {
    local msg="$1"
    echo "[!] $msg"
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
# 不阻止安装: 非 ColorOS 16 时仅提示兼容性风险
CHECK_COLOROS() {
    local oplus_api=""
    oplus_api="$(getprop ro.build.version.oplus.api 2>/dev/null || true)"

    if [ -z "$oplus_api" ]; then
        log_warn "当前系统不是 ColorOS, 可能无法正常替换字体, 存在兼容性风险"
        CONFIRM_RISK "当前系统不是 ColorOS" "字体替换可能无法生效, 且可能导致字体渲染异常"
        return 0
    fi

    local oplus_display=""
    oplus_display="$(getprop ro.build.version.oplusrom.display 2>/dev/null || true)"
    local major="${oplus_display%%.*}"

    if [ "${major:-0}" -lt 16 ] 2>/dev/null; then
        log_warn "ColorOS 版本过低 (${oplus_display:-未知}), 建议 16.0 及以上, 低版本可能存在兼容性风险"
        CONFIRM_RISK "ColorOS 版本过低 (${oplus_display:-未知})" "建议 16.0 及以上, 低版本可能存在兼容性风险"
        return 0
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

# ---------- 音量键确认 ----------
# 音量上键确认继续, 音量下键中止安装
btn() {
    while :; do
        local c
        c="$(getevent -qlc 1 2>/dev/null | awk '{ print $3 }')"
        case "$c" in
        KEY_VOLUMEUP)
            echo "0"
            return
            ;;
        KEY_VOLUMEDOWN)
            echo "1"
            return
            ;;
        esac
    done
}

# 通用风险确认 (兼容性等场景)
CONFIRM_RISK() {
    local reason="$1"
    local detail="$2"
    echo
    log "警告: $reason"
    [ -n "$detail" ] && log "$detail"
    log "请按音量上键确认继续安装, 按音量下键取消安装。"
    if [ "$(btn)" = "1" ]; then
        log_err "用户取消安装"
    fi
}

# ---------- 判断 Zygisk 环境 ----------
# 模块自带字体预加载 (zygisk/arm64-v8a.so), 但 Zygisk 框架本身需要由 Root 管理器
# 或独立的 Zygisk 提供者 (Magisk 内置 Zygisk / Zygisk Next / ReZygisk 等) 提供。
# 缺少时模块仍可安装, 只是被 DenyList 的应用可能字体异常, 故仅提示不阻断。
CHECK_ZYGISK_ENV() {
    local ok=0

    # Magisk 内置 Zygisk: 以是否开启 Zygisk 为准 (magisk --sqlite 查询数据库开关)
    if [ -f /data/adb/magisk/magisk ]; then
        local zg=""
        zg="$(/data/adb/magisk/magisk --sqlite "SELECT value FROM settings WHERE key='zygisk';" 2>/dev/null | tr -d '\r')"
        if [ "$zg" = "1" ]; then
            log_succ "Magisk 内置 Zygisk 已启用"
            ok=1
        fi
    fi

    # 独立 Zygisk 提供者模块。判据是提供者**独有**的文件, 而不是目录名或 zygisk/ 目录 ——
    # 后者是「Zygisk 模块」(消费者) 的标志, 任何自带 zygisk/<abi>.so 的模块都有,
    # 本模块自己也有。曾据此误判 (把 Hide My Applist 之类的消费者当成提供者)。
    #
    # 判据取自两个提供者的实际安装布局 (核对过发布包与安装脚本):
    #   Zygisk Next (模块 ID: zygisksu)
    #     bin/zygiskd64   守护进程
    #     lib64/libzygisk.so / lib64/libzn_loader.so / lib64/libpayload.so
    #   ReZygisk (模块 ID: rezygisk)
    #     bin/zygiskd64 / bin/zygisk-ptrace64
    #     lib64/libzygisk.so
    # 共同且充分的特征: lib{64}/libzygisk.so (核心库) 或 bin/zygiskd{64,32} (守护进程)。
    # 这两个文件名是提供者专有的, 普通 Zygisk 模块不会用到。
    if [ "$ok" -eq 0 ]; then
        local dir="" name="" f=""
        for dir in /data/adb/modules/*; do
            [ -d "$dir" ] || continue
            name="$(basename "$dir")"
            [ "$name" = "FontMM" ] && continue
            [ -f "$dir/disable" ] && continue

            local hit=""
            for f in "$dir"/lib64/libzygisk.so "$dir"/lib/libzygisk.so \
                "$dir"/bin/zygiskd64 "$dir"/bin/zygiskd32 "$dir"/bin/zygiskd \
                "$dir"/lib64/libzn_loader.so "$dir"/lib/libzn_loader.so; do
                if [ -f "$f" ]; then
                    hit="${f#"$dir"/}"
                    break
                fi
            done

            [ -z "$hit" ] && continue
            log_succ "检测到 Zygisk 提供者: $name ($hit)"
            ok=1
            break
        done
    fi

    if [ "$ok" -eq 0 ]; then
        log_warn "未检测到可用的 Zygisk 环境"
        log "模块的字体预加载依赖 Zygisk, 缺少时被卸载模块的应用可能字体异常"
        log "请启用 Magisk 内置 Zygisk, 或安装 Zygisk Next / ReZygisk"
        CONFIRM_RISK "未检测到 Zygisk 环境" "字体预加载不会生效, 被 DenyList 的应用可能字体显示异常"
    fi
}

# ---------- 字体配置 XML: 扫描设备 + 同步派生配置 ----------
# 模块只内置 fonts.xml 一份主配置; 各派生配置 (fonts_base/ule/font_fallback) 按设备实际文件补齐,
# 设备缺失时回退内置 fonts.xml, 提升跨 ColorOS 版本的兼容性 (issue #7)
# 随后用模块内置 fontmm-wght -sync 把主配置同步到全部派生配置
SYNC_FONT_XMLS() {
    local xml_src="$MODPATH/system/etc/fonts.xml"

    # 派生配置在设备上的真实路径 (模块内 overlay 的对应位置)
    local device_xmls="system/etc/fonts_base.xml
system/etc/fonts_ule.xml
system/etc/font_fallback.xml
system/system_ext/etc/fonts_base.xml
system/system_ext/etc/fonts_ule.xml"

    local rel=""
    for rel in $device_xmls; do
        mkdir -p "$MODPATH/$(dirname "$rel")"
        if [ -f "/system/$rel" ]; then
            cp -f "/system/$rel" "$MODPATH/$rel"
            log "已从设备复制配置: $rel"
        else
            cp -f "$xml_src" "$MODPATH/$rel"
            log "设备无 $rel, 回退内置 fonts.xml"
        fi
    done

    # 用 Go 程序把主配置同步到派生配置 (避免 shell 复制与主配置不一致)。
    # 工具在刷入后是 0644 (KernelSU 解压时不保留 zip 里的执行位), 故不能靠 -x
    # 判断可用性; 执行前临时加执行位, 用完立即还原。
    local wght="$MODPATH/tools/fontmm-wght"
    if [ -f "$wght" ]; then
        chmod 0755 "$wght" 2>/dev/null
        if "$wght" -mode 0 -sync -xml-dir "$MODPATH" >/dev/null 2>&1; then
            log "已同步派生字体配置"
        else
            log "同步派生配置失败 (可忽略, 使用内置副本)"
        fi
        chmod 0644 "$wght" 2>/dev/null
    fi
}

# ---------- 判断 FontLoader ----------
# 本模块已内置字体预加载 (zygisk/arm64-v8a.so), 与外部 FontLoader 模块功能重叠。
# 两者同时启用会重复预热、并可能互相干扰, 因此检测到旧 FontLoader 时建议禁用它。
# 禁用方式: 在其模块目录放置 disable 文件 (模块的通用停用约定, 重启后生效),
# 不删除其数据, 用户可随时移除该文件恢复。
DISABLE_OLD_FONTLOADER() {
    local found=""
    local hit=""

    # 按目录名候选 + 内容特征双重识别:
    #   - RikkaW/FontLoader 原版: 模块目录名多为 fontloader
    #   - JingMatrix/FontLoader:  build.gradle 中 moduleId = 'font-loader'
    #   - 兜底: 扫描各模块 module.prop 描述中明确含 FontLoader 字样者
    local names="fontloader font-loader font_loader"

    local name="" dir=""
    for name in $names; do
        dir="/data/adb/modules/$name"
        if [ -d "$dir" ]; then
            hit="$name"
            break
        fi
    done

    # 目录名未命中时, 扫描其它模块的 module.prop 描述
    if [ -z "$hit" ]; then
        local d="" prop=""
        for d in /data/adb/modules/*; do
            [ -d "$d" ] || continue
            [ "$(basename "$d")" = "FontMM" ] && continue
            prop="$d/module.prop"
            [ -f "$prop" ] || continue
            # 只认明确声明为 FontLoader 的模块, 避免误伤其他模块
            if grep -qiE '^description=.*font.?loader' "$prop" 2>/dev/null; then
                hit="$(basename "$d")"
                break
            fi
        done
    fi

    if [ -n "$hit" ]; then
        dir="/data/adb/modules/$hit"
        if [ -f "$dir/disable" ]; then
            log "外部 FontLoader ($hit) 已处于停用状态"
        elif touch "$dir/disable" 2>/dev/null; then
            log_succ "已停用外部 FontLoader 模块: $hit"
            found="$hit"
        else
            log_warn "检测到外部 FontLoader ($hit) 但无法停用, 建议手动在管理器中关闭"
            found="$hit"
        fi
    fi

    if [ -n "$found" ]; then
        log "本模块已内置字体预加载, 无需外部 FontLoader; 重启后以本模块为准"
    fi
}

# ---------- 主流程 ----------
MAIN() {
    CHECK_COLOROS
    if ! CHECK_META_MODULE; then
        log_err "元模块检查不通过"
    fi
    CHECK_ZYGISK_ENV
    DISABLE_OLD_FONTLOADER

    echo && log "开始准备字体..."
    DETECT_UPDATE_MODE
    IMPORT_OLD_FONTS

    # 同步派生字体配置 (设备 XML 扫描 + fontmm-wght -sync)
    SYNC_FONT_XMLS

    # 校验内置的 Zygisk 字体预加载模块存在 (缺失则 DenyList 应用可能字体异常)
    if [ ! -f "$MODPATH/zygisk/arm64-v8a.so" ]; then
        log_warn "缺少 zygisk/arm64-v8a.so, 字体预加载不可用 (DenyList 应用可能字体异常)"
    fi

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
