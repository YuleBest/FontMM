// dev/lib/harfbuzz.mjs — harfbuzz 源码获取与静态库编译 (fontmm-subset 用)
//
// fontmm-subset 依赖 harfbuzz 的 subset API。harfbuzz 源码解压后 97MB,
// 不适合提交进仓库, 因此构建时按需下载。
//
// 缓存: harfbuzz 的编译占整个构建的绝大部分时间 (实测约 88s, 而下载 8.6s、
// 解压 1.3s、链接 1.1s)。因此缓存的是**编译好的对象文件**, 而不是源码 ——
// 这样只改 fontmm-subset.cc 时无需重编 harfbuzz。
//   缓存键 = harfbuzz 版本 + NDK 版本 + 编译选项
// 三者任一变化即重新编译, 避免用到不匹配的对象文件。
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, NATIVE_DIR } from './paths.mjs';
import { log } from './log.mjs';
import { run } from './exec.mjs';
import { toolchainBin, MIN_API } from './ndk.mjs';

/** harfbuzz 版本 (固定: 该版本已实测编译通过且保留可变字体特性) */
export const HARFBUZZ_VERSION = '11.5.0';

/** harfbuzz 源码缓存目录 (下载的压缩包 + 解压结果都放这里) */
const SOURCE_CACHE_DIR = path.join(ROOT, 'dev', '.cache', 'harfbuzz');
/** 编译产物缓存目录 */
const OBJ_CACHE_DIR = path.join(ROOT, 'dev', '.cache', 'harfbuzz-obj');

/** 下载地址 (官方 release 资产) */
function downloadUrl(version) {
  return `https://github.com/harfbuzz/harfbuzz/releases/download/${version}/harfbuzz-${version}.tar.xz`;
}

/** 编译 harfbuzz 用的选项 (构成缓存键的一部分) */
/**
 * 编译 harfbuzz 用的选项 (不含 -ffile-prefix-map, 它需要源码根路径, 在编译处追加)。
 *
 * 为何需要 prefix-map: harfbuzz 会通过 __FILE__ 与调试信息把源码绝对路径嵌进
 * 目标文件, 使产物哈希随构建目录变化 (CI 的 /home/runner/... 与本地不同)。
 * 映射为相对路径后消除该差异 —— 与 fontmm-wght 用 -trimpath 是同一目的。
 */
const HARFBUZZ_CXXFLAGS = ['-std=c++11', '-O2', '-fPIC'];

/**
 * 计算编译缓存键: harfbuzz 版本 + NDK 版本 + 编译选项。
 * NDK 版本从 source.properties 读 (精确到补丁号, 因为不同补丁的 clang 产物不同)。
 */
async function objectCacheKey(ndkRoot) {
  let ndkVersion = 'unknown';
  try {
    const props = await fsp.readFile(path.join(ndkRoot, 'source.properties'), 'utf8');
    const m = props.match(/^Pkg\.Revision\s*=\s*(.+)$/m);
    if (m) ndkVersion = m[1].trim();
  } catch {
    // 读不到就用 unknown; 缓存键仍包含 harfbuzz 版本与选项, 只是粒度变粗
  }
  // 键须覆盖全部影响产物的因素。CACHE_KEY_FLAGS 是编译时实际使用的标志集
  // (不含依赖源码路径的 -ffile-prefix-map, 那部分固定在源码头). 若新增编译标志,
  // 一并加入此列表, 否则改标志不会使缓存失效。
  const flags = [...HARFBUZZ_CXXFLAGS, ...CACHE_KEY_FLAGS];
  return `${HARFBUZZ_VERSION}|ndk=${ndkVersion}|api=${MIN_API}|${flags.join(' ')}`;
}

/** 参与缓存键、但不随编译调用显式传递的标志 (记录在此以便改动能失效缓存) */
const CACHE_KEY_FLAGS = ['-ffile-prefix-map=<srcRoot>=harfbuzz'];

/** 标记文件: 记录该对象文件对应的缓存键 */
function keyFile(objPath) {
  return `${objPath}.key`;
}

/**
 * 确保 harfbuzz 源码已就绪 (解压到缓存目录)。
 * 已解压则直接复用, 不重复下载。
 * @returns {Promise<string>} harfbuzz 源码根目录 (含 src/)
 */
