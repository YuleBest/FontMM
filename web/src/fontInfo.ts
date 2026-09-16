import * as opentype from 'opentype.js';

export interface FontInfo {
  name?: string;
  sizeText?: string;
  isVariable?: boolean;
  wghtRange?: string;
}

// 从字体名称表提取 family name, 优先中文字体名
function extractFamilyName(font: any): string | null {
  const pick = (table: any): string | null => {
    if (!table) return null;
    const family = table.fontFamily ?? table.fullName;
    if (!family || typeof family !== 'object') return null;
    for (const lang of ['zh-CN', 'zh-Hans', 'zh', 'zh-TW', 'zh-Hant', 'en', 'en-US']) {
      if (typeof family[lang] === 'string' && family[lang]) return family[lang];
    }
    const first = Object.values(family).find((v) => typeof v === 'string' && v);
    return first ? String(first) : null;
  };
  return pick(font.names?.windows) ?? pick(font.names?.macintosh);
}

// 可变字体时返回 wght 轴范围
function extractWghtRange(font: any): string | undefined {
  const fvar = font?.tables?.fvar;
  if (!fvar?.axes) return undefined;
  const wght = fvar.axes.find((a: any) => a.tag === 'wght');
  if (!wght) return undefined;
  return `${Math.round(wght.minValue)}-${Math.round(wght.maxValue)}`;
}

// 字体体积展示: 1MB 以下用 KB (子集化结果常在百 KB 量级, 用 MB 会显示成 0.2 MB 看不出量级)
export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// 读取 fonts-test/ 下字体文件的名称与大小 (WebView 仅能访问 webroot 内文件)
export async function readFontInfo(file: string): Promise<FontInfo> {
  // dev 假数据: 模拟各槽位字体的名称/大小/可变标识
  if (import.meta.env.DEV) {
    const MOCK_FONT_INFO: Record<
      string,
      { name: string; size: string; variable: boolean; wght?: string }
    > = {
      'hans.ttf': { name: 'HarmonyOS Sans SC', size: '13.5 MB', variable: true, wght: '100-900' },
      'hant.ttf': { name: '源樣明體', size: '21.2 MB', variable: false },
      'en.ttf': { name: 'Inter Variable', size: '0.8 MB', variable: true, wght: '200-700' },
      'mono.ttf': { name: 'JetBrains Mono', size: '1.2 MB', variable: false },
      'emoji.ttf': { name: 'Noto Color Emoji', size: '9.8 MB', variable: false },
    };
    const mock = MOCK_FONT_INFO[file];
    return mock
      ? {
          name: mock.name,
          sizeText: mock.size,
          isVariable: mock.variable,
          wghtRange: mock.wght,
        }
      : {};
  }
  try {
    const res = await fetch(`fonts-test/${file}`);
    if (!res.ok) return {};
    const buf = await res.arrayBuffer();
    const font = opentype.parse(buf);
    const name = extractFamilyName(font);
    const sizeText = formatSize(buf.byteLength);
    return {
      name: name ?? undefined,
      sizeText,
      isVariable: Boolean(font.tables?.fvar),
      wghtRange: extractWghtRange(font),
    };
  } catch {
    return {};
  }
}
