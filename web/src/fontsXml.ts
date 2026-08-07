// fontsXml.ts — 字重范围覆写 fonts.xml 的 sans-serif family 段
// 覆写采用字符串级替换 (保留文件全部 #ifdef 注释与格式), fast-xml-parser 仅用于结果校验
import { XMLValidator } from 'fast-xml-parser';

/** 覆写模式: 0=不处理 1=裁切粗细等级 2=平均分配字重 */
export type WghtMode = 0 | 1 | 2;

export const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

/** 平均分配: 计算 weight w 对应的 axis wght 值 (400 固定, 两端线性插值, 向下取整) */
export function averagedAxis(min: number, max: number, w: number): number {
  if (w === 400) return 400;
  if (w < 400) return Math.floor(min + ((400 - min) * (w - 100)) / 300);
  return Math.floor(400 + ((max - 400) * (w - 400)) / 500);
}

/** 生成单条 <font> 条目 (缩进与现有 fonts.xml 一致) */
function fontEntry(weight: number, axisWght: number): string {
  return `        <font weight="${weight}" style="normal">SysFont-Regular.ttf
            <axis tag="ital" stylevalue="0" />
            <axis tag="wdth" stylevalue="100" />
            <axis tag="wght" stylevalue="${axisWght}" />
        </font>`;
}

/**
 * 生成 sans-serif family 段
 * @param mode 1=裁切 (仅保留 weight ∈ [min,max]) 2=平均 (全保留, axis 按范围插值)
 */
export function generateSansSerifFamily(min: number, max: number, mode: 1 | 2): string {
  const kept = mode === 1 ? WEIGHTS.filter((w) => w >= min && w <= max) : WEIGHTS;
  const lines = kept.map((w) => {
    const axisWght = mode === 2 ? averagedAxis(min, max, w) : w;
    return fontEntry(w, axisWght);
  });
  return `    <family name="sans-serif">\n${lines.join('\n')}\n    </family>`;
}

/**
 * 在完整 fonts.xml 文本中替换 sans-serif family 段
 * mode=0 或无范围时原样返回
 */
export function applyWghtMode(xml: string, mode: WghtMode, min?: number, max?: number): string {
  if (mode === 0 || min === undefined || max === undefined) return xml;
  const startTag = '<family name="sans-serif">';
  const start = xml.indexOf(startTag);
  if (start < 0) return xml;
  const end = xml.indexOf('</family>', start);
  if (end < 0) return xml;
  const before = xml.slice(0, start);
  const after = xml.slice(end + '</family>'.length);
  return before + generateSansSerifFamily(min, max, mode) + after;
}

/** 校验 XML 合法性 (fast-xml-parser) */
export function validateXml(xml: string): boolean {
  try {
    return XMLValidator.validate(xml) === true;
  } catch {
    return false;
  }
}
