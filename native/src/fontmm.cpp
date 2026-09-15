// FontMM Zygisk 模块 — 字体预加载
// SPDX-License-Identifier: GPL-3.0
//
// 背景: Android 12 起字体不再由 zygote 预加载, 而是各 app 进程按需读取。
// 当 Root 管理器对某个 app 执行「卸载模块」(DenyList / App Profile), 该 app 的
// 挂载视图里就没有模块的字体了; 但 app 启动早期仍会去读这些字体, 结果读不到,
// 表现为字体显示异常甚至闪退。
//
// 解法: 在 app specialize *之前* (此时进程仍是 zygote 的挂载视图) 让 ART 把字体
// 数据读进 Skia 的全局缓存。缓存的 key 是字体路径, 且进程生命周期内不清除, 因此
// specialize 之后即使路径已不可访问, 仍能命中缓存正常渲染。
//
// 与参考实现 (JingMatrix/FontLoader) 的差异:
//   1. 只预热 FontMM 自己的字体 —— 字体清单在编译期已知, 无需 root companion
//      进程扫描 /data/adb/modules/*/system/fonts 再通过 socket 传回。
//      这样省掉了整个 companion 与 IPC, 代码量与攻击面都大幅缩小。
//   2. 不包含 HideFromMaps (把字体从 /proc/self/maps 摘除的反检测逻辑)。
//      参考实现里该函数是死代码, 从未被调用; 且它对字体正常渲染并非必需。
//
// 目标架构: arm64 (ColorOS 16 设备), 产物 zygisk/arm64-v8a.so
//
// 加载约束 (编译选项据此确定, 见 dev/lib/ndk.mjs):
//   Zygisk 提供者 (Magisk / Zygisk Next / ReZygisk 等) 用自己的 ELF 加载器装载本库,
//   不使用系统 dlopen。该加载器只从系统库目录解析依赖, 因此本库不得依赖
//   libc++_shared.so, 也不得引用其提供的 __cxa_guard_* (故禁用线程安全静态初始化)。

#include <jni.h>
#include <unistd.h>
#include <android/log.h>

#include <cstring>

#include "zygisk.hpp"

using zygisk::Api;
using zygisk::AppSpecializeArgs;
using zygisk::ServerSpecializeArgs;

#define LOG_TAG "FontMM"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// 需要预热的字体 (系统路径)。
//
// 这些正是 apply.sh 会写入 system/fonts/ 的文件, 也是在 fonts.xml 中被
// sans-serif / sys-sans-en / zh-Hans / zh-Hant 等家族引用的文件。缺一个都可能
// 让某个家族在 DenyList 应用里渲染失败。
//
// 注意: 仅列出 FontMM 确实会替换的文件 (与 src/apply.sh 的映射表保持一致);
// 未设置的槽位不会产生对应文件, 此时该项会被 prepare 阶段跳过。
static const char *const kFontFiles[] = {
    // 中文简体槽位
    "/system/fonts/SysSans-Hans-Regular.ttf",
    "/system/fonts/SysFont-Static-Regular.ttf",
    "/system/fonts/SysFont-Myanmar.ttf",
    "/system/fonts/SysFont-Hans-Regular.ttf",
    // 中文繁体槽位
    "/system/fonts/SysSans-Hant-Regular.ttf",
    "/system/fonts/SysFont-Hant-Regular.ttf",
    // 英文 & 数字槽位
    "/system/fonts/SysSans-En-Regular.ttf",
    "/system/fonts/SysFont-Regular.ttf",
    // 等宽槽位
    "/system/fonts/DroidSansMono.ttf",
    // Emoji 槽位
    "/system/fonts/NotoColorEmoji.ttf",
};

/**
 * 预热单个字体: 调用 Typeface.nativeWarmUpCache(String)。
 *
 * 该方法在 AOSP 中是 private static native (Typeface.java), 签名 "(Ljava/lang/String;)V",
 * 从 Android 12 到 16 均存在。其原生实现为 Typeface_warmUpCache -> makeSkDataCached,
 * 把字体文件 mmap 进 Skia 的静态数据缓存 (以路径字符串为 key, 进程内不清除)。
 *
 * 这里通过 GetStaticMethodID 直接获取, 不做权限检查 —— 在 preAppSpecialize
 * 阶段进程仍具备 zygote 权限, 可以正常拿到该私有方法。
 */
static bool WarmUpFont(JNIEnv *env, jclass typefaceCls, jmethodID methodId, const char *path) {
    // 只预热确实存在的文件: 未设置的槽位不会有对应文件
    if (access(path, F_OK) != 0) return false;

    jstring jPath = env->NewStringUTF(path);
    if (jPath == nullptr) {
        env->ExceptionClear();
        return false;
    }

    env->CallStaticVoidMethod(typefaceCls, methodId, jPath);
    env->DeleteLocalRef(jPath);

    if (env->ExceptionCheck()) {
        LOGW("预热失败: %s", path);
        // 打印并清除异常, 避免影响 zygote 后续的 specialize 流程
        env->ExceptionDescribe();
        env->ExceptionClear();
        return false;
    }

    LOGD("已预热: %s", path);
    return true;
}

class FontMMModule : public zygisk::ModuleBase {
public:
    void onLoad(Api *api, JNIEnv *env) override {
        this->api = api;
        this->env = env;
    }

    void preAppSpecialize([[maybe_unused]] AppSpecializeArgs *args) override {
        // 对所有 app 进程都预热, 不按 uid 过滤。
        //
        // 这里刻意不做「跳过系统进程」的优化: ColorOS 有大量以 android.uid.system
        // (uid 1000) 运行的系统应用, 它们同样会被加入 DenyList 而失去字体访问权,
        // 正是最需要预热的对象。按 uid 过滤会恰好漏掉这类进程, 导致系统应用字体异常。
        //
        // 每个 app 进程只预热一次, 且只读已挂载的字体文件, 开销可接受。
        PreloadFonts();

        // 本模块只做一次性预热, 不留任何 hook, 可以安全卸载
        api->setOption(zygisk::Option::DLCLOSE_MODULE_LIBRARY);
    }

    void preServerSpecialize([[maybe_unused]] ServerSpecializeArgs *args) override {
        api->setOption(zygisk::Option::DLCLOSE_MODULE_LIBRARY);
    }

private:
    Api *api{};
    JNIEnv *env{};

    void PreloadFonts() {
        jclass typefaceCls = env->FindClass("android/graphics/Typeface");
        if (typefaceCls == nullptr) {
            env->ExceptionClear();
            LOGE("找不到 android.graphics.Typeface");
            return;
        }

        jmethodID methodId = env->GetStaticMethodID(typefaceCls, "nativeWarmUpCache",
                                                    "(Ljava/lang/String;)V");
        if (methodId == nullptr) {
            env->ExceptionClear();
            LOGE("找不到 Typeface.nativeWarmUpCache (系统版本不兼容?)");
            env->DeleteLocalRef(typefaceCls);
            return;
        }

        int ok = 0;
        for (const char *path : kFontFiles) {
            if (WarmUpFont(env, typefaceCls, methodId, path)) ok++;
        }

        LOGD("字体预热完成: %d/%zu", ok, sizeof(kFontFiles) / sizeof(kFontFiles[0]));

        env->DeleteLocalRef(typefaceCls);
    }
};

REGISTER_ZYGISK_MODULE(FontMMModule)
