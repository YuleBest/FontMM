#!/usr/bin/env node
// dev/pack.mjs — 打包 FontMM 模块 (取代 cd.sh)
//
// 产出两个版本, 区别仅在于是否预置字体:
//   _preplace: 含 FONTS/hans.ttf, 适合全新安装
//   _template: FONTS/ 为空目录, 适合更新已有模块 (customize.sh 从旧模块继承字体)
//
// 流程: 编译 fontmm-wght (Go) / Zygisk 模块 (C++) / fontmm-subset (C++)
//       -> 生成 SHA256SUMS -> 打包两版 (复用预压缩缓存) -> 校验产物 -> 生成发布校验文件
//
// 用法: node dev/pack.mjs [--skip-go] [--skip-zygisk] [--skip-subset] [--no-cache]
//   --skip-go:     跳过 Go 交叉编译 (CI 中已单独构建时使用)
//   --skip-zygisk: 跳过 Zygisk 模块编译 (无 NDK 或已构建好时使用)
//   --skip-subset: 跳过 fontmm-subset 编译 (无网络或已构建好时使用)
//   --no-cache:    禁用预压缩缓存 (用于验证缓存与非缓存产物一致)
import fsp from 'node:fs/promises';
import path from 'node:path';
import { log, die, stopwatch } from './lib/log.mjs';
import { ROOT, SRC_DIR, DIST_DIR, DERIVED_XML_RELS, readVersion, safeFileVersion } from './lib/paths.mjs';
import { packDir, listEntries, indexZip, hashFile } from './lib/zip.mjs';
import { run, hasCommand } from './lib/exec.mjs';
import { buildWght, wghtBinRel, WGHT_BIN } from './lib/go.mjs';
import { subtreeKey, openCache, saveCacheFromZip } from './lib/zipcache.mjs';
import { findNdk, buildZygiskModule, TARGET_ABI } from './lib/ndk.mjs';
import { buildSubsetTool } from './lib/harfbuzz.mjs';

const skipGo = process.argv.includes('--skip-go');
const skipZygisk = process.argv.includes('--skip-zygisk');
const skipSubset = process.argv.includes('--skip-subset');
/** 预压缩缓存开关 (--no-cache 关闭; CI 中禁用可避免缓存目录带来的不确定性) */
const CACHE_ENABLED = !process.argv.includes('--no-cache');
/** 打包压缩级别 (与原 zip -2 一致); 也是缓存片段的压缩级别, 变更会使缓存失效 */
const COMPRESS_LEVEL = 2;
const elapsed = stopwatch();

// 可复现打包: 设置 SOURCE_DATE_EPOCH 时, 所有 zip 条目使用该固定时间戳,
// 使同一份源码在任意时间/机器构建出的 zip 逐字节一致。
// 未设置时沿用源文件 mtime (与 Info-ZIP 行为一致)。
const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH;
let fixedDate;
if (sourceDateEpoch) {
  const secs = Number(sourceDateEpoch);
  if (!Number.isFinite(secs)) die(`SOURCE_DATE_EPOCH 必须是秒级时间戳: ${sourceDateEpoch}`);
  fixedDate = new Date(secs * 1000);
}

const version = readVersion();
const fileVersion = safeFileVersion(version);
const preOut = path.join(DIST_DIR, `FontMM_v${fileVersion}_preplace.zip`);
const tplOut = path.join(DIST_DIR, `FontMM_v${fileVersion}_template.zip`);
log.step(`打包 FontMM v${version} -> ${path.relative(ROOT, DIST_DIR)}/`);
if (fixedDate) log.info(`SOURCE_DATE_EPOCH=${sourceDateEpoch} (固定时间戳, 可复现打包)`);

// ---------- 1. 交叉编译 fontmm-wght (字重覆写用的 Go 程序) ----------
if (skipGo) {
  log.info('已跳过 Go 交叉编译 (--skip-go)');
  try {
    await fsp.access(WGHT_BIN);
  } catch {
    die(`缺少 ${wghtBinRel()}, 请先运行 pnpm go:build`);
  }
  // 仍要保证可执行位 (CI 中二进制由 artifact 下载而来, 可能丢失权限)
  await fsp.chmod(WGHT_BIN, 0o755);
} else {
  if (!hasCommand('go')) die('未找到 go 命令, 请先安装 Go 工具链');
  log.step('交叉编译 fontmm-wght (android/arm64)...');
  const size = await buildWght();
  log.ok(`产物: ${wghtBinRel()} (${size} 字节)`);
}

