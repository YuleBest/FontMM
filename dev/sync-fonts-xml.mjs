#!/usr/bin/env node
// dev/sync-fonts-xml.mjs — 以 fonts.xml 为唯一源, 复制生成各派生字体配置 (取代 sync-fonts-xml.sh)
//
// 仅用于开发期本地对照/调试: 模块打包 (dev/pack.mjs) 不再包含派生配置,
// 由刷入脚本 (src/customize.sh) 在设备端扫描系统 XML 生成, 以提升跨 ColorOS 版本兼容性。
//
// 用法: node dev/sync-fonts-xml.mjs
import fsp from 'node:fs/promises';
import path from 'node:path';
import { log, die } from './lib/log.mjs';
import { ROOT, SRC_DIR, FONTS_XML, DERIVED_XML_RELS } from './lib/paths.mjs';

try {
  await fsp.access(FONTS_XML);
} catch {
  die(`找不到源文件: ${path.relative(ROOT, FONTS_XML)}`);
}

const content = await fsp.readFile(FONTS_XML);
for (const rel of DERIVED_XML_RELS) {
  const dest = path.join(SRC_DIR, rel);
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.writeFile(dest, content);
  log.ok(`已同步: ${path.relative(ROOT, dest)}`);
}

log.ok(`完成, 共 ${DERIVED_XML_RELS.length} 个派生文件`);
