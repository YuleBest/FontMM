// dev/lib/paths.mjs — 项目路径常量 (统一从本文件推导, 避免各脚本各自 dirname 拼接)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 项目根目录 (dev/lib/ 往上两级) */
export const ROOT = path.resolve(HERE, '..', '..');
export const SRC_DIR = path.join(ROOT, 'src');
export const WEB_DIR = path.join(ROOT, 'web');
export const DIST_DIR = path.join(ROOT, 'dist');
export const GOLANG_DIR = path.join(ROOT, 'golang');
/** Zygisk 原生模块 (C++) 源码目录 */
export const NATIVE_DIR = path.join(ROOT, 'native');
export const WEBROOT_DIR = path.join(SRC_DIR, 'webroot');
export const MODULE_PROP = path.join(SRC_DIR, 'module.prop');
export const FONTS_XML = path.join(SRC_DIR, 'system', 'etc', 'fonts.xml');

/** 模块内 Zygisk 库目录 (相对模块根): 加载器约定读 zygisk/<abi>.so */
export const ZYGISK_DIR_REL = 'zygisk';

/** 派生字体配置 (不打包, 由设备端 customize.sh 生成; 开发期用 sync-fonts-xml 本地生成) */
export const DERIVED_XML_RELS = [
  'system/etc/fonts_base.xml',
  'system/etc/fonts_ule.xml',
  'system/etc/font_fallback.xml',
  'system/system_ext/etc/fonts_base.xml',
  'system/system_ext/etc/fonts_ule.xml',
];

/** 从 module.prop 读取 version= 字段 */
export function readVersion() {
  const text = fs.readFileSync(MODULE_PROP, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^version=(.*)$/);
    if (m) return m[1].trim();
  }
  throw new Error(`无法从 ${MODULE_PROP} 读取 version 字段`);
}

/**
 * 版本号 -> 安全文件名。
 * GitHub Release 网页上传会把括号改写为点, 导致 URL 与本地文件名不一致,
 * 因此打包时就把括号统一替换为点: 26.8.0-beta.1(260800001) -> 26.8.0-beta.1.260800001
 */
export function safeFileVersion(version) {
  return version.replace(/\(/g, '.').replace(/\)/g, '');
}
