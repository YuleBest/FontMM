import { exec, toast } from './ksu';
import { pickWghtRange, updateWghtModeDisabled } from './slots';
import { WEIGHTS, averagedAxis } from './fontsXml';
import { FONTS_DIR, WGHT_BIN } from './constants';

export type WghtMode = 0 | 1 | 2 | 3;

const wghtModeSelect = document.getElementById('wght-mode-select') as any;
const wghtMapRows = document.getElementById('wght-map-rows');
const wghtMapAddBtn = document.getElementById('wght-map-add');
const wghtMapAddDialog = document.getElementById('wght-map-add-dialog') as any;
const wghtMapAddWeight = document.getElementById('wght-map-add-weight') as HTMLInputElement;
const wghtMapUndoBtn = document.getElementById('wght-map-undo');
const wghtMapExportBtn = document.getElementById('wght-map-export');
const wghtMapImportBtn = document.getElementById('wght-map-import');
const wghtMapResetBtn = document.getElementById('wght-map-reset');
const wghtMapTransferDialog = document.getElementById('wght-map-transfer-dialog') as any;
const wghtMapTransferTitle = document.getElementById('wght-map-transfer-title');
const wghtMapTransferNote = document.getElementById('wght-map-transfer-note');
const wghtMapTransferInput = document.getElementById(
  'wght-map-transfer-input',
) as HTMLTextAreaElement;
const wghtMapTransferCancel = document.getElementById('wght-map-transfer-cancel');
const wghtMapTransferConfirm = document.getElementById('wght-map-transfer-confirm');

// 撤销历史栈 (每次用户编辑前的映射快照)
const undoStack: Record<number, number>[] = [];
const UNDO_LIMIT = 30;
// 最近一次已提交/已渲染的映射 (撤销入栈的基准)
let lastSnapshot: Record<number, number> | null = null;

// 高级配置卡片折叠/展开 (默认收起)
const wghtAdvancedHeader = document.getElementById('wght-advanced-header');
wghtAdvancedHeader?.closest('.wght-advanced')?.classList.add('collapsed');
wghtAdvancedHeader?.addEventListener('click', () => {
  wghtAdvancedHeader.closest('.wght-advanced')?.classList.toggle('collapsed');
});

// 读取当前 UI 选择的字重覆写模式 (默认 0 不处理)
export function getSelectedWghtMode(): WghtMode {
  return (Number(wghtModeSelect?.value ?? 0) || 0) as WghtMode;
}

// 写入模式到 FONTS/wght-mode.txt
export async function writeWghtMode(mode: WghtMode): Promise<void> {
  try {
    await exec(`echo '${mode}' > '${FONTS_DIR}/wght-mode.txt'`);
  } catch {
    // 忽略写入失败
  }
}

// 读取字重覆写模式 (FONTS/wght-mode.txt), 默认 0 不处理
async function readWghtMode(): Promise<WghtMode> {
  try {
    const { errno, stdout } = await exec(`cat '${FONTS_DIR}/wght-mode.txt' 2>/dev/null || true`);
    if (errno === 0) {
      const n = Number(stdout.trim());
      if (n === 1 || n === 2 || n === 3) return n as WghtMode;
    }
  } catch {
    // 忽略
  }
  return 0;
}

