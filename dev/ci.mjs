#!/usr/bin/env node
// dev/ci.mjs — 代码检查 (取代 ci.sh)
//
// 检查分两层:
//   1. Node 原生检查 (始终运行, 无需任何外部工具): 关键文件结构、XML 合法性、
//      module.prop 字段、apply.sh 字体映射与占位文件的一致性等
//   2. shell 静态检查: 若 PATH 中存在 shellcheck / shfmt 则一并运行
//      (CI 中用 --strict 强制要求, 缺失即失败)
//
// 之所以不在 npm 里包装 shellcheck: 它的 npm 包只是下载器, 会从 GitHub Releases
// 拉取二进制, 在受限网络/限流下会失败 —— 这恰恰是要摆脱的不确定性。
//
// 用法: node dev/ci.mjs [--strict]
//   --strict: shellcheck / shfmt 缺失时报错退出 (CI 使用)
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { log, die } from './lib/log.mjs';
import { ROOT, SRC_DIR, WEB_DIR, MODULE_PROP, FONTS_XML, DERIVED_XML_RELS, NATIVE_DIR } from './lib/paths.mjs';
import { run, hasCommand } from './lib/exec.mjs';

const strict = process.argv.includes('--strict');
let failures = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => log.ok(name))
    .catch((e) => {
      log.fail(`${name}: ${e.message}`);
      failures++;
    });
}

/** 递归收集目录下匹配的文件 (相对路径, `/` 分隔) */
async function collect(dir, match, skipDirs = []) {
  const out = [];
  async function recurse(current) {
    let items;
    try {
      items = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      if (item.isDirectory()) {
        if (skipDirs.includes(item.name)) continue;
        await recurse(path.join(current, item.name));
      } else if (item.isFile() && match(item.name)) {
        out.push(path.relative(dir, path.join(current, item.name)).split(path.sep).join('/'));
      }
    }
  }
  await recurse(dir);
  return out.sort();
}

// ---------------- 1. Node 原生检查 ----------------

// module.prop 必需字段 (id/name/version/versionCode/author/description)
await check('module.prop 字段完整', async () => {
  const text = await fsp.readFile(MODULE_PROP, 'utf8');
  const keys = new Map();
  for (const line of text.split('\n')) {
    const idx = line.indexOf('=');
    if (idx > 0) keys.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }
  const required = ['id', 'name', 'version', 'versionCode', 'author', 'description'];
  const missing = required.filter((k) => !keys.get(k));
  if (missing.length) throw new Error(`缺少字段: ${missing.join(', ')}`);
  if (keys.get('id') !== 'FontMM') throw new Error(`id 应为 FontMM, 实际 ${keys.get('id')}`);
  if (!/^\d+$/.test(keys.get('versionCode'))) {
    throw new Error(`versionCode 必须为纯数字: ${keys.get('versionCode')}`);
  }
});

// fonts.xml 必须是合法 XML (设备端解析失败会导致无法开机)
await check('fonts.xml 为合法 XML', async () => {
  const text = await fsp.readFile(FONTS_XML, 'utf8');
  // 轻量标签配对检查: 去掉注释与声明后, 校验 <familyset> 与内部 <family>/<font> 的配对。
  // 不引入 XML 解析依赖 (设备端是 libexpat, 严格但容错策略不同), 这里只抓最常见的标签失衡。
  const stripped = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');
  const opens = (stripped.match(/<family[ >]/g) ?? []).length;
  const closes = (stripped.match(/<\/family>/g) ?? []).length;
  if (opens !== closes) {
    throw new Error(`<family> 标签失衡: ${opens} 个开始 / ${closes} 个结束`);
  }
  if (!/<familyset[\s>]/.test(stripped)) throw new Error('缺少 <familyset> 根元素');
  if (!/<\/familyset>/.test(stripped)) throw new Error('缺少 </familyset> 结束标签');
  if (!/name="sans-serif"/.test(stripped)) throw new Error('缺少 sans-serif 家族');
});

