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
from fontTools.misc.transform import Transform
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphComponent, GlyphCoordinates
from fontTools.ttLib.tables.ttProgram import Program
import numpy
from io import BytesIO

# 缓存: 原始字体对象 + 字形快照 (list 浅拷贝, 毫秒级; 避免 deepcopy 整个字体)
_FONT_CACHE = {}
_GLYPH_ORIG = {}
_HMTX_ORIG = {}
_LINEGAP_ORIG = {}

def _snapshot_glyph(g):
    if g is None:
        return None
    if g.numberOfContours is not None and g.numberOfContours >= 0:
        program = getattr(g, 'program', None)
        bc = None
        if program is not None and program.bytecode:
            bc = list(program.bytecode)
        return ('simple', g.numberOfContours,
                list(g.coordinates) if hasattr(g, 'coordinates') else [],
                list(g.flags) if hasattr(g, 'flags') else [],
                list(g.endPtsOfContours) if hasattr(g, 'endPtsOfContours') else [],
                bc)
    comps = []
    for c in g.components:
        tr_raw = getattr(c, 'transform', None)
        tr = None
        if tr_raw is not None:
            tr = (tr_raw[0][0], tr_raw[0][1], tr_raw[1][0], tr_raw[1][1])
        comps.append((c.glyphName, c.x, c.y, tr, c.flags))
    return ('composite', comps)

def _restore_glyph(snap):
    if snap is None:
        return None
    g = Glyph()
    if snap[0] == 'simple':
        g.numberOfContours = snap[1]
        if snap[2]:
            g.coordinates = GlyphCoordinates(snap[2])
        if snap[3]:
            g.flags = snap[3]
        if snap[4]:
            g.endPtsOfContours = snap[4]
        if snap[5]:
            g.program = Program()
            g.program.fromBytecode(bytes(snap[5]))
        else:
            g.program = Program()
    else:
        g.numberOfContours = -1
        g.components = []
        for name2, x, y, tr, flags in snap[1]:
            c = GlyphComponent()
            c.glyphName = name2
            c.x = x
            c.y = y
            c.flags = flags
            if tr is not None:
                c.transform = [[tr[0], tr[1]], [tr[2], tr[3]]]
            g.components.append(c)
        g.program = Program()
    return g

def _ensure_snapshot(data_key, data):
    if data_key in _FONT_CACHE:
        return
    # lazy=True: glyf 字形按需解析, 大字体首次预览只解析用到的字形
    f = TTFont(BytesIO(data), fontNumber=0, lazy=True)
    _FONT_CACHE[data_key] = f
    _GLYPH_ORIG[data_key] = {}
    _HMTX_ORIG[data_key] = dict(f['hmtx'].metrics)
    _LINEGAP_ORIG[data_key] = (
        f['hhea'].lineGap if 'hhea' in f else 0,
        f['OS/2'].sTypoLineGap if 'OS/2' in f else 0,
    )

def _orig_glyph(data_key, name):
    # 懒快照单个字形
    snap = _GLYPH_ORIG[data_key].get(name, '?')
    if snap == '?':
        f = _FONT_CACHE[data_key]
        g = f['glyf'][name] if name in f['glyf'] else None
        snap = _snapshot_glyph(g)
        _GLYPH_ORIG[data_key][name] = snap
    return snap

# Glyph 无 transform 方法: numpy 批量变换简单字形点, 复合字形合并组件矩阵
def _apply_matrix(g, matrix):
    if g is None:
        return
    nc = g.numberOfContours
    if nc is not None and nc >= 0 and hasattr(g, 'coordinates'):
        coords = g.coordinates
        xx, xy, yx, yy, dx, dy = matrix
        arr = numpy.array(coords, dtype=numpy.float64)
        arr = arr @ numpy.array([[xx, xy], [yx, yy]], dtype=numpy.float64)
        arr = arr + numpy.array([dx, dy], dtype=numpy.float64)
        arr = numpy.rint(arr).astype(numpy.int32)
        g.coordinates = GlyphCoordinates(arr.tolist())
    elif nc == -1:
        xx, xy, yx, yy, dx, dy = matrix
        for c in g.components:
            tr = getattr(c, 'transform', None)
            if tr:
                c.transform = [[xx * tr[0][0] + xy * tr[1][0], xx * tr[0][1] + xy * tr[1][1]],
                               [yx * tr[0][0] + yy * tr[1][0], yx * tr[0][1] + yy * tr[1][1]]]
            px = c.x * xx + c.y * xy + dx
            py = c.x * yx + c.y * yy + dy
            c.x, c.y = round(px), round(py)

def _glyph_names_for_text(f, text):
    cmap = f.getBestCmap()
    names = set()
    for ch in text:
        cp = ord(ch)
        if cp in cmap:
            names.add(cmap[cp])
    return names

