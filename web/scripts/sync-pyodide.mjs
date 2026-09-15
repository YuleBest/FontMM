#!/usr/bin/env node
// web/scripts/sync-pyodide.mjs — 从 npm 包同步 Pyodide 运行时到 public/pyodide/
//
// 背景: web/public/pyodide/ 下的 Pyodide 运行时 (asm.mjs / asm.wasm / stdlib 等)
// 与 npm 依赖 `pyodide` 里的文件是同一份。把它们提交进仓库有两个坏处 ——
// 一是占仓库体积, 二是 npm 包升版后容易留下不一致的旧副本。
// 因此这 6 个文件改为构建/开发时从 node_modules 复制, 不进仓库。
//
// 例外: fonttools / numpy 两个 wheel 不在 npm 包里 (Pyodide 的依赖清单只登记
// 但不随包分发), 仍需仓库提供, 故保留在 public/pyodide/ 下。
//
// 用法: 由 pnpm dev / pnpm build 自动调用, 也可单独执行以校验环境
//   node scripts/sync-pyodide.mjs
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(HERE, '..');
/** npm 包里的 Pyodide 运行时目录 */
const SRC_DIR = path.join(WEB_DIR, 'node_modules', 'pyodide');
/** Vite 的静态资源目录 (原样拷贝到构建产物) */
const DEST_DIR = path.join(WEB_DIR, 'public', 'pyodide');

/**
 * 从 npm 包复制的文件。与 npm 包内同名文件一一对应。
 * 增删此列表时, 需同步更新 .gitignore 中对应的忽略项。
 */
const COPY_FILES = [
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'pyodide.js',
  'pyodide.mjs',
  'pyodide-lock.json',
  'python_stdlib.zip',
];

/**
 * 仓库保留的文件 (不在 npm 包内), 以及它们应满足的完整性校验。
 * 这些 wheel 由 pyodide-lock.json 登记, 版本必须与之一致 ——
 * 否则 Pyodide 在 loadPackage() 时会因校验失败而报错。
 */
const KEEP_FILES = [
  'fonttools-4.62.1-py3-none-any.whl',
  'numpy-2.4.3-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
];

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** 读取并解析 lock.json, 返回 { 包名: 条目 } */
async function readLock(p) {
  const d = JSON.parse(await fsp.readFile(p, 'utf8'));
  return d.packages ?? {};
}

/**
 * 校验保留下来的 wheel 与 lock.json 配套。
 *
 * 这是本机制的主要风险点: wheel 在仓库、lock.json 在 npm 包, 两者的版本可能
 * 各自漂移。例如 npm 的 pyodide 升版后 lock.json 引用了新版 fonttools, 而仓库里
 * 仍是旧 wheel —— 此时运行时 loadPackage('fonttools') 会因 sha256 不匹配而失败,
 * 且只在用户点开「字体编辑」时才暴露。故在此提前拦截。
 */
async function verifyWheels(lock) {
  const problems = [];
  for (const name of KEEP_FILES) {
    const file = path.join(DEST_DIR, name);
    let buf;
    try {
      buf = await fsp.readFile(file);
    } catch {
      problems.push(`缺少 ${name} (需随仓库提供, 不在 npm 包内)`);
      continue;
    }
    // 在 lock.json 中找到登记该文件的条目, 比对 sha256
    const entry = Object.values(lock).find((e) => e.file_name === name);
    if (!entry) {
      problems.push(
        `${name} 未被 pyodide-lock.json 登记 —— npm 的 pyodide 可能已升版, ` +
          `请改用新版 wheel 或调整 pyodide 依赖版本`,
      );
      continue;
    }
    const expected = entry.sha256;
    if (expected && sha256(buf) !== expected) {
      problems.push(`${name} 与 lock.json 登记的 sha256 不符 (文件可能损坏或被替换)`);
    }
  }
  return problems;
}

async function main() {
  // npm 依赖是否存在 (未安装依赖时给出明确提示, 而不是沉默地跳过)
  try {
    await fsp.access(SRC_DIR);
  } catch {
    console.error(`[✗] 未找到 ${path.relative(WEB_DIR, SRC_DIR)}, 请先运行 pnpm install`);
    process.exit(1);
  }

  await fsp.mkdir(DEST_DIR, { recursive: true });

  // 1. 从 npm 包复制运行时文件
  let copied = 0;
  for (const name of COPY_FILES) {
    const src = path.join(SRC_DIR, name);
    const dest = path.join(DEST_DIR, name);
    try {
      // 源与目标内容一致时跳过写入: 避免每次构建都触碰文件, 也便于观察实际变化
      const [a, b] = await Promise.all([fsp.readFile(src), fsp.readFile(dest).catch(() => null)]);
      if (b && a.equals(b)) continue;
      await fsp.copyFile(src, dest);
      copied++;
    } catch (e) {
      console.error(`[✗] 复制 ${name} 失败: ${e.message}`);
      process.exit(1);
    }
  }

  // 2. 校验留在仓库的 wheel 与 lock.json 配套
  const lock = await readLock(path.join(DEST_DIR, 'pyodide-lock.json'));
  const problems = await verifyWheels(lock);
  if (problems.length) {
    console.error('[✗] Pyodide 依赖校验失败:');
    for (const p of problems) console.error(`      ${p}`);
    process.exit(1);
  }

  const total = (
    await Promise.all(
      [...COPY_FILES, ...KEEP_FILES].map(async (n) => {
        try {
          return (await fsp.stat(path.join(DEST_DIR, n))).size;
        } catch {
          return 0;
        }
      }),
    )
  ).reduce((a, b) => a + b, 0);

  console.log(
    copied > 0
      ? `[*] Pyodide 运行时已同步 (更新 ${copied} 个文件, 共 ${(total / 1048576).toFixed(1)}MB)`
      : `[*] Pyodide 运行时已就绪 (${(total / 1048576).toFixed(1)}MB)`,
  );
}

await main();
