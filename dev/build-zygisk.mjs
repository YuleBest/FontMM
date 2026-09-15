#!/usr/bin/env node
// dev/build-zygisk.mjs — 交叉编译 Zygisk 模块 (C++ -> arm64-v8a.so)
//
// 产物输出到 src/zygisk/<abi>.so, 随模块 zip 打包。Zygisk 加载器按约定路径
// /data/adb/modules/<模块名>/zygisk/<abi>.so 查找模块, 因此文件名必须精确匹配
// (Magisk 与 ReZygisk 等实现均使用 ABI 全名, 如 arm64-v8a.so)。
//
// 需要 Android NDK。设置 ANDROID_NDK_HOME 指定, 或放到常见位置 (见 dev/lib/ndk.mjs)。
//
// 用法: node dev/build-zygisk.mjs
import fsp from 'node:fs/promises';
import path from 'node:path';
import { log, die } from './lib/log.mjs';
import { ROOT, SRC_DIR } from './lib/paths.mjs';
import { findNdk, buildZygiskModule, TARGET_ABI } from './lib/ndk.mjs';

const ndkRoot = await findNdk();
if (!ndkRoot) {
  die(
    '未找到 Android NDK。请设置 ANDROID_NDK_HOME, 或下载到 ~/opt/android-ndk-r27c\n' +
      '    下载: https://developer.android.com/ndk/downloads',
  );
}
log.info(`NDK: ${ndkRoot}`);

log.step(`交叉编译 Zygisk 模块 (android/${TARGET_ABI})...`);
const { outFile, size } = await buildZygiskModule(ndkRoot, {
  onLog: (m) => log.info(m),
});

// 复制到模块目录 (打包时按此路径收录)
const destDir = path.join(SRC_DIR, 'zygisk');
const dest = path.join(destDir, `${TARGET_ABI}.so`);
await fsp.mkdir(destDir, { recursive: true });
await fsp.copyFile(outFile, dest);
// 库文件不需要执行位, 但需要可读
await fsp.chmod(dest, 0o644);

log.ok(`产物: ${path.relative(ROOT, dest)} (${size} 字节)`);
