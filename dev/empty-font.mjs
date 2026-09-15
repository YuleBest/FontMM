#!/usr/bin/env node
// dev/empty-font.mjs — 生成系统字体占位文件 (取代 empty_font.sh)
//
// src/system/fonts/ 下的 SysFont* / SysSans* 是 0 字节占位文件, 避免把大字体提交进仓库;
// 安装或应用字体时由 apply.sh 用 FONTS/ 里的真实字体覆盖。
// 开发过程中这些占位文件可能被真实字体覆盖, 用本脚本重新置空。
//
// 用法: node dev/empty-font.mjs
import fsp from 'node:fs/promises';
import path from 'node:path';
import { log } from './lib/log.mjs';
import { SRC_DIR } from './lib/paths.mjs';

const FONT_DIR = path.join(SRC_DIR, 'system', 'fonts');

// 需要置空的占位文件 (与 src/apply.sh 的映射表保持一致)
const PLACEHOLDERS = [
  'SysSans-Hans-Regular.ttf',
  'SysFont-Static-Regular.ttf',
  'SysFont-Myanmar.ttf',
  'SysFont-Hans-Regular.ttf',
  'SysFont-Regular.ttf',
  'SysSans-Hant-Regular.ttf',
  'SysFont-Hant-Regular.ttf',
  'SysSans-En-Regular.ttf',
];

await fsp.mkdir(FONT_DIR, { recursive: true });

for (const name of PLACEHOLDERS) {
  const file = path.join(FONT_DIR, name);
  // 写入空内容 (等价于 shell 的 `: > file`)
  await fsp.writeFile(file, '');
  log.step(`已生成空字体: ${name}`);
}

log.ok(`完成, 共 ${PLACEHOLDERS.length} 个空字体 -> ${path.relative(process.cwd(), FONT_DIR)}`);
