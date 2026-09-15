#!/usr/bin/env node
// dev/gen-sha256.mjs — 生成 SHA256 校验文件 (取代 gen-sha256.sh)
//
// 1. src/SHA256SUMS: 模块内可执行文件 (脚本/二进制) 的 sha256, 随 zip 打包,
//    供设备端 tools/verify-sha256.sh 一键校验
// 2. dist/*.zip.sha256: 发布产物的 sha256, 作为 Release 资产
//
// 用法: node dev/gen-sha256.mjs [--no-dist]
//   --no-dist: 只生成 src/SHA256SUMS (供 pack.mjs 打包前调用; 此时 dist 产物尚未生成)
//
// 注意: 校验文件中只写**文件名**而非绝对路径。原实现用 `sha256sum "$abs_path"`,
// 会把打包机的绝对路径写进校验文件, 导致用户下载后无法用 `sha256sum -c` 校验
// (CI 里又写成 dist/xxx.zip 相对路径, 与本地不一致)。统一为 basename 后,
// 只要 zip 与 .sha256 放在同一目录即可直接校验。
import fsp from 'node:fs/promises';
import path from 'node:path';
import { log } from './lib/log.mjs';
import { SRC_DIR, DIST_DIR } from './lib/paths.mjs';
import { hashFile } from './lib/zip.mjs';

const noDist = process.argv.includes('--no-dist');

/** 模块内需要校验的文件: shell 脚本 + 模块二进制 + Zygisk 库 + Magisk 安装脚本 */
const SUM_PATTERNS = [
  (name) => name.endsWith('.sh'),
  (name) => name === 'fontmm-wght',
  (name) => name === 'fontmm-subset',
  (name) => name.endsWith('.so'), // Zygisk 模块 (zygisk/arm64-v8a.so)
  (name) => name === 'update-binary',
  (name) => name === 'updater-script',
];

/** 递归收集待校验文件 (排除 webroot: 那是构建产物, 体积大且每次不同) */
async function collectFiles(root) {
  const out = [];
  async function recurse(dir) {
    const items = await fsp.readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const abs = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (item.name === 'webroot') continue;
        await recurse(abs);
      } else if (item.isFile() && SUM_PATTERNS.some((fn) => fn(item.name))) {
        out.push(abs);
      }
    }
  }
  await recurse(root);
  // 稳定排序: 大小写不敏感优先 (与原 `find | sort` 的字典序一致), 相同时再按原文比较。
  // 不用 localeCompare: 其结果依赖运行环境的 locale, 会造成产物不可复现。
  return out.sort((a, b) => {
    const la = a.toLowerCase();
    const lb = b.toLowerCase();
    if (la !== lb) return la < lb ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/** 生成模块内可执行文件校验表 (src/SHA256SUMS) */
async function genModuleSums() {
  const files = await collectFiles(SRC_DIR);
  const lines = [];
  for (const abs of files) {
    const rel = path.relative(SRC_DIR, abs).split(path.sep).join('/');
    lines.push(`${hashFile(abs)}  ${rel}`);
  }
  const out = path.join(SRC_DIR, 'SHA256SUMS');
  await fsp.writeFile(out, `${lines.join('\n')}\n`, 'utf8');
  // 显式固定权限位: writeFile 会继承已存在文件的模式, 若上一版由 mktemp 等创建 (0600)
  // 就会带着 600 进 zip, 使产物随文件历史而变。固定 0644 保证可复现。
  await fsp.chmod(out, 0o644);
  log.ok(`已生成 ${path.relative(process.cwd(), out)} (${lines.length} 条可执行文件校验)`);
  return lines.length;
}

/** 生成发布产物校验文件 (dist/*.zip.sha256)
 *  只针对模块发布包 (FontMM_v*.zip); webroot.zip 是 build:only-web 的调试产物, 跳过 */
async function genDistSums() {
  let zips;
  try {
    zips = (await fsp.readdir(DIST_DIR)).filter((f) => f.startsWith('FontMM_v') && f.endsWith('.zip')).sort();
  } catch {
    log.info('无 dist 目录, 跳过');
    return 0;
  }
  if (zips.length === 0) {
    log.info('dist 下无 zip 产物, 跳过');
    return 0;
  }
  for (const name of zips) {
    const sum = hashFile(path.join(DIST_DIR, name));
    await fsp.writeFile(path.join(DIST_DIR, `${name}.sha256`), `${sum}  ${name}\n`, 'utf8');
    log.ok(`已生成 dist/${name}.sha256`);
  }
  return zips.length;
}

const count = await genModuleSums();
if (!noDist) await genDistSums();
log.ok(`SHA256 校验文件生成完成 (模块内 ${count} 个可执行文件)`);