export async function ensureHarfBuzzSource() {
  const srcRoot = path.join(SOURCE_CACHE_DIR, `harfbuzz-${HARFBUZZ_VERSION}`);
  const srcDir = path.join(srcRoot, 'src');
  // 关键文件存在即认为源码完整 (与压缩包内容对应)
  const sentinel = path.join(srcDir, 'harfbuzz-subset.cc');
  try {
    await fsp.access(sentinel);
    log.info(`harfbuzz 源码已缓存 (${HARFBUZZ_VERSION})`);
    return srcRoot;
  } catch {
    // 需要下载
  }

  const archive = path.join(SOURCE_CACHE_DIR, `harfbuzz-${HARFBUZZ_VERSION}.tar.xz`);
  await fsp.mkdir(SOURCE_CACHE_DIR, { recursive: true });

  // 压缩包已存在且非空则跳过下载 (网络抖动时重跑不必重下)
  let needDownload = true;
  try {
    const st = await fsp.stat(archive);
    if (st.size > 0) {
      log.info(`harfbuzz 压缩包已缓存 (${(st.size / 1048576).toFixed(1)}MB)`);
      needDownload = false;
    }
  } catch {
    // 不存在, 需下载
  }

  if (needDownload) {
    log.step(`下载 harfbuzz ${HARFBUZZ_VERSION} 源码...`);
    const url = downloadUrl(HARFBUZZ_VERSION);
    // 用 curl/wget: Node 的 fetch 对 GitHub 重定向与大文件支持较繁琐
    const curlOk = await downloadWith('curl', ['-fsSL', '-o', archive, url]);
    if (!curlOk) {
      const wgetOk = await downloadWith('wget', ['-q', '-O', archive, url]);
      if (!wgetOk) {
        throw new Error(
          `下载 harfbuzz 源码失败。请检查网络, 或手动下载后放到:\n  ${archive}\n  ${url}`,
        );
      }
    }
    const { size } = await fsp.stat(archive);
    log.ok(`已下载 (${(size / 1048576).toFixed(1)}MB)`);
  }

  log.step('解压 harfbuzz 源码...');
  await fsp.mkdir(srcRoot, { recursive: true });
  run('tar', ['xf', archive, '-C', SOURCE_CACHE_DIR]);
  // 解压后应出现 harfbuzz-<版本>/src
  try {
    await fsp.access(sentinel);
  } catch {
    throw new Error(`解压后未找到 ${sentinel}, 压缩包可能损坏 (可删除后重试)`);
  }
  log.ok('源码就绪');
  return srcRoot;
}

/** 尝试用某个工具下载, 成功返回 true */
async function downloadWith(cmd, args) {
  try {
    run(cmd, args, { quiet: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取 (必要时编译) harfbuzz 的 subset 对象文件, 带缓存。
 *
 * @param {string} ndkRoot NDK 根目录
 * @returns {Promise<string>} 对象文件路径
 */
export async function ensureHarfBuzzObject(ndkRoot) {
  const srcRoot = await ensureHarfBuzzSource();
  const bin = toolchainBin(ndkRoot);
  const cxx = path.join(bin, `aarch64-linux-android${MIN_API}-clang++`);

  const key = await objectCacheKey(ndkRoot);
  const objName = `harfbuzz-subset-${shortHash(key)}.o`;
  const objPath = path.join(OBJ_CACHE_DIR, objName);

  // 命中检查: 对象文件存在 + 标记文件的键一致
  try {
    await fsp.access(objPath);
    const savedKey = (await fsp.readFile(keyFile(objPath), 'utf8')).trim();
    if (savedKey === key) {
      const { size } = await fsp.stat(objPath);
      log.info(`复用 harfbuzz 编译缓存 (${(size / 1048576).toFixed(1)}MB, 免去约 88s 重编)`);
      return objPath;
    }
    log.info('harfbuzz 缓存键不匹配 (版本/NDK/选项已变), 重新编译');
  } catch {
    // 无缓存
  }

  log.step('编译 harfbuzz subset (首次约 1-2 分钟, 之后走缓存)...');
  await fsp.mkdir(OBJ_CACHE_DIR, { recursive: true });
  run(
    cxx,
    [
      ...HARFBUZZ_CXXFLAGS,
      '-c',
      // 去掉源码绝对路径: 否则需嵌入源码路径的宏/调试信息会随构建目录变化,
      // 使 CI 与本地编译出的对象文件字节不同 (进而产物哈希不同)
      `-ffile-prefix-map=${srcRoot}=harfbuzz`,
      '-I',
      path.join(srcRoot, 'src'),
      '-o',
      objPath,
      path.join(srcRoot, 'src', 'harfbuzz-subset.cc'),
    ],
    { cwd: ROOT },
  );
  // 先写对象文件再写键: 中途失败时键文件不存在 → 视为无缓存, 不会用到半成品
  await fsp.writeFile(keyFile(objPath), key, 'utf8');
  const { size } = await fsp.stat(objPath);
  log.ok(`已编译并缓存 (${(size / 1048576).toFixed(1)}MB)`);
  return objPath;
}

/** 由缓存键派生短哈希, 作为对象文件名 (避免键含特殊字符) */
function shortHash(key) {
  // 用简单稳定的哈希即可: 只需在键变化时文件名也变化
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * 编译 fontmm-subset 可执行文件。
 * @param {string} ndkRoot
 * @param {string} outFile 输出路径
 * @returns {Promise<number>} 产物字节数
 */
export async function buildSubsetTool(ndkRoot, outFile) {
  const srcRoot = await ensureHarfBuzzSource();
  const objPath = await ensureHarfBuzzObject(ndkRoot);
  const bin = toolchainBin(ndkRoot);
  const cxx = path.join(bin, `aarch64-linux-android${MIN_API}-clang++`);

  log.step('链接 fontmm-subset...');
  await fsp.mkdir(path.dirname(outFile), { recursive: true });
  run(
    cxx,
    [
      '-std=c++11',
      '-O2',
      '-fPIC',
      '-ffixed-x18',
      // 可复现构建: 去掉源码绝对路径
      '-ffile-prefix-map=' + NATIVE_DIR + '=.',
      '-I',
      path.join(srcRoot, 'src'),
      '-o',
      outFile,
      path.join(NATIVE_DIR, 'src', 'subset', 'fontmm-subset.cc'),
      objPath,
      // 静态链接 libc++: 设备端无需额外 .so, 与 fontmm-wght 的做法一致
      '-static-libstdc++',
    ],
    { cwd: ROOT },
  );

  const { size } = await fsp.stat(outFile);
  return size;
}
