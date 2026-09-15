#!/usr/bin/env node
// dev/webzip.mjs — 把 WebUI 构建产物 src/webroot 压成 dist/webroot.zip (调试用)
// 用于单独验证前端产物, 不含字体模块内容; 完整模块打包见 dev/pack.mjs
//
// 用法: node dev/webzip.mjs
import fsp from 'node:fs/promises';
import path from 'node:path';
import { log, die } from './lib/log.mjs';
import { ROOT, WEBROOT_DIR, DIST_DIR } from './lib/paths.mjs';
import { packDir } from './lib/zip.mjs';

try {
  await fsp.access(WEBROOT_DIR);
} catch {
  die(`${path.relative(ROOT, WEBROOT_DIR)} 不存在, 请先执行 pnpm -C web build`);
}

const out = path.join(DIST_DIR, 'webroot.zip');
// 先删旧产物, 避免残留文件混入
await fsp.rm(out, { force: true });

// SOURCE_DATE_EPOCH: 固定时间戳实现可复现打包 (见 dev/pack.mjs 说明)
const epoch = process.env.SOURCE_DATE_EPOCH;
const fixedDate = epoch ? new Date(Number(epoch) * 1000) : undefined;

// zip 根 = webroot 内容 (不含 webroot 这一层目录)
const { files, dirs } = await packDir({
  srcDir: WEBROOT_DIR,
  outFile: out,
  exclude: ['*.git*', '*.DS_Store'],
  level: 9, // 调试产物追求体积最小, 与完整模块打包的 -2 不同
  fixedDate,
});

const { size } = await fsp.stat(out);
log.ok(`已打包: ${path.relative(ROOT, out)} (${(size / 1048576).toFixed(1)}MB, ${files} 文件 / ${dirs} 目录)`);