// 覆写字体配置: 调用模块内置 Go 程序 fontmm-wght (只改 fonts.xml, 再 -sync 到各派生配置)
export async function applyWghtOverride(mode: 1 | 2 | 3, min: number, max: number): Promise<void> {
  const mapArg = mode === 3 ? ` -map '${FONTS_DIR}/wght-map.txt'` : '';
  // 日志写到 FONTS/wght-apply.log 方便真机排查。
  // 工具在刷入后是 0644 (KernelSU 解压时不保留 zip 里的执行位), 故执行前临时
  // 加执行位、执行后还原; 末尾 exit $rc 保证 errno 仍是工具自身的退出码。
  const logFile = `${FONTS_DIR}/wght-apply.log`;
  const cmd = `chmod 0755 '${WGHT_BIN}' 2>/dev/null; '${WGHT_BIN}' -mode ${mode} -min ${min} -max ${max}${mapArg} -sync > '${logFile}' 2>&1; rc=$?; chmod 0644 '${WGHT_BIN}' 2>/dev/null; exit $rc`;
  try {
    const { errno } = await exec(cmd);
    // 读取并回显执行日志 (同时 console 输出供排查)
    const { stdout: log } = await exec(`cat '${logFile}' 2>/dev/null || true`);
    console.log(`[wght-override] mode=${mode} min=${min} max=${max} errno=${errno}`);
    if (log) console.log(`[wght-override] log:\n${log}`);
    if (errno !== 0) {
      console.warn('[wght-override] 执行失败:', log);
      // 覆写失败不阻断应用主流程, 但把失败原因带出
      throw new Error(log || `fontmm-wght 执行失败 (errno=${errno})`);
    }
  } catch (e) {
    // 覆写失败不阻断应用主流程
    console.warn('字重范围覆写失败:', e);
  }
}

// 读取自定义字重映射 (FONTS/wght-map.txt: 每行 "weight axis")
async function readWghtMap(): Promise<Record<number, number>> {
  const map: Record<number, number> = {};
  try {
    const { errno, stdout } = await exec(`cat '${FONTS_DIR}/wght-map.txt' 2>/dev/null || true`);
    if (errno === 0) {
      for (const line of stdout.split('\n')) {
        const m = line.trim().match(/^(\d+)\s+(\d+)$/);
        if (m) map[Number(m[1])] = Number(m[2]);
      }
    }
  } catch {
    // 忽略
  }
  return map;
}

// 保存自定义字重映射 (DOM 驱动: 每行 data-weight + 输入值)
async function saveWghtMap(): Promise<void> {
  const lines: string[] = [];
  document.querySelectorAll<HTMLElement>('#wght-map-rows .wght-map-row').forEach((row) => {
    const w = Number(row.dataset.weight);
    const input = row.querySelector<HTMLInputElement>('.wght-map-input');
    const v = Number(input?.value);
    if (Number.isFinite(w) && Number.isFinite(v)) lines.push(`${w} ${Math.round(v)}`);
  });
  try {
    await exec(`rm -f '${FONTS_DIR}/wght-map.txt'`);
    for (const line of lines) {
      await exec(`echo '${line}' >> '${FONTS_DIR}/wght-map.txt'`);
    }
  } catch {
    // 忽略写入失败
  }
}

// 当前 DOM 行的映射快照 (weight -> axis)
function snapshotMap(): Record<number, number> {
  const map: Record<number, number> = {};
  document.querySelectorAll<HTMLElement>('#wght-map-rows .wght-map-row').forEach((row) => {
    const w = Number(row.dataset.weight);
    const input = row.querySelector<HTMLInputElement>('.wght-map-input');
    const v = Number(input?.value);
    if (Number.isFinite(w) && Number.isFinite(v)) map[w] = Math.round(v);
  });
  return map;
}

// 用户编辑提交时入栈上一次状态 (编辑后 DOM 已成为新基准), 供撤销恢复
function recordUndo(): void {
  if (lastSnapshot) {
    undoStack.push(lastSnapshot);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  }
  lastSnapshot = snapshotMap();
}

// 撤销: 弹回上一次快照并重建 DOM 行 + 落盘
function undoMap(): void {
  const prev = undoStack.pop();
  if (!prev || !wghtMapRows) {
    if (!prev) toast('没有可撤销的操作');
    return;
  }
  const range = pickWghtRange();
  const min = range?.min ?? 1;
  const max = range?.max ?? 1000;
  wghtMapRows.textContent = '';
  for (const w of Object.keys(prev)
    .map(Number)
    .sort((a, b) => a - b)) {
    appendWghtMapRow(wghtMapRows, w, prev[w], min, max);
  }
  lastSnapshot = snapshotMap();
  void saveWghtMap();
  toast('已撤销');
}