// 派生配置不应被提交 (由设备端 customize.sh 生成, 打包时也会自动排除)
// 本地调试时可能存在 (dev/sync-fonts-xml.mjs 生成), 因此只提示不报错;
// 真正要拦的是「被 git 跟踪」——那才会让派生配置随仓库分发出去。
await check('派生字体配置未被 git 跟踪', async () => {
  const tracked = [];
  for (const rel of DERIVED_XML_RELS) {
    const { stdout } = spawnSync('git', ['ls-files', '--error-unmatch', `src/${rel}`], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    if (stdout && stdout.trim()) tracked.push(rel);
  }
  if (tracked.length) {
    throw new Error(`以下派生配置被 git 跟踪, 应删除并加入 .gitignore: ${tracked.join(', ')}`);
  }
  // 本地存在但未跟踪: 属于正常调试状态, 只提示
  const present = [];
  for (const rel of DERIVED_XML_RELS) {
    try {
      await fsp.access(path.join(SRC_DIR, rel));
      present.push(rel);
    } catch {
      // 不存在
    }
  }
  if (present.length) {
    log.info(`检测到本地生成的派生配置 ${present.length} 个 (未跟踪, 打包时会自动排除)`);
  }
});

// apply.sh 的占位字体映射 与 empty-font.mjs 的占位清单 必须一致
//
// apply.sh 里有两类单引号字体名:
//   1. 多行的字体列表赋值 (hans_fonts/hant_fonts/en_fonts) —— 会被用户字体覆盖的
//      SysFont*/SysSans* 占位文件, 必须与 empty-font.mjs 的 PLACEHOLDERS 一一对应
//   2. 单行的系统字体名 (DroidSansMono.ttf / NotoColorEmoji.ttf) —— 直接替换系统
//      字体文件, 不经过占位机制, 不属于占位清单
// 按「是否含换行」区分这两类, 与源码结构一致。
await check('apply.sh 占位映射与占位清单一致', async () => {
  const applySh = await fsp.readFile(path.join(SRC_DIR, 'apply.sh'), 'utf8');
  const mapped = new Set();
  for (const m of applySh.matchAll(/'([^']*)'/g)) {
    const value = m[1];
    if (!value.includes('\n')) continue; // 跳过单行系统字体名
    for (const line of value.split('\n')) {
      const name = line.trim();
      if (name.endsWith('.ttf')) mapped.add(name);
    }
  }
  if (mapped.size === 0) throw new Error('未从 apply.sh 解析到占位字体列表 (解析逻辑可能已失效)');

  const emptyFont = await fsp.readFile(path.join(ROOT, 'dev', 'empty-font.mjs'), 'utf8');
  const decl = emptyFont.match(/const PLACEHOLDERS = \[([\s\S]*?)\];/);
  if (!decl) throw new Error('empty-font.mjs 中未找到 PLACEHOLDERS 列表');
  const placeholders = new Set(
    (decl[1].match(/'([^']+\.ttf)'/g) ?? []).map((s) => s.slice(1, -1)),
  );

  const onlyInApply = [...mapped].filter((n) => !placeholders.has(n));
  const onlyInPlaceholders = [...placeholders].filter((n) => !mapped.has(n));
  if (onlyInApply.length) {
    throw new Error(`apply.sh 使用了未列入占位清单的字体: ${onlyInApply.join(', ')}`);
  }
  if (onlyInPlaceholders.length) {
    throw new Error(`占位清单中的字体未被 apply.sh 使用: ${onlyInPlaceholders.join(', ')}`);
  }
});

