#!/usr/bin/env node
// dev/cache.mjs — 预压缩缓存管理
//
// 用法:
//   node dev/cache.mjs status   查看缓存状态 (片段/大小/文件数/建立时间)
//   node dev/cache.mjs clean    清空缓存
//   node dev/cache.mjs test     校验缓存可用性: 用缓存重建一遍并与源文件逐条比对
//
// 缓存由 dev/pack.mjs 在打包时自动建立与复用; 本脚本仅用于查看/清理/校验。
import fsp from 'node:fs/promises';
import path from 'node:path';
import { log, die } from './lib/log.mjs';
import { ROOT, SRC_DIR } from './lib/paths.mjs';
import { indexZip, hashFile } from './lib/zip.mjs';
import { cacheStatus, clearCache, CACHE_DIR } from './lib/zipcache.mjs';

const cmd = process.argv[2] ?? 'status';
const mb = (n) => `${(n / 1048576).toFixed(1)}MB`;

if (cmd === 'status') {
  const list = await cacheStatus();
  if (list.length === 0) {
    log.info(`无缓存 (${path.relative(ROOT, CACHE_DIR)} 不存在或为空)`);
    log.detail('下次运行 pnpm run pack 会自动建立');
    process.exit(0);
  }
  log.step(`缓存目录: ${path.relative(ROOT, CACHE_DIR)}`);
  for (const c of list) {
    const flag = c.usable ? '✓ 可用' : '✗ 不可用 (将回退现场压缩)';
    log.detail(`[${c.segment}] ${flag}`);
    log.detail(`  大小 ${mb(c.size)}  含 ${c.files} 个文件  建立于 ${c.createdAt ?? '未知'}`);
  }
  process.exit(0);
}

if (cmd === 'clean') {
  await clearCache();
  log.ok('缓存已清空');
  process.exit(0);
}

if (cmd === 'test') {
  // 校验: 把缓存里的每个条目解压出来, 与源文件比对内容
  const list = await cacheStatus();
  if (list.length === 0) die('无缓存可校验');
  let failures = 0;
  for (const c of list.filter((x) => x.usable)) {
    const segZip = path.join(CACHE_DIR, `${c.segment}.zip`);
    log.step(`校验片段 ${c.segment} (${mb(c.size)})...`);
    const index = await indexZip(segZip);
    let checked = 0;
    for (const [rel, info] of index) {
      if (info.isDir) continue;
      const src = path.join(SRC_DIR, rel);
      let expected;
      try {
        expected = hashFile(src);
      } catch {
        log.fail(`源文件不存在: ${rel}`);
        failures++;
        continue;
      }
      if (expected !== info.sha256) {
        log.fail(`内容不一致: ${rel}`);
        failures++;
      }
      checked++;
    }
    log.ok(`  ${c.segment}: ${checked} 个文件全部与源文件一致`);
  }
  if (failures > 0) die(`${failures} 项校验失败`);
  log.ok('缓存校验通过');
  process.exit(0);
}

die(`未知命令: ${cmd} (可用: status / clean / test)`);