// 导出: 当前映射 -> JSON -> base64 (UTF-8 安全)
function exportMap(): string {
  const map = snapshotMap();
  const json = JSON.stringify({ format: 'fontmm-wght-map', version: 1, map });
  return btoa(unescape(encodeURIComponent(json)));
}

// 导入: base64 -> JSON -> 重建 DOM 行并落盘 (自动切换为自定义映射)
async function importMap(b64: string): Promise<void> {
  let json: unknown;
  try {
    json = JSON.parse(decodeURIComponent(escape(atob(b64.replace(/\s/g, '')))));
  } catch {
    toast('导入失败: 不是有效的 base64 数据');
    return;
  }
  const map = (json as { map?: Record<string, unknown> } | undefined)?.map ?? json;
  const entries: [number, number][] = [];
  for (const [k, v] of Object.entries(map as Record<string, unknown>)) {
    const w = Number(k);
    const axis = Number(v);
    if (Number.isFinite(w) && Number.isFinite(axis)) entries.push([w, Math.round(axis)]);
  }
  if (!entries.length) {
    toast('导入失败: 未解析到有效映射');
    return;
  }
  const range = pickWghtRange();
  const min = range?.min ?? 1;
  const max = range?.max ?? 1000;
  if (!wghtMapRows) return;
  wghtMapRows.textContent = '';
  for (const [w, axis] of entries.sort((a, b) => a[0] - b[0])) {
    appendWghtMapRow(wghtMapRows, w, axis, min, max);
  }
  onUserEdit();
  toast(`已导入 ${entries.length} 条映射`);
}

// 追加一行映射 (weight 标签 + 滑块 + 输入框 + 删除按钮)
function appendWghtMapRow(
  rowsEl: HTMLElement,
  w: number,
  axis: number,
  min: number,
  max: number,
): void {
  const row = document.createElement('div');
  row.className = 'wght-map-row';
  row.dataset.weight = String(w);

  const label = document.createElement('span');
  label.className = 'wght-map-label';
  label.textContent = String(w);

  const slider = document.createElement('md-slider') as any;
  slider.min = min;
  slider.max = max;
  slider.step = 1;
  // 原生 input 接管手势, 禁用以避免轻触即跳值
  slider.style.pointerEvents = 'none';

  // 滑条容器 + 手势覆盖层: 按住并水平滑动才激活调整
  const sliderWrap = document.createElement('div');
  sliderWrap.className = 'wght-map-slider';
  const overlay = document.createElement('div');
  overlay.className = 'wght-map-slider-overlay';
  overlay.ariaLabel = `weight ${w} 的滑条`;

  const input = document.createElement('input');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.className = 'wght-map-input';
  input.ariaLabel = `weight ${w} 的轴值`;

  // 与粗细等级的对比 (轴值 - 字重, 如 +25 / -100)
  const diff = document.createElement('span');
  diff.className = 'wght-map-diff';

  const setDiff = (v: number) => {
    const d = Math.round(v) - w;
    diff.textContent = d > 0 ? `+${d}` : String(d);
  };

  const setBoth = (v: number) => {
    const clamped = Math.min(max, Math.max(min, Math.round(v)));
    slider.value = clamped;
    input.value = String(clamped);
    setDiff(clamped);
  };
  setBoth(axis);

  // 手势: 按住后水平位移超过阈值才激活; 激活后仅按水平位置更新值 (垂直移动不影响)
  let dragActive = false;
  let dragStartX = 0;
  let dragPointerId = -1;
  const DRAG_THRESHOLD = 8;

  overlay.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragPointerId = e.pointerId;
    dragStartX = e.clientX;
    dragActive = false;
    overlay.setPointerCapture(dragPointerId);
  });
  overlay.addEventListener('pointermove', (e) => {
    if (e.pointerId !== dragPointerId) return;
    if (!dragActive && Math.abs(e.clientX - dragStartX) <= DRAG_THRESHOLD) return;
    dragActive = true;
    const rect = slider.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setBoth(min + (max - min) * frac);
  });
  const endDrag = (e: PointerEvent) => {
    if (e.pointerId !== dragPointerId) return;
    dragPointerId = -1;
    const wasActive = dragActive;
    dragActive = false;
    try {
      overlay.releasePointerCapture(e.pointerId);
    } catch {
      // 已释放则忽略
    }
    if (wasActive) onUserEdit();
  };
  overlay.addEventListener('pointerup', endDrag);
  overlay.addEventListener('pointercancel', endDrag);

  input.addEventListener('input', () => {
    const v = Number(input.value);
    if (Number.isFinite(v)) {
      slider.value = Math.min(max, Math.max(min, v));
      setDiff(v);
    }
  });
  input.addEventListener('change', () => {
    const v = Number(input.value);
    if (!Number.isFinite(v)) {
      input.value = String(slider.value);
      return;
    }
    setBoth(v);
    void onUserEdit();
  });

  const delBtn = document.createElement('md-icon-button') as any;
  delBtn.ariaLabel = `删除字重 ${w} 映射`;
  delBtn.className = 'wght-map-del';
  const delIcon = document.createElement('md-icon');
  delIcon.textContent = 'close';
  delBtn.appendChild(delIcon);
  delBtn.addEventListener('click', () => {
    row.remove();
    void onUserEdit();
  });

  row.append(label, sliderWrap, diff, input, delBtn);
  sliderWrap.append(slider, overlay);
  rowsEl.appendChild(row);
}

