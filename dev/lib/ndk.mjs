// dev/lib/ndk.mjs — Android NDK 工具链定位与 C++ 交叉编译
//
// Zygisk 模块必须编译成 aarch64 的 ELF 共享库, 因此需要 Android NDK。
// NDK 体积很大 (约 600MB) 且不进仓库, 通过环境变量或常见安装位置查找。
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ROOT, NATIVE_DIR } from './paths.mjs';
import { run } from './exec.mjs';

/** 目标 ABI: ColorOS 16 设备均为 arm64 */
export const TARGET_ABI = 'arm64-v8a';
/** 最低 API 级别: 与 nativeWarmUpCache 的引入版本一致 (Android 12) */
export const MIN_API = 31;

/** NDK 常见安装位置 (按优先级) */
const NDK_CANDIDATES = [
  process.env.ANDROID_NDK_HOME,
  process.env.ANDROID_NDK_ROOT,
  process.env.NDK_HOME,
  path.join(os.homedir(), 'opt', 'android-ndk-r27c'),
  path.join(os.homedir(), 'Android', 'Sdk', 'ndk'),
  '/opt/android-ndk',
  '/usr/lib/android-ndk',
];

/**
 * 定位 NDK 根目录。
 * @returns {Promise<string|null>} NDK 根目录, 未找到返回 null
 */
