// dev/lib/zipcache.mjs — 预压缩构建缓存
//
// 动机: 打包耗时几乎全在压缩。system/fonts/ 有 131MB 原始数据 (压缩后 71MB),
// 占整包压缩量的 ~70%, 而这部分内容在大多数构建中是**不变的** (只有发布新版本
// 字体时才会动)。把它预先压缩并缓存起来, 后续打包只需把已压缩的数据"搬运"进
// 新 zip (passThrough, 不重新 deflate), 再压缩其余变动文件即可。
//
// 设计: 缓存是若干个"目录片段" (segment), 每个片段对应源目录下的一个子目录,
// 并对该子树计算指纹 (文件名 + 大小 + mtime + 权限位)。指纹一致才能复用。
//   - 用文件大小 + mtime 而非内容哈希做指纹: 对 131MB 字体算哈希本身就要 1s 左右,
//     而 mtime/size 变化足以判定"内容可能变了"。缓存是本地构建加速, 不是安全边界,
//     真要去校验内容, 打包后的产物校验 (dev/pack.mjs 的 verify) 会兜住。
//   - 缓存不含任何"必须存在"的假设: 缺失/版本不符/指纹不符一律回退为现场压缩。
//
// 缓存目录: dev/.cache/ (已 gitignore, 不随仓库分发)
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './paths.mjs';
import { log } from './log.mjs';

/** 缓存目录 (不入库) */
export const CACHE_DIR = path.join(ROOT, 'dev', '.cache');
/** 缓存格式版本: 结构变更时递增, 旧缓存自动失效 */
const CACHE_VERSION = 1;

/** 单个片段的索引文件名 */
function indexFile(segment) {
  return path.join(CACHE_DIR, `${segment}.index.json`);
}

/** 单个片段的预压缩 zip 路径 */
function dataFile(segment) {
  return path.join(CACHE_DIR, `${segment}.zip`);
}

/**
 * 递归收集子树的条目 (相对 srcDir 的路径, 排序稳定), 用于计算指纹。
 * 目录条目也计入 —— 目录的增删同样会使缓存失效。
 */
async function collectTree(rootDir) {
  const out = [];
  async function recurse(dir) {
    const items = await fsp.readdir(dir, { withFileTypes: true });
    items.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const item of items) {
      const abs = path.join(dir, item.name);
      const rel = path.relative(rootDir, abs).split(path.sep).join('/');
      if (item.isDirectory()) {
        out.push({ rel: `${rel}/`, type: 'dir' });
        await recurse(abs);
      } else if (item.isFile()) {
        const st = await fsp.stat(abs);
        out.push({
          rel,
          type: 'file',
          size: st.size,
          // mtimeMs 取整: 不同文件系统的时间精度不同, 避免无意义的失配
          mtime: Math.floor(st.mtimeMs),
          mode: st.mode & 0o777,
        });
      }
      // 其他类型 (符号链接等) 跳过, 与打包逻辑一致
    }
  }
  await recurse(rootDir);
  return out;
}

/** 由条目列表计算指纹 (稳定序列化后哈希) */
function fingerprint(entries) {
  return JSON.stringify(entries);
}

/**
 * 计算某个源目录子树的缓存键。
 * @param {string} subtreeDir 绝对路径
 * @returns {Promise<string>} 指纹字符串
 */
export async function subtreeKey(subtreeDir) {
  return fingerprint(await collectTree(subtreeDir));
}

/**
 * 读取缓存片段 (若有效)。
 * @param {string} segment 片段名 (同时作为缓存文件名, 仅用 [a-z0-9-])
 * @param {string} expectedKey 期望的指纹
 * @returns {Promise<{ file: string, entries: object[] } | null>} 有效则返回缓存信息
 */
export async function readCache(segment, expectedKey) {
  try {
    const raw = await fsp.readFile(indexFile(segment), 'utf8');
    const idx = JSON.parse(raw);
    if (idx.version !== CACHE_VERSION) return null;
    if (idx.key !== expectedKey) return null;
    // 缓存数据文件必须存在且有内容
    const st = await fsp.stat(dataFile(segment));
    if (st.size === 0) return null;
    return { file: dataFile(segment), entries: idx.entries ?? [] };
  } catch {
    // 任何读取/解析失败都视为无缓存 —— 优雅降级
    return null;
  }
}