// 计算所选模式的实时映射结果 (weight -> axis)
// mode 1=裁切: 仅保留范围内字重, axis=weight; mode 2=平均: 9 档线性插值;
// mode 0/3: 优先展示已保存的自定义映射, 空则回退平均默认
function effectiveMapping(
  mode: WghtMode,
  min: number,
  max: number,
  saved: Record<number, number>,
): Record<number, number> {
  const map: Record<number, number> = {};
  if (mode === 1) {
    for (const w of WEIGHTS) if (w >= min && w <= max) map[w] = w;
    return map;
  }
  if (mode === 2) {
    for (const w of WEIGHTS) map[w] = averagedAxis(min, max, w);
    return map;
  }
  if (Object.keys(saved).length > 0) return saved;
  for (const w of WEIGHTS) map[w] = averagedAxis(min, max, w);
  return map;
}

// 用户在映射区修改任意值 (改值/删除/新增/导入): 入栈撤销 + 自动切换为自定义映射并保存
function onUserEdit(): void {
  recordUndo();
  if (getSelectedWghtMode() !== 3) {
    if (wghtModeSelect) wghtModeSelect.value = '3';
    void writeWghtMode(3);
  }
  void saveWghtMap();
}

// 渲染字重映射行 (按当前模式实时预览: 读 wght-map.txt; 空时默认 9 档平均插值)
function renderWghtMapRows(): void {
  if (!wghtMapRows) return;
  const range = pickWghtRange();
  const min = range?.min ?? 1;
  const max = range?.max ?? 1000;
  const mode = getSelectedWghtMode();
  void readWghtMap().then((saved) => {
    if (!wghtMapRows) return;
    wghtMapRows.textContent = '';
    const map = effectiveMapping(mode, min, max, saved);
    for (const w of Object.keys(map)
      .map(Number)
      .sort((a, b) => a - b)) {
      appendWghtMapRow(wghtMapRows, w, map[w], min, max);
    }
    lastSnapshot = snapshotMap();
  });
}

// 回填模式选择
async function initWghtModeUI(): Promise<void> {
  const mode = await readWghtMode();
  if (wghtModeSelect) wghtModeSelect.value = String(mode);
  updateWghtModeDisabled();
  renderWghtMapRows();
}

wghtModeSelect?.addEventListener('change', () => {
  const v = Number(wghtModeSelect.value);
  if (v === 0 || v === 1 || v === 2 || v === 3) {
    void writeWghtMode(v as WghtMode);
    renderWghtMapRows();
  }
});
// 槽位变化 (新字体 wght 范围变更) 时刷新映射预览
document.addEventListener('slots-rendered', () => renderWghtMapRows());
void initWghtModeUI();