// Zygisk 预加载的字体清单必须覆盖 apply.sh 会替换的全部字体文件。
// 两者若不一致, 缺失的字体在 DenyList 应用里会静默渲染失败, 问题极难定位。
await check('Zygisk 预热字体清单与 apply.sh 一致', async () => {
  const applySh = await fsp.readFile(path.join(SRC_DIR, 'apply.sh'), 'utf8');

  // apply.sh 会写入 system/fonts/ 的全部文件名:
  //   1. 占位字体 (hans/hant/en 三组多行列表)
  //   2. 直接替换的系统字体 (DroidSansMono / NotoColorEmoji, 单行)
  const expected = new Set();
  for (const m of applySh.matchAll(/'([^']*)'/g)) {
    const value = m[1];
    const lines = value.includes('\n') ? value.split('\n') : [value];
    for (const line of lines) {
      const name = line.trim();
      // 只看形如 xxx.ttf 的纯文件名 (排除含路径或变量的内容)
      if (/^[A-Za-z0-9_-]+\.ttf$/.test(name)) expected.add(name);
    }
  }
  if (expected.size === 0) throw new Error('未从 apply.sh 解析到字体文件名 (解析逻辑可能已失效)');

  const cpp = await fsp.readFile(path.join(NATIVE_DIR, 'src', 'fontmm.cpp'), 'utf8');
  const block = cpp.match(/kFontFiles\[\]\s*=\s*\{([\s\S]*?)\};/);
  if (!block) throw new Error('fontmm.cpp 中未找到 kFontFiles 列表');
  const actual = new Set(
    [...block[1].matchAll(/"\/system\/fonts\/([A-Za-z0-9_-]+\.ttf)"/g)].map((m) => m[1]),
  );

  const missing = [...expected].filter((n) => !actual.has(n));
  const extra = [...actual].filter((n) => !expected.has(n));
  if (missing.length) {
    throw new Error(`fontmm.cpp 缺少以下字体的预热 (apply.sh 会替换它们): ${missing.join(', ')}`);
  }
  if (extra.length) {
    throw new Error(`fontmm.cpp 预热了 apply.sh 不会替换的字体: ${extra.join(', ')}`);
  }
});

// 前端脚本引用的 dev 入口必须存在 (避免重命名后 package.json 指向不存在的文件)
await check('package.json 中引用的 dev 脚本存在', async () => {
  const pkg = JSON.parse(await fsp.readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const missing = [];
  for (const [name, cmd] of Object.entries({ ...pkg.scripts })) {
    for (const m of cmd.matchAll(/node\s+(\S+\.mjs)/g)) {
      const target = path.join(ROOT, m[1]);
      try {
        await fsp.access(target);
      } catch {
        missing.push(`${name} -> ${m[1]}`);
      }
    }
  }
  if (missing.length) throw new Error(`引用了不存在的脚本: ${missing.join(', ')}`);
});

// ---------------- 2. shell 静态检查 ----------------

const shFiles = await collect(SRC_DIR, (n) => n.endsWith('.sh'), ['webroot']);
log.step(`src/ 下共 ${shFiles.length} 个 shell 脚本`);

if (hasCommand('shellcheck')) {
  await check(`shellcheck (${shFiles.length} 个文件)`, () => {
    run('shellcheck', shFiles.map((f) => path.join(SRC_DIR, f)), { cwd: ROOT });
  });
} else if (strict) {
  log.fail('未找到 shellcheck (--strict 要求必须存在)');
  failures++;
} else {
  log.warn('未找到 shellcheck, 跳过 (安装后自动启用)');
}

if (hasCommand('shfmt')) {
  // -d: 只报告格式差异, 不修改文件 (与 checks 语义一致)
  await check('shfmt 格式检查', () => {
    run('shfmt', ['-i', '4', '-d', ...shFiles.map((f) => path.join(SRC_DIR, f))], { cwd: ROOT });
  });
} else if (strict) {
  log.fail('未找到 shfmt (--strict 要求必须存在)');
  failures++;
} else {
  log.warn('未找到 shfmt, 跳过 (安装后自动启用)');
}

// ---------------- 3. 前端检查 ----------------

if (hasCommand('pnpm')) {
  await check('前端 lint (oxlint)', () => {
    run('pnpm', ['-C', WEB_DIR, 'lint'], { cwd: ROOT });
  });
  await check('前端格式检查 (oxfmt)', () => {
    run('pnpm', ['-C', WEB_DIR, 'fmt:check'], { cwd: ROOT });
  });
  await check('前端类型检查 (tsc)', () => {
    run('pnpm', ['-C', WEB_DIR, 'type-check'], { cwd: ROOT });
  });
} else if (strict) {
  log.fail('未找到 pnpm, 无法运行前端检查');
  failures++;
} else {
  log.warn('未找到 pnpm, 跳过前端检查');
}

// ---------------- 结果 ----------------

console.log();
if (failures > 0) {
  die(`${failures} 项检查未通过`);
}
log.ok('全部检查通过');
