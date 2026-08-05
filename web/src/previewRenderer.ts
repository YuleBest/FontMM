// Canvas 字形预览渲染: 用 fontTools 提取的轮廓点直接绘制, 不依赖字体文件

export interface GlyphPreviewData {
  pts: [number, number, number][]; // [x, y, onCurve]
  end: number[];
  adv: number;
}

export interface PreviewData {
  glyphs: Record<string, GlyphPreviewData>; // key: unicode 码点
  upem: number;
  lineGap: number;
}

// 绘制单个轮廓段 (TrueType 二次贝塞尔规则, 含首尾 off-curve 处理)
function traceContour(ctx: CanvasRenderingContext2D, seg: [number, number, number][]): void {
  const n = seg.length;
  if (n < 2) return;
  // 起点: 首点 on-curve -> 直接用; 否则用末点或首末中点
  let i = 0;
  let sx: number;
  let sy: number;
  if (seg[0][2] === 1) {
    sx = seg[0][0];
    sy = seg[0][1];
    i = 1;
  } else if (seg[n - 1][2] === 1) {
    sx = seg[n - 1][0];
    sy = seg[n - 1][1];
  } else {
    sx = (seg[0][0] + seg[n - 1][0]) / 2;
    sy = (seg[0][1] + seg[n - 1][1]) / 2;
  }
  ctx.moveTo(sx, -sy);
  let visited = 0;
  const maxIter = n * 2 + 2;
  while (visited < n && i < maxIter) {
    const p = seg[i % n];
    if (p[2] === 1) {
      ctx.lineTo(p[0], -p[1]);
      i++;
      visited++;
    } else {
      const next = seg[(i + 1) % n];
      if (next[2] === 1) {
        ctx.quadraticCurveTo(p[0], -p[1], next[0], -next[1]);
        i += 2;
        visited += 2;
      } else {
        // 连续 off-curve: 中间隐含 on-curve 点为中点
        ctx.quadraticCurveTo(p[0], -p[1], (p[0] + next[0]) / 2, -(p[1] + next[1]) / 2);
        i++;
        visited++;
      }
    }
  }
  ctx.closePath();
}

function traceGlyph(ctx: CanvasRenderingContext2D, g: GlyphPreviewData): void {
  if (!g || g.pts.length === 0) return;
  ctx.beginPath();
  let start = 0;
  for (const endIdx of g.end) {
    traceContour(ctx, g.pts.slice(start, endIdx + 1));
    start = endIdx + 1;
  }
  if (start < g.pts.length) traceContour(ctx, g.pts.slice(start));
}

export interface RenderOptions {
  fontSize: number; // CSS 像素字号
  color: string;
}

// 渲染预览文本到 canvas (自动适配宽高/折行)
export function renderPreview(
  canvas: HTMLCanvasElement,
  data: PreviewData,
  text: string,
  opts: RenderOptions,
): void {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 320;
  const cssH = canvas.clientHeight || 200;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = opts.color;

  const pxPerUnit = opts.fontSize / data.upem;
  const pad = 8;
  const lineHeight = opts.fontSize + data.lineGap * pxPerUnit;
  let x = pad;
  let y = pad + opts.fontSize; // 基线

  for (const ch of text) {
    if (ch === '\n') {
      x = pad;
      y += lineHeight;
      continue;
    }
    const g = data.glyphs[String(ch.codePointAt(0))];
    if (g) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(pxPerUnit, pxPerUnit);
      traceGlyph(ctx, g);
      ctx.fill();
      ctx.restore();
      x += g.adv * pxPerUnit;
    } else {
      x += opts.fontSize * 0.5; // 缺失字形占位
    }
    if (x > cssW - pad) {
      x = pad;
      y += lineHeight;
    }
  }
}
