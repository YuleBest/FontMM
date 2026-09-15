// dev/lib/zip.mjs — ZIP 打包与回读校验 (基于 @zip.js/zip.js)
//
// 取代原 shell 流程对 `zip` / `unzip` 外部命令的依赖: 两者在 Windows、精简容器
// 与部分 CI 镜像中常常缺失或行为不一致。zip.js 是纯 JS 实现, 只需 Node 即可运行,
// 并支持精确设置 unix 权限位 (模块内脚本与 fontmm-wght 二进制需要正确的可执行位)。
//
// 权限位策略: 沿用源文件自身的权限位 (与原 Info-ZIP 行为一致, 保证产物不变),
// 同时给普通文件兜底 0644、目录兜底 0755, 避免开发者 umask 过严 (如 077) 时
// 打包出无读权限的文件导致设备端安装失败。
import * as zip from '@zip.js/zip.js';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Writable } from 'node:stream';
import { log } from './log.mjs';

/** 普通文件权限位下限 (含 S_IFREG) */
export const FILE_MODE = 0o100644;
/** 目录权限位下限 (含 S_IFDIR) */
export const DIR_MODE = 0o40755;
/** 权限位掩码: 仅保留读/写/执行位 */
const PERM_MASK = 0o777;

/** 文件权限位: 源文件权限, 至少 0644 */
export function fileModeOf(stat) {
  return 0o100000 | ((stat.mode & PERM_MASK) | 0o644);
}

/** 目录权限位: 源目录权限, 至少 0755 */
export function dirModeOf(stat) {
  return 0o040000 | ((stat.mode & PERM_MASK) | 0o755);
}

/**
 * 把 Info-ZIP 风格的 glob (其中 `*` 匹配任意字符, 含 `/`) 编译为正则列表。
 * 与 zip -x 的语义保持一致, 便于原脚本的排除规则直接沿用。
 */
export function compileGlobs(patterns) {
  return patterns.map((p) => {
    const escaped = p.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
  });
}

/** 递归收集目录内容 (排序保证产物顺序稳定), rel 以 `/` 结尾表示目录 */
async function walk(root) {
  const out = [];

  async function recurse(dir) {
    const items = await fsp.readdir(dir, { withFileTypes: true });
    items.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const item of items) {
      const abs = path.join(dir, item.name);
      const rel = path.relative(root, abs).split(path.sep).join('/');
      if (item.isDirectory()) {
        out.push({ abs, rel: `${rel}/`, type: 'dir' });
        await recurse(abs);
      } else if (item.isFile()) {
        out.push({ abs, rel, type: 'file' });
      }
      // 其他类型 (符号链接等) 跳过: 模块包内不需要, 且 zip 语义易产生歧义
    }
  }

  await recurse(root);
  return out;
}

/**
 * 打包目录为 zip。
 * @param {object} opts
 * @param {string} opts.srcDir 源目录 (其内容作为 zip 根, 不含该目录名这一层)
 * @param {string} opts.outFile 输出 zip 路径
 * @param {string[]} [opts.exclude] Info-ZIP 风格 glob, 命中的条目被排除
 * @param {string[]} [opts.excludeFilePrefixes] 仅排除这些前缀下的**文件** (保留目录条目)
 * @param {string[]} [opts.onlyPrefixes] 只收录这些前缀下的条目 (其他一律跳过)。
 *        用于单独打包某个子树以建立缓存: 条目名仍是相对 srcDir 的完整路径,
 *        与整包打包时完全一致, 因此可以按路径直接复用。
 * @param {number} [opts.level] 压缩级别 0-9 (默认 2, 与原 zip -2 一致)
 * @param {Date} [opts.fixedDate] 固定所有条目的时间戳 (SOURCE_DATE_EPOCH 式可复现打包);
 *        不传则沿用源文件 mtime, 与 Info-ZIP 行为一致
 * @param {(rel: string) => void} [opts.onEntry] 每个文件写入后的回调
 * @param {{ get(rel: string): { compressed: () => Promise<Blob>, crc32: number, uncompressedSize: number } | undefined }} [opts.cache]
 *        预压缩缓存 (见 dev/lib/zipcache.mjs): 命中的条目直接搬运已压缩数据, 不做 deflate
 * @returns {Promise<{ files: number, dirs: number, reused: number }>}
 */
