#!/usr/bin/env node
// dev/build-subset.mjs — 编译 fontmm-subset (英文字体子集化工具, issue #10)
//
// 产物输出到 src/tools/fontmm-subset, 随模块 zip 打包, 由 apply.sh 在设备端调用。
// 依赖 harfbuzz 的 subset API (静态链接), 源码与编译产物均带缓存, 详见 dev/lib/harfbuzz.mjs。
//
// 用法: node dev/build-subset.mjs
import fsp from 'node:fs/promises';
import path from 'node:path';
import { log, die } from './lib/log.mjs';
import { ROOT, SRC_DIR } from './lib/paths.mjs';
import { findNdk } from './lib/ndk.mjs';
import { buildSubsetTool, HARFBUZZ_VERSION } from './lib/harfbuzz.mjs';

const ndkRoot = await findNdk();
if (!ndkRoot) {
  die(
    '未找到 Android NDK。请设置 ANDROID_NDK_HOME, 或下载到 ~/opt/android-ndk-r27c\n' +
      '    下载: https://developer.android.com/ndk/downloads',
  );
}
log.info(`NDK: ${ndkRoot}`);
log.info(`harfbuzz: ${HARFBUZZ_VERSION}`);

const out = path.join(SRC_DIR, 'tools', 'fontmm-subset');
const size = await buildSubsetTool(ndkRoot, out);

// 保证可执行位: 打包时按磁盘权限位写入 zip, 设备端才能直接运行
await fsp.chmod(out, 0o755);
log.ok(`产物: ${path.relative(ROOT, out)} (${(size / 1048576).toFixed(1)}MB)`);