// 新增字重映射对话框
wghtMapAddBtn?.addEventListener('click', () => {
  if (wghtMapAddWeight) wghtMapAddWeight.value = '';
  if (wghtMapAddDialog) wghtMapAddDialog.open = true;
});
document.getElementById('wght-map-add-cancel')?.addEventListener('click', () => {
  if (wghtMapAddDialog) wghtMapAddDialog.open = false;
});
document.getElementById('wght-map-add-confirm')?.addEventListener('click', () => {
  if (wghtMapAddDialog) wghtMapAddDialog.open = false;
  const w = Number(wghtMapAddWeight?.value);
  if (!Number.isFinite(w) || w < 1 || w > 1000) {
    toast('字重等级需为 1-1000 的整数');
    return;
  }
  const weight = Math.round(w);
  // 重复 weight 则更新, 否则新增一行
  const existing = document.querySelector<HTMLElement>(
    `#wght-map-rows .wght-map-row[data-weight="${weight}"]`,
  );
  if (!wghtMapRows) return;
  const range = pickWghtRange();
  const min = range?.min ?? 1;
  const max = range?.max ?? 1000;
  if (existing) {
    existing.scrollIntoView({ block: 'center' });
  } else {
    appendWghtMapRow(wghtMapRows, weight, averagedAxis(min, max, weight), min, max);
  }
  onUserEdit();
});

// 工具栏: 撤销 / 导出 / 导入 / 重置
wghtMapUndoBtn?.addEventListener('click', () => {
  undoMap();
});

// 重置: 清空已保存自定义映射, 恢复当前模式默认预览
wghtMapResetBtn?.addEventListener('click', () => {
  void (async () => {
    try {
      await exec(`rm -f '${FONTS_DIR}/wght-map.txt'`);
    } catch {
      // 忽略删除失败
    }
    renderWghtMapRows();
    toast('已重置为默认映射');
  })();
});

// 转移对话框 (导出显示 / 导入粘贴复用)
let transferMode: 'export' | 'import' = 'export';
wghtMapExportBtn?.addEventListener('click', () => {
  transferMode = 'export';
  if (wghtMapTransferTitle) wghtMapTransferTitle.textContent = '导出映射';
  if (wghtMapTransferNote)
    wghtMapTransferNote.textContent = '以下为当前映射的 base64 编码 (JSON)，请复制保存到其他设备';
  if (wghtMapTransferInput) {
    wghtMapTransferInput.readOnly = true;
    wghtMapTransferInput.value = exportMap();
    wghtMapTransferInput.select();
  }
  if (wghtMapTransferConfirm) wghtMapTransferConfirm.textContent = '关闭';
  if (wghtMapTransferDialog) wghtMapTransferDialog.open = true;
});
wghtMapImportBtn?.addEventListener('click', () => {
  transferMode = 'import';
  if (wghtMapTransferTitle) wghtMapTransferTitle.textContent = '导入映射';
  if (wghtMapTransferNote)
    wghtMapTransferNote.textContent =
      '粘贴从其他设备导出的 base64 编码 (JSON)，导入将替换当前自定义映射';
  if (wghtMapTransferInput) {
    wghtMapTransferInput.readOnly = false;
    wghtMapTransferInput.value = '';
  }
  if (wghtMapTransferConfirm) wghtMapTransferConfirm.textContent = '导入';
  if (wghtMapTransferDialog) wghtMapTransferDialog.open = true;
});
wghtMapTransferCancel?.addEventListener('click', () => {
  if (wghtMapTransferDialog) wghtMapTransferDialog.open = false;
});
wghtMapTransferConfirm?.addEventListener('click', () => {
  if (wghtMapTransferDialog) wghtMapTransferDialog.open = false;
  if (transferMode === 'import' && wghtMapTransferInput) {
    void importMap(wghtMapTransferInput.value);
  }
});
