import { exec, shellQuote } from './ksu';
import { FONTS_DIR, TEST_FONT_DIR } from './constants';

// 复制 FONT/ 到 webroot/fonts-test, 供页面加载与名称解析
// (WebView 无法直接访问模块外部目录, 符号链接在真机也不可靠, 直接复制)
//
// 只复制 5 个槽位对应的文件: FONTS/ 下还可能有 apply.sh 生成的中转文件
// (如 .en-subset.ttf), 它们不是用户选择的字体, 复制过去只是浪费开销。
const SLOT_FILES = ['hans.ttf', 'hant.ttf', 'en.ttf', 'mono.ttf', 'emoji.ttf'];

export async function ensureFontsCopy(): Promise<string[]> {
  const copyCmd = [
    `rm -rf '${TEST_FONT_DIR}'`,
    `mkdir -p '${TEST_FONT_DIR}'`,
    ...SLOT_FILES.map(
      (f) => `[ -f '${FONTS_DIR}/${f}' ] && cp -f '${FONTS_DIR}/${f}' '${TEST_FONT_DIR}/${f}'`,
    ),
  ].join('\n');
  try {
    const { errno } = await exec(copyCmd);
    if (errno !== 0) return [];
  } catch {
    return [];
  }
  return listFontsDir();
}

// 列出 fonts-test/ 下的字体文件 (每行一个完整路径)
export async function listFontsDir(): Promise<string[]> {
  try {
    const { errno, stdout } = await exec(
      `find ${shellQuote(TEST_FONT_DIR)} -maxdepth 1 -mindepth 1 -type f`,
    );
    if (errno !== 0) return [];
    return stdout
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((p) => p.slice(p.lastIndexOf('/') + 1));
  } catch {
    return [];
  }
}