def edit_font(data_key, data, scale, dx, dy, letter_spacing=0, line_spacing=0,
              preview_chars=None):
    try:
        _ensure_snapshot(data_key, data)
        f = _FONT_CACHE[data_key]
        if 'glyf' not in f:
            return {'ok': False, 'error': '仅支持 TrueType (.ttf) 字体'}
        glyf = f['glyf']
        matrix = Transform(scale, 0, 0, scale, dx, dy)
        # 预览模式: 只重置+变换预览文本涉及的字形; 导出时全量
        if preview_chars:
            names = _glyph_names_for_text(f, preview_chars)
        else:
            names = set(f.getGlyphOrder())
        for name in names:
            snap = _orig_glyph(data_key, name)
            if snap is not None:
                glyf[name] = _restore_glyph(snap)
                _apply_matrix(glyf[name], matrix)
        # 度量: 从原始快照重算 (advance 全量调整)
        hmtx = f['hmtx']
        orig_hmtx = _HMTX_ORIG[data_key]
        for name, (advance, lsb) in orig_hmtx.items():
            if advance:
                hmtx.metrics[name] = (max(1, round(advance * scale + letter_spacing)), lsb)
            else:
                hmtx.metrics[name] = (0, lsb)
        if line_spacing:
            orig_line_gap, orig_typo_gap = _LINEGAP_ORIG[data_key]
            if 'hhea' in f:
                f['hhea'].lineGap = max(0, round(orig_line_gap + line_spacing))
            if 'OS/2' in f:
                f['OS/2'].sTypoLineGap = max(0, round(orig_typo_gap + line_spacing))
        # 编辑后可变轴已无意义, 丢弃
        for t in ('fvar', 'gvar', 'avar', 'STAT', 'cvar'):
            if t in f:
                del f[t]
        # 注: 预览模式不做 subset (subset 会污染缓存字体对象), 直接输出完整字体
        out = BytesIO()
        f.save(out)
        return {'ok': True, 'data': out.getvalue()}
    except Exception as e:
        return {'ok': False, 'error': str(e)}

# 预览: 提取预览文本涉及字形的轮廓点 (不生成字体文件, 毫秒级)
# 返回 { glyphs: {unicode码点: {pts: [[x,y,on],...], end: [...], adv: advance}}, upem, lineGap }
def build_preview(data_key, data, text, scale, dx, dy, letter_spacing=0, line_spacing=0):
    try:
        _ensure_snapshot(data_key, data)
        f = _FONT_CACHE[data_key]
        if 'glyf' not in f:
            return {'ok': False, 'error': '仅支持 TrueType (.ttf) 字体'}
        cmap = f.getBestCmap()
        glyf = f['glyf']
        hmtx = f['hmtx']
        matrix = Transform(scale, 0, 0, scale, dx, dy)
        orig_glyphs = _GLYPH_ORIG[data_key]
        glyphs = {}
        for ch in text:
            cp = ord(ch)
            if cp in glyphs:
                continue
            name = cmap.get(cp)
            if name is None:
                continue
            snap = _orig_glyph(data_key, name)
            if snap is None:
                continue
            g = _restore_glyph(snap)
            _apply_matrix(g, matrix)
            # getCoordinates 自动展开复合字形
            coords, endPts, flags = g.getCoordinates(glyf)
            pts = []
            for i, (x, y) in enumerate(coords):
                on = 1 if flags[i] & 0x01 else 0
                pts.append([round(x), round(y), on])
            advance, _ = hmtx[name]
            glyphs[str(cp)] = {'pts': pts, 'end': list(endPts), 'adv': max(1, round(advance * scale + letter_spacing))}
        line_gap = _LINEGAP_ORIG[data_key][0] if line_spacing else 0
        import json
        # JSON 序列化传递 (避免 PyProxy 经 postMessage 克隆失败)
        return {'ok': True, 'json': json.dumps({
            'glyphs': glyphs,
            'upem': f['head'].unitsPerEm,
            'lineGap': max(0, round(line_gap + line_spacing)),
        })}
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
      await py.loadPackage('numpy');
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
    } else if (type === 'preview') {
      const r = py.globals
        .get('build_preview')(
          payload.dataKey,
          py.toPy(new Uint8Array(payload.data)),
          payload.text,
          payload.scale,
          payload.dx,
          payload.dy,
          payload.letterSpacing ?? 0,
          payload.lineSpacing ?? 0,
        )
        .toJs({ dict_converter: Object.fromEntries });
      if (r.ok) {
        const parsed = JSON.parse(r.json);
        self.postMessage({
          id,
          ok: true,
          glyphs: parsed.glyphs,
          upem: parsed.upem,
          lineGap: parsed.lineGap,
        });
      } else {
        self.postMessage({ id, ok: false, error: r.error });
      }
    } else if (type === 'edit') {
      const bytes = py.toPy(new Uint8Array(payload.data));
      const r = py.globals
        .get('edit_font')(
          payload.dataKey,
          bytes,
          payload.scale,
          payload.dx,
          payload.dy,
          payload.letterSpacing ?? 0,
          payload.lineSpacing ?? 0,
          payload.previewChars ?? null,
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