// ---------- 2. 交叉编译 Zygisk 模块 (字体预加载用的 C++ 程序) ----------
const zygiskBin = path.join(SRC_DIR, 'zygisk', `${TARGET_ABI}.so`);
if (skipZygisk) {
  log.info('已跳过 Zygisk 模块编译 (--skip-zygisk)');
  try {
    await fsp.access(zygiskBin);
  } catch {
    die(`缺少 ${path.relative(ROOT, zygiskBin)}, 请先运行 pnpm zygisk:build`);
  }
} else {
  const ndkRoot = await findNdk();
  if (!ndkRoot) {
    die(
      '未找到 Android NDK, 无法编译 Zygisk 模块。\n' +
        '    请设置 ANDROID_NDK_HOME, 或下载到 ~/opt/android-ndk-r27c\n' +
        '    仅打包现有产物: node dev/pack.mjs --skip-zygisk',
    );
  }
  log.step(`交叉编译 Zygisk 模块 (android/${TARGET_ABI})...`);
  const { size } = await buildZygiskModule(ndkRoot, { onLog: (m) => log.detail(m) });
  await fsp.mkdir(path.dirname(zygiskBin), { recursive: true });
  await fsp.copyFile(path.join(ROOT, 'native', 'build', `${TARGET_ABI}.so`), zygiskBin);
  await fsp.chmod(zygiskBin, 0o644);
  log.ok(`产物: ${path.relative(ROOT, zygiskBin)} (${size} 字节)`);
}

// ---------- 3. 编译 fontmm-subset (英文字体子集化工具, issue #10) ----------
// 依赖 harfbuzz (静态链接); 其源码需联网获取, 编译产物带缓存见 dev/lib/harfbuzz.mjs
const subsetBin = path.join(SRC_DIR, 'tools', 'fontmm-subset');
if (skipSubset) {
  log.info('已跳过 fontmm-subset 编译 (--skip-subset)');
  try {
    await fsp.access(subsetBin);
  } catch {
    die(`缺少 ${path.relative(ROOT, subsetBin)}, 请先运行 pnpm subset:build`);
  }
} else {
  // 复用上一步已定位的 NDK (未走 Zygisk 分支时需重新定位)
  const ndkRoot = await findNdk();
  if (!ndkRoot) {
    die(
      '未找到 Android NDK, 无法编译 fontmm-subset。\n' +
        '    请设置 ANDROID_NDK_HOME, 或下载到 ~/opt/android-ndk-r27c\n' +
        '    仅打包现有产物: node dev/pack.mjs --skip-subset',
    );
  }
  const size = await buildSubsetTool(ndkRoot, subsetBin);
  await fsp.chmod(subsetBin, 0o755);
  log.ok(`产物: ${path.relative(ROOT, subsetBin)} (${(size / 1048576).toFixed(1)}MB)`);
}

// ---------- 4. 生成模块内可执行文件校验表 (src/SHA256SUMS) ----------
log.step('生成 SHA256 校验文件...');
run(process.execPath, [path.join(ROOT, 'dev', 'gen-sha256.mjs'), '--no-dist'], { cwd: ROOT });

// ---------- 5. 打包 ----------
// 派生字体配置 (fonts_base/ule/font_fallback) 由设备端 customize.sh 扫描生成,
// 不随包分发; 这里一律排除, 避免与设备端生成结果冲突。
const exclude = ['*.git*', '*.DS_Store', '*.swp', '*~', '*.bak', ...DERIVED_XML_RELS];

// 先删旧产物: 避免上一轮的文件残留进新 zip
await fsp.mkdir(DIST_DIR, { recursive: true });
await Promise.all([
  fsp.rm(preOut, { force: true }),
  fsp.rm(tplOut, { force: true }),
  fsp.rm(`${preOut}.sha256`, { force: true }),
  fsp.rm(`${tplOut}.sha256`, { force: true }),
]);

// ---------- 6. 预压缩缓存 ----------
// system/fonts/ 占整包压缩量的 ~70%, 而它在多数构建中不变 (仅发布字体时才动)。
// 内容未变时直接复用已压缩数据 (passThrough, 不重新 deflate), 显著缩短打包时间。
//
// 缓存按子树分别管理, 以「文件名 + 大小 + mtime + 权限位」为指纹; 任一项变化即失效,
// 回退为现场压缩并重建缓存。缓存目录 dev/.cache/ 不入库, 缺失/损坏一律优雅降级。
const fontCacheSegment = 'system-fonts';
const fontCachePrefix = 'system/fonts/';
const fontsDir = path.join(SRC_DIR, 'system', 'fonts');

let fontCache = null;
if (CACHE_ENABLED) {
  const cacheKey = await subtreeKey(fontsDir);
  fontCache = await openCache(fontCacheSegment, cacheKey);
  if (fontCache) {
    log.ok(`命中预压缩缓存 (${fontCache.entries.length} 个字体文件, 跳过压缩)`);
  } else {
    log.info('无可用预压缩缓存, 本次将现场压缩并在完成后建立缓存');
  }
}

log.step('打包 preplace 版 (含预置字体)...');
const pre = await packDir({
  srcDir: SRC_DIR,
  outFile: preOut,
  exclude,
  fixedDate,
  cache: fontCache ?? undefined,
});
log.ok(
  `preplace: ${pre.files} 文件 / ${pre.dirs} 目录${pre.reused ? ` (复用缓存 ${pre.reused} 个)` : ''}`,
);

