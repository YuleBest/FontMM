import { exec, shellQuote } from './ksu';
import { FONTS_DIR, TEST_FONT_DIR } from './constants';
import { formatSize } from './fontInfo';

// 复制 FONT/ 到 webroot/fonts-test, 供页面加载与名称解析
// (WebView 无法直接访问模块外部目录, 符号链接在真机也不可靠, 直接复制)
//
// 只复制 5 个槽位对应的文件: FONTS/ 下还可能有 apply.sh 生成的中转文件
// (如 .en-subset.ttf), 它们不是用户选择的字体, 复制过去只是浪费开销。
//
// 注意结尾必须加 `:` —— 否则最后一个不存在的槽位会让整段脚本以非 0 退出
// ([ -f ] 条件失败), 而 exec 只看整体退出码, 上游就会误判为"复制失败"
// 并把所有槽位当空处理 (issue #11: 只选中文字体时名称全不显示)。
const SLOT_FILES = ['hans.ttf', 'hant.ttf', 'en.ttf', 'mono.ttf', 'emoji.ttf'];

export async function ensureFontsCopy(): Promise<string[]> {
  const copyCmd = [
    `rm -rf '${TEST_FONT_DIR}'`,
    `mkdir -p '${TEST_FONT_DIR}'`,
    ...SLOT_FILES.map(
      (f) => `[ -f '${FONTS_DIR}/${f}' ] && cp -f '${FONTS_DIR}/${f}' '${TEST_FONT_DIR}/${f}'`,
    ),
    ':', // 兜底: 保证整体退出码为 0 (见上)
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

// 英文字体子集文件: apply.sh 子集化成功时写入 FONTS/.en-subset.ttf (issue #10),
// 安装到 system/fonts 的就是它, 大小通常比原字体小两个数量级 (issue #14)。
export const EN_SUBSET_FILE = `${FONTS_DIR}/.en-subset.ttf`;

// 读取英文子集大小 (无子集返回 null)。
// 要求子集比 en.ttf 新 —— 换过英文字体但还没重新应用时, 旧子集不该继续展示。
export async function getEnSubsetSizeText(): Promise<string | null> {
  // dev 假数据: 真机没应用过就没有该文件, 徽标无从预览
  if (import.meta.env.DEV) return '218 KB';
  try {
    const subset = shellQuote(EN_SUBSET_FILE);
    const { errno, stdout } = await exec(
      `[ -f ${subset} ] && [ ${subset} -nt ${shellQuote(`${FONTS_DIR}/en.ttf`)} ] && wc -c < ${subset}`,
    );
    if (errno !== 0) return null;
    const bytes = Number(stdout.trim());
    return Number.isFinite(bytes) && bytes > 0 ? formatSize(bytes) : null;
  } catch {
    return null;
  }
}