export async function findNdk() {
  for (const candidate of NDK_CANDIDATES) {
    if (!candidate) continue;
    // 直接指向 NDK 根
    const sourceProps = path.join(candidate, 'source.properties');
    try {
      await fsp.access(sourceProps);
      return candidate;
    } catch {
      // 不是 NDK 根, 继续; 也可能是 ndk/<版本>/ 形式 (Android SDK 布局)
    }
    // Android SDK 的 ndk/ 目录: 取版本号最大的一个
    try {
      const entries = (await fsp.readdir(candidate, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
        .reverse();
      for (const name of entries) {
        const dir = path.join(candidate, name);
        try {
          await fsp.access(path.join(dir, 'source.properties'));
          return dir;
        } catch {
          // 继续找下一个
        }
      }
    } catch {
      // 目录不存在, 继续
    }
  }
  return null;
}

/** 由 NDK 根目录推导出 prebuilt 工具链的 bin 目录 */
export function toolchainBin(ndkRoot) {
  return path.join(ndkRoot, 'toolchains', 'llvm', 'prebuilt', 'linux-x86_64', 'bin');
}

/**
 * 生成 compile_commands.json, 让编辑器 (clangd / VSCode C/C++ 扩展) 用与真实构建
 * 完全相同的参数解析源码, 从而正确找到 NDK 的头文件 (jni.h / android/log.h 等),
 * 否则编辑器会满屏 "无法打开源文件" 的 IntelliSense 报错。
 *
 * 不依赖 CMake: 我们只有单个源文件, 直接按 clang 的 JSON Compilation Database 格式
 * 写一条记录即可。写入仓库根, 便于编辑器自动发现; 该文件是构建产物, 已被 .gitignore 忽略。
 *
 * @param {string} cxx 编译器绝对路径
 * @param {string[]} args 构建参数
 */
async function writeCompileCommands(cxx, args) {
  const sourceRel = path.join('native', 'src', 'fontmm.cpp');
  const sourceAbs = path.join(ROOT, sourceRel);

  const entry = {
    directory: ROOT,
    arguments: [cxx, ...args.map((a) => (a === sourceRel ? sourceAbs : a))],
    file: sourceAbs,
  };

  await fsp.writeFile(
    path.join(ROOT, 'compile_commands.json'),
    JSON.stringify([entry], null, 2),
    'utf8',
  );
}

/**
 * 编译 Zygisk 模块。
 *
 * 编译选项说明 (每一项都影响产物能否被 Zygisk 加载器正确加载):
 *   -fPIC / -shared         共享库基础
 *   -fvisibility=hidden    只导出显式标记的符号 (zygisk_module_entry)
 *   -ffixed-x18             ARM64 平台寄存器约定, Android 要求
 *   -fno-exceptions -fno-rtti        减小体积, 且异常跨 .so 边界无意义
 *   -fno-threadsafe-statics          取消静态局部变量的线程安全 guard。
 *                          否则会引入 __cxa_guard_acquire/release, 这两个符号
 *                          不在 bionic libc 的导出表里 (仅 libc++ 提供), 而
 *                          Zygisk 的自研加载器只解析系统库, 会导致加载失败。
 *   -nostdlib++             不链接 libc++ (我们的代码不需要), 产物从 464KB 降到 10KB,
 *                          同时避免依赖 libc++_shared.so (它不在加载器的搜索路径中)。
 *                          静态初始化改由 C++ 编译器直接发射, 无需运行时支持。
 *
 * @param {string} ndkRoot NDK 根目录
 * @param {{onLog?: (msg: string) => void}} [opts]
 * @returns {Promise<{ outFile: string, size: number }>}
 */
export async function buildZygiskModule(ndkRoot, opts = {}) {
  const bin = toolchainBin(ndkRoot);
  const cxx = path.join(bin, `aarch64-linux-android${MIN_API}-clang++`);
  const nm = path.join(bin, 'llvm-nm');
  const strip = path.join(bin, 'llvm-strip');

  const outDir = path.join(NATIVE_DIR, 'build');
  const outFile = path.join(outDir, `${TARGET_ABI}.so`);
  await fsp.mkdir(outDir, { recursive: true });

  const args = [
    '-std=c++20',
    '-O2',
    '-fPIC',
    '-shared',
    '-Wall',
    '-Wextra',
    '-fvisibility=hidden',
    '-fvisibility-inlines-hidden',
    '-ffixed-x18',
    '-fno-exceptions',
    '-fno-rtti',
    '-fno-threadsafe-statics',
    '-nostdlib++',
    // 可复现构建: 去掉源码绝对路径
    '-ffile-prefix-map=' + NATIVE_DIR + '=.',
    '-o',
    outFile,
    path.join(NATIVE_DIR, 'src', 'fontmm.cpp'),
    '-llog',
  ];

  run(cxx, args, { cwd: ROOT });
  // 去掉调试符号与本地符号 (6.8KB vs 10.4KB), 动态符号表不受影响
  run(strip, ['--strip-unneeded', outFile], { cwd: ROOT });
  opts.onLog?.(`编译完成: ${path.relative(ROOT, outFile)}`);

  // 生成 compile_commands.json: 供 clangd / VSCode C/C++ 扩展解析本文件,
  // 使其能定位 NDK 的头文件 (jni.h / android/log.h 等), 否则编辑器会满屏
  // "无法打开源文件" 的 IntelliSense 报错。
  await writeCompileCommands(cxx, args);

  // 校验导出符号: Zygisk 只认 zygisk_module_entry, 多导出会污染宿主进程符号表
  const symbols = (run(nm, ['-D', '--defined-only', outFile], { quiet: true }).stdout ?? '')
    .split('\n')
    .map((l) => l.trim().split(/\s+/).pop())
    .filter(Boolean);
  const expected = 'zygisk_module_entry';
  const unexpected = symbols.filter((s) => s !== expected);
  if (!symbols.includes(expected)) {
    throw new Error(`产物缺少 ${expected} 导出符号 (Zygisk 无法识别该模块)`);
  }
  if (unexpected.length > 0) {
    throw new Error(`产物导出了预期外的符号: ${unexpected.join(', ')}`);
  }

  // 校验没有链接 libc++_shared: 它不在 Zygisk 加载器的库搜索路径中
  const needed = (run(
    path.join(bin, 'llvm-readelf'),
    ['-d', outFile],
    { quiet: true },
  ).stdout ?? '')
    .split('\n')
    .filter((l) => l.includes('NEEDED'))
    .map((l) => l.match(/\[(.*)\]/)?.[1])
    .filter(Boolean);
  const libcxx = needed.find((l) => l.includes('libc++'));
  if (libcxx) {
    throw new Error(
      `产物依赖 ${libcxx}, 该库不在 Zygisk 加载器的搜索路径中, 会导致模块加载失败`,
    );
  }
  opts.onLog?.(`动态依赖: ${needed.join(', ')}`);

  const { size } = await fsp.stat(outFile);
  return { outFile, size };
}