export async function packDir({
  srcDir,
  outFile,
  exclude = [],
  excludeFilePrefixes = [],
  onlyPrefixes,
  level = 2,
  fixedDate,
  onEntry,
  cache,
}) {
  const globs = compileGlobs(exclude);
  const entries = await walk(srcDir);

  await fsp.mkdir(path.dirname(outFile), { recursive: true });

  const fd = fs.createWriteStream(outFile);
  const closed = new Promise((resolve, reject) => {
    fd.on('close', resolve);
    fd.on('error', reject);
  });
  const writer = new zip.ZipWriter(Writable.toWeb(fd), { bufferedWrite: false, level });
  // 统一的时间戳来源: fixedDate 优先, 否则用源文件 mtime
  const dateOf = (stat) => fixedDate ?? stat.mtime;

  let files = 0;
  let dirs = 0;
  let reused = 0;
  try {
    for (const entry of entries) {
      if (globs.some((re) => re.test(entry.rel))) continue;
      if (onlyPrefixes && !onlyPrefixes.some((p) => entry.rel.startsWith(p))) continue;
      if (
        entry.type === 'file' &&
        excludeFilePrefixes.some((prefix) => entry.rel.startsWith(prefix))
      ) {
        continue;
      }
      const stat = await fsp.stat(entry.abs);
      if (entry.type === 'dir') {
        await writer.add(entry.rel, new zip.TextReader(''), {
          directory: true,
          unixMode: dirModeOf(stat),
          lastModDate: dateOf(stat),
        });
        dirs++;
        continue;
      }

      const lastModDate = dateOf(stat);
      const unixMode = fileModeOf(stat);

      // 预压缩缓存: 命中则直接搬运已压缩数据 (passThrough), 跳过 deflate。
      // 需同时提供下列字段, 否则 zip.js 在没有压缩阶段的情况下无法写出正确的条目头:
      //   uncompressedSize / crc32 / compressionMethod —— 条目头必需
      //   level —— zip.js 把压缩级别编码进通用标志位 (bit 1-2), 不传会与现场
      //            压缩的产物产生字节差异 (整包哈希不一致)
      const cached = cache?.get(entry.rel);
      if (cached) {
        try {
          const compressed = await cached.compressed();
          await writer.add(entry.rel, new zip.BlobReader(compressed), {
            unixMode,
            lastModDate,
            passThrough: true,
            uncompressedSize: cached.uncompressedSize,
            crc32: cached.crc32,
            compressionMethod: 8, // deflate, 与压缩期一致
            level,
          });
          files++;
          reused++;
          onEntry?.(entry.rel);
          continue;
        } catch (e) {
          // 单条搬运失败不应中断构建: 回退为现场压缩
          log.warn(`缓存条目不可用, 回退现场压缩: ${entry.rel} (${e.message})`);
        }
      }

      // 未命中: 现场压缩。BlobReader + openAsBlob 流式读取, 不整体载入内存
      const blob = await fs.openAsBlob(entry.abs);
      await writer.add(entry.rel, new zip.BlobReader(blob), {
        unixMode,
        lastModDate,
      });
      files++;
      onEntry?.(entry.rel);
    }
    await writer.close();
    await closed;
  } catch (e) {
    fd.destroy();
    throw e;
  }

  return { files, dirs, reused };
}

/** 打开 zip 读取器 (调用方负责 close) */
async function openReader(zipPath) {
  const blob = await fs.openAsBlob(zipPath);
  return new zip.ZipReader(new zip.BlobReader(blob));
}

/** 列出 zip 内全部条目的名称 (目录条目带结尾 `/`) */
export async function listEntries(zipPath) {
  const reader = await openReader(zipPath);
  try {
    const entries = await reader.getEntries();
    return entries.map((e) => e.filename);
  } finally {
    await reader.close();
  }
}

/**
 * 回读 zip 并计算每个文件条目的 SHA256 与权限位, 用于校验打包结果。
 * 流式读取 (逐个 entry 喂给哈希), 不会把大字体一次性读进内存。
 * @returns {Promise<Map<string, { sha256: string, mode: number, isDir: boolean }>>}
 */
export async function indexZip(zipPath) {
  const reader = await openReader(zipPath);
  const result = new Map();
  try {
    const entries = await reader.getEntries();
    for (const entry of entries) {
      const mode = (entry.externalFileAttributes ?? 0) >>> 16;
      if (entry.directory) {
        result.set(entry.filename, { sha256: '', mode, isDir: true });
        continue;
      }
      const hash = crypto.createHash('sha256');
      const sink = new WritableStream({
        write(chunk) {
          hash.update(chunk);
        },
      });
      await entry.getData(sink);
      result.set(entry.filename, { sha256: hash.digest('hex'), mode, isDir: false });
    }
    return result;
  } finally {
    await reader.close();
  }
}

/** 计算磁盘文件的 SHA256 */
export function hashFile(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.allocUnsafe(1 << 20);
    for (;;) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (n <= 0) break;
      hash.update(buf.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}