log.step('打包 template 版 (FONTS 目录为空)...');
// 排除 FONTS/ 下的字体文件, 但保留目录条目本身 (设备端需要该目录存在)
const tpl = await packDir({
  srcDir: SRC_DIR,
  outFile: tplOut,
  exclude,
  excludeFilePrefixes: ['FONTS/'],
  fixedDate,
  cache: fontCache ?? undefined,
});
log.ok(
  `template: ${tpl.files} 文件 / ${tpl.dirs} 目录${tpl.reused ? ` (复用缓存 ${tpl.reused} 个)` : ''}`,
);
await fontCache?.close();

// 未命中且本次确实压缩了字体文件时, 用刚产出的产物建立缓存。
// 以 preplace 包为缓存来源 (它含完整的 system/fonts/); 需确认确实包含字体条目。
if (CACHE_ENABLED && !fontCache && pre.reused === 0) {
  const cacheKey = await subtreeKey(fontsDir);
  // 从 preplace 包中抽取 system/fonts/ 部分作为缓存片段:
  // 直接把整包复制过去会让缓存体积翻倍, 故重建一个只含该子树的 zip。
  log.step('建立预压缩缓存...');
  const segTmp = path.join(DIST_DIR, '.cache-segment.zip');
  try {
    await packDir({
      srcDir: SRC_DIR,
      outFile: segTmp,
      exclude,
      onlyPrefixes: [fontCachePrefix],
      level: COMPRESS_LEVEL,
      fixedDate,
    });
    const ok = await saveCacheFromZip(fontCacheSegment, cacheKey, segTmp, COMPRESS_LEVEL);
    if (ok) log.ok('缓存已建立 (下次打包将自动复用)');
  } catch (e) {
    log.warn(`建立缓存失败 (不影响本次构建): ${e.message}`);
  } finally {
    await fsp.rm(segTmp, { force: true });
  }
}

// ---------- 7. 校验产物 ----------
// 取代原 shell 的 unzip -l / unzip -p 检查: 直接回读 zip 内容并与源文件比对,
// 同时校验条目名、目录条目与派生配置排除情况。
async function verify(zipPath, { label, requireFonts, forbidFonts }) {
  const entries = await listEntries(zipPath);
  const present = new Set(entries);

  if (!present.has('module.prop')) {
    die(`${label} 缺少 module.prop (打包目录层级可能有误)`);
  }
  if (!present.has('FONTS/')) {
    die(`${label} 缺少 FONTS/ 目录条目 (设备端需要该目录存在)`);
  }
  for (const rel of DERIVED_XML_RELS) {
    if (present.has(rel)) {
      die(`${label} 不应包含派生配置 ${rel} (由设备端生成)`);
    }
  }

  const fontEntries = entries.filter((n) => n.startsWith('FONTS/') && n.endsWith('.ttf'));
  if (forbidFonts && fontEntries.length > 0) {
    die(`${label} 不应包含 FONTS 字体文件: ${fontEntries.join(', ')}`);
  }
  if (requireFonts && !fontEntries.includes('FONTS/hans.ttf')) {
    die(`${label} 缺少预置简体字体 FONTS/hans.ttf`);
  }

  // 内容校验: 逐个条目回读并比对磁盘源文件的 sha256
  const index = await indexZip(zipPath);
  let checked = 0;
  for (const [name, info] of index) {
    if (info.isDir) continue;
    let expected;
    try {
      expected = hashFile(path.join(SRC_DIR, name));
    } catch {
      die(`${label} 含源目录不存在的条目: ${name}`);
    }
    if (expected !== info.sha256) {
      die(`${label} 内容校验失败 (与源文件不一致): ${name}`);
    }
    checked++;
  }
  return { total: entries.length, checked };
}

const preInfo = await verify(preOut, { label: 'preplace 版', requireFonts: true, forbidFonts: false });
const tplInfo = await verify(tplOut, { label: 'template 版', requireFonts: false, forbidFonts: true });
log.ok(`产物校验通过 (preplace ${preInfo.checked}/${preInfo.total} 条, template ${tplInfo.checked}/${tplInfo.total} 条)`);

// ---------- 8. 生成发布产物校验文件 ----------
run(process.execPath, [path.join(ROOT, 'dev', 'gen-sha256.mjs')], { cwd: ROOT });

// ---------- 完成 ----------
const [preStat, tplStat] = await Promise.all([fsp.stat(preOut), fsp.stat(tplOut)]);
const mb = (n) => `${(n / 1048576).toFixed(1)}MB`;
console.log();
log.ok(`打包完成 (${elapsed()})`);
log.detail(`preplace: ${path.basename(preOut)} (${mb(preStat.size)})`);
log.detail(`template: ${path.basename(tplOut)} (${mb(tplStat.size)})`);