/**
 * 打开缓存片段, 返回按相对路径取用的压缩数据查找表。
 *
 * 返回的对象持有 ZipReader; 每一条的压缩数据按需读取 (getData(passThrough) 只做
 * 字节搬运, 不解压), 因此不会把整个片段一次性读进内存。用完需调用 close()。
 *
 * @param {string} segment 片段名
 * @param {string} key 指纹
 * @returns {Promise<{ get(rel: string): { compressed: () => Promise<Blob>, crc32: number, uncompressedSize: number } | undefined, entries: string[], close(): Promise<void> } | null>}
 */
export async function openCache(segment, key) {
  const cached = await readCache(segment, key);
  if (!cached) return null;

  let reader = null;
  try {
    const { ZipReader, BlobReader, BlobWriter } = await import('@zip.js/zip.js');
    const fs = await import('node:fs');
    // openAsBlob: 流式读取缓存文件, 不整体载入内存
    const blob = await fs.openAsBlob(dataFile(segment));
    reader = new ZipReader(new BlobReader(blob));
    const entries = await reader.getEntries();

    const table = new Map();
    for (const e of entries) {
      if (e.directory) continue;
      table.set(e.filename, {
        // 惰性取用: 每次调用只搬运该条目的已压缩字节, 不重新压缩
        compressed: () => e.getData(new BlobWriter(), { passThrough: true }),
        crc32: e.crc32,
        uncompressedSize: e.uncompressedSize,
      });
    }

    return {
      get: (rel) => table.get(rel),
      entries: [...table.keys()],
      close: async () => {
        await reader.close();
      },
    };
  } catch (e) {
    log.warn(`打开缓存片段 ${segment} 失败 (将现场压缩): ${e.message}`);
    try {
      await reader?.close();
    } catch {
      // 忽略
    }
    return null;
  }
}

/**
 * 由"已完成压缩的 zip"建立缓存片段。
 * 该 zip 内条目名需与打包时的相对路径一致 (即相对 srcDir 的路径)。
 *
 * @param {string} segment 片段名
 * @param {string} key 指纹
 * @param {string} zipFile 已压缩的 zip 路径
 * @param {number} level 压缩级别 (写入索引, 级别变化会使缓存失效)
 */
export async function saveCacheFromZip(segment, key, zipFile, level) {
  try {
    await fsp.mkdir(CACHE_DIR, { recursive: true });
    const { ZipReader, BlobReader } = await import('@zip.js/zip.js');
    const fs = await import('node:fs');
    const blob = await fs.openAsBlob(zipFile);
    const reader = new ZipReader(new BlobReader(blob));
    const entries = await reader.getEntries();
    const meta = entries.map((e) => ({
      rel: e.filename,
      size: e.uncompressedSize,
      compressedSize: e.compressedSize,
      direct: e.directory,
    }));
    await reader.close();

    const idx = {
      version: CACHE_VERSION,
      key,
      level,
      createdAt: new Date().toISOString(),
      entries: meta,
    };

    // 先落数据文件再落索引: 若中途失败, 索引缺失 → 视为无缓存, 不会读到半成品
    await fsp.copyFile(zipFile, dataFile(segment));
    await fsp.writeFile(indexFile(segment), JSON.stringify(idx, null, 2), 'utf8');
    return true;
  } catch (e) {
    log.warn(`写入缓存失败 (不影响构建): ${e.message}`);
    return false;
  }
}

/** 清空全部缓存 */
export async function clearCache() {
  await fsp.rm(CACHE_DIR, { recursive: true, force: true });
}

/** 缓存片段的当前状态 (供 pnpm cache:status 展示) */
export async function cacheStatus() {
  try {
    const files = await fsp.readdir(CACHE_DIR);
    const out = [];
    for (const name of files.filter((f) => f.endsWith('.index.json'))) {
      const segment = name.replace(/\.index\.json$/, '');
      try {
        const idx = JSON.parse(await fsp.readFile(path.join(CACHE_DIR, name), 'utf8'));
        let size = 0;
        try {
          size = (await fsp.stat(dataFile(segment))).size;
        } catch {
          // 数据文件缺失
        }
        out.push({
          segment,
          version: idx.version,
          usable: idx.version === CACHE_VERSION && size > 0,
          size,
          files: (idx.entries ?? []).filter((e) => !e.direct).length,
          createdAt: idx.createdAt,
        });
      } catch {
        // 索引损坏
      }
    }
    return out;
  } catch {
    return [];
  }
}
