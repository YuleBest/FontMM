// 字体编辑 Worker: Pyodide + fontTools 在独立线程运行, 避免大字体编辑阻塞 UI
// 主线程通过 postMessage 通信: init / analyze / edit

// 用 fontTools 解析字体: 名称 / 字形数 / unitsPerEm / 可变 + 全部可读 name 字段
const ANALYZE_PY = `
from fontTools.ttLib import TTFont
from io import BytesIO

def read_all_names(f):
    out = {}
    for nid in range(0, 26):
        try:
            v = f['name'].getDebugName(nid)
        except Exception:
            v = None
        if v:
            out[str(nid)] = v
    return out

def analyze(data):
    try:
        f = TTFont(BytesIO(data), fontNumber=0)
        name = f['name']
        family = name.getDebugName(1) or name.getDebugName(16) or '(未命名)'
        subfamily = name.getDebugName(2) or ''
        glyphs = f['maxp'].numGlyphs
        units = f['head'].unitsPerEm
        variable = 'fvar' in f
        return {'ok': True, 'family': family, 'subfamily': subfamily,
                'glyphs': glyphs, 'units': units, 'variable': variable,
                'names': read_all_names(f)}
    except Exception as e:
        return {'ok': False, 'error': str(e)}
`;

// 编辑字体: 字形轮廓缩放 + 偏移, advance 随缩放; 丢弃可变字体表
const EDIT_PY = `
from fontTools.ttLib import TTFont
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.misc.transform import Transform
from io import BytesIO

def edit_font(data, scale, dx, dy, letter_spacing=0, line_spacing=0):
    try:
        f = TTFont(BytesIO(data), fontNumber=0)
        if 'glyf' not in f:
            return {'ok': False, 'error': '仅支持 TrueType (.ttf) 字体'}
        gs = f.getGlyphSet()
        glyf = f['glyf']
        matrix = Transform(scale, 0, 0, scale, dx, dy)
        for name in f.getGlyphOrder():
            g = glyf[name]
            pen = TTGlyphPen(gs)
            tpen = TransformPen(pen, matrix)
            g.draw(tpen, glyf)
            glyf[name] = pen.glyph()
        hmtx = f['hmtx']
        for name in f.getGlyphOrder():
            advance, lsb = hmtx[name]
            if advance:
                # 字间距: 叠加到 advance width (可正可负)
                hmtx[name] = (max(1, round(advance * scale + letter_spacing)), lsb)
        # 行间距: 叠加到 hhea.lineGap 与 OS/2.sTypoLineGap
        if line_spacing:
            if 'hhea' in f:
                f['hhea'].lineGap = max(0, round(f['hhea'].lineGap + line_spacing))
            if 'OS/2' in f:
                f['OS/2'].sTypoLineGap = max(0, round(f['OS/2'].sTypoLineGap + line_spacing))
        # 编辑后可变轴已无意义, 丢弃
        for t in ('fvar', 'gvar', 'avar', 'STAT', 'cvar'):
            if t in f:
                del f[t]
        out = BytesIO()
        f.save(out)
        return {'ok': True, 'data': out.getvalue()}
    except Exception as e:
        return {'ok': False, 'error': str(e)}

# 修改 name 表字段 (Windows Unicode 平台, 写入或替换)
def update_names(data, names):
    try:
        f = TTFont(BytesIO(data), fontNumber=0)
        for nid_str, value in names.items():
            nid = int(nid_str)
            if value is None or str(value).strip() == '':
                continue
            f['name'].setName(str(value), nid, 3, 1, 0x409)
        out = BytesIO()
        f.save(out)
        return {'ok': True, 'data': out.getvalue()}
    except Exception as e:
        return {'ok': False, 'error': str(e)}
`;

let py: any = null;

self.onmessage = async (e: MessageEvent) => {
  const { id, type, payload } = e.data;
  try {
    if (type === 'init') {
      const { loadPyodide } = await import('pyodide');
      py = await loadPyodide({ indexURL: payload.indexURL });
      await py.loadPackage('fonttools');
      await py.runPythonAsync(ANALYZE_PY + EDIT_PY);
      self.postMessage({ id, ok: true });
    } else if (type === 'analyze') {
      const bytes = py.toPy(new Uint8Array(payload.data));
      const r = py.globals
        .get('analyze')(bytes)
        .toJs({ dict_converter: Object.fromEntries, depth: 2 });
      self.postMessage({
        id,
        ok: Boolean(r.ok),
        family: r.family,
        subfamily: r.subfamily,
        glyphs: r.glyphs,
        units: r.units,
        variable: r.variable,
        names: r.names,
        error: r.error,
      });
    } else if (type === 'edit') {
      const bytes = py.toPy(new Uint8Array(payload.data));
      const r = py.globals
        .get('edit_font')(
          bytes,
          payload.scale,
          payload.dx,
          payload.dy,
          payload.letterSpacing ?? 0,
          payload.lineSpacing ?? 0,
        )
        .toJs({ dict_converter: Object.fromEntries });
      if (r.ok) {
        const data: Uint8Array = r.data;
        self.postMessage({ id, ok: true, data }, { transfer: [data.buffer] });
      } else {
        self.postMessage({ id, ok: false, error: r.error });
      }
    } else if (type === 'updateNames') {
      const bytes = py.toPy(new Uint8Array(payload.data));
      const names = py.toPy(payload.names);
      const r = py.globals
        .get('update_names')(bytes, names)
        .toJs({ dict_converter: Object.fromEntries });
      if (r.ok) {
        const data: Uint8Array = r.data;
        self.postMessage({ id, ok: true, data }, { transfer: [data.buffer] });
      } else {
        self.postMessage({ id, ok: false, error: r.error });
      }
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err) });
  }
};
