import { slots } from './slots';
import { listFontsDir } from './fontFiles';
import type { FontSlot } from './types';

const testStatusText = document.getElementById('test-status-text')!;
const testContent = document.getElementById('test-content')!;

type TestSlot = 'hans' | 'hant' | 'en';

const TEST_FONTS: { slot: TestSlot; file: string; family: string }[] = [
  { slot: 'hans', file: 'hans.ttf', family: 'FontMM-Hans' },
  { slot: 'hant', file: 'hant.ttf', family: 'FontMM-Hant' },
  { slot: 'en', file: 'en.ttf', family: 'FontMM-En' },
];

async function registerFont(family: string, file: string): Promise<boolean> {
  try {
    // 声明完整字重范围: 否则 FontFace 默认只覆盖 weight 400,
    // CSS font-weight 100-900 将无法匹配到该字体 (真机表现: 100-400 无变化)
    const font = new FontFace(family, `url('fonts-test/${file}')`, { weight: '100 900' });
    await font.load();
    document.fonts.add(font);
    return true;
  } catch {
    return false;
  }
}

// 测试页字体只加载一次 (进入时), 应用新字体后重置, 避免每次进入重复加载
let testLoaded = false;

// 字体已变化: 下次进入测试页时重新加载
export function invalidateTestFonts(): void {
  testLoaded = false;
}

export async function loadTestFonts(): Promise<void> {
  if (testLoaded) return;
  testContent.hidden = true;
  testStatusText.textContent = '正在加载字体...';

  // 字体已在 WebUI 打开时复制到 fonts-test, 此处直接读取
  const available = await listFontsDir();

  // 注册字体, 记录每个槽位是否加载成功
  const loaded = new Map<TestSlot, boolean>();
  for (const tf of TEST_FONTS) {
    loaded.set(
      tf.slot,
      available.includes(tf.file) ? await registerFont(tf.family, tf.file) : false,
    );
  }

  // fallback 逻辑: hant/en 缺失回退 hans
  const hans = loaded.get('hans') ? 'FontMM-Hans' : 'sans-serif';
  const hant = loaded.get('hant') ? 'FontMM-Hant' : hans;
  const en = loaded.get('en') ? 'FontMM-En' : hans;

  // 显示字体名称 (解析出的 family name; 未解析到时为文件名)
  const slotLabel = (key: TestSlot): string => slots[key].fileName;
  const hasFont = (key: TestSlot): boolean => available.includes(`${key}.ttf`);
  const hansLabel = hasFont('hans') ? slotLabel('hans') : null;

  const setTag = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  setTag('hans-tag', hasFont('hans') ? slotLabel('hans') : '未设置, 使用系统字体');
  setTag(
    'hant-tag',
    hasFont('hant') ? slotLabel('hant') : hansLabel ? `回退 ${hansLabel}` : '未设置, 使用系统字体',
  );
  setTag(
    'en-tag',
    hasFont('en') ? slotLabel('en') : hansLabel ? `回退 ${hansLabel}` : '未设置, 使用系统字体',
  );
  setTag('weight-tag', `使用 ${hansLabel ?? '系统字体'}`);
  // 可变字体提示: 若所选字体为可变字体, 显示 wght 轴范围
  const varSlot: FontSlot | null = slots.hans.isVariable ? slots.hans : null;
  setTag(
    'var-tag',
    `使用 ${hansLabel ?? '系统字体'}${varSlot?.wghtRange ? ` (可变字体 wght ${varSlot.wghtRange})` : ''}`,
  );

  const setFamily = (id: string, family: string, fallback: string) => {
    const el = document.getElementById(id);
    if (el) el.style.fontFamily = `'${family}', ${fallback}`;
  };
  setFamily('test-hans', hans, 'sans-serif');
  setFamily('test-hant', hant, `'${hans}', sans-serif`);
  setFamily('test-en', en, `'${hans}', sans-serif`);
  // 字重 / 可变字体测试: 用完整 fallback 链渲染 (Hans → Hant → En 按用户选择顺序,
  // 浏览器逐字形回退, 所见即所得地体现系统真实 fallback)
  const fallbackChain = [...new Set([hans, hant, en])].map((f) => `'${f}'`).join(', ');
  const fullChain = `${fallbackChain}, sans-serif`;
  document.querySelectorAll<HTMLElement>('.test-w-text').forEach((el) => {
    el.style.fontFamily = fullChain;
  });
  const vp = document.getElementById('test-var-preview');
  if (vp) vp.style.fontFamily = fullChain;
  applyWght(400); // 与滑条初始值保持一致

  testStatusText.textContent =
    available.length === 0
      ? '未找到已设置的字体 (FONTS 为空), 当前使用系统字体预览'
      : '字体已加载, 下方为预览效果 (按 fallback 逻辑)';
  testContent.hidden = false;
  testLoaded = true;
}

// 字重档位名称 (与字重测试区一致)
const WEIGHT_NAMES: Record<number, string> = {
  100: '淡体 Thin',
  200: '特细 ExtraLight',
  300: '细体 Light',
  400: '标准 Regular',
  500: '适中 Medium',
  600: '次粗 SemiBold',
  700: '粗体 Bold',
  800: '特粗 ExtraBold',
  900: '浓体 Black',
};

// 可变字体滑动条: 滑动中只更新数值显示, 停止 250ms 后才应用字重 (省性能)
const wghtSlider = document.getElementById('wght-slider') as any;
const wghtValue = document.getElementById('wght-value')!;
const varPreview = document.getElementById('test-var-preview') as HTMLElement | null;

let wghtTimer: number | undefined;
function applyWght(weight: number) {
  if (varPreview) varPreview.style.fontVariationSettings = `'wght' ${weight}`;
}

function updateVarPreview(weight: number) {
  if (!varPreview) return;
  const key = Math.round(weight / 100) * 100;
  const name = WEIGHT_NAMES[key] ?? String(weight);
  varPreview.textContent = `${weight} - ${name}`;
}

wghtSlider?.addEventListener('input', (e: Event) => {
  const value = Number((e.target as any).value);
  wghtValue.textContent = String(value);
  updateVarPreview(value);
  window.clearTimeout(wghtTimer);
  wghtTimer = window.setTimeout(() => applyWght(value), 250);
});
// 松手时立即应用最终值, 避免防抖延迟
wghtSlider?.addEventListener('change', (e: Event) => {
  const value = Number((e.target as any).value);
  wghtValue.textContent = String(value);
  updateVarPreview(value);
  applyWght(value);
});

// 字号滑条: 直接应用 (12-40px), 设置 style 开销小无需防抖
const sizeSlider = document.getElementById('size-slider') as any;
const sizeValue = document.getElementById('size-value')!;
sizeSlider?.addEventListener('input', (e: Event) => {
  const value = Number((e.target as any).value);
  sizeValue.textContent = String(value);
  if (varPreview) varPreview.style.fontSize = `${value}px`;
});

// 点击可编辑测试卡片 (简体/繁体/英文) 修改测试文本
let editTargetId: string | null = null;
const editDialog = document.getElementById('edit-text-dialog') as any;
const editInput = document.getElementById('edit-text-input') as any;

document.querySelectorAll<HTMLElement>('.test-card-editable').forEach((card) => {
  card.addEventListener('click', () => {
    const targetId = card.dataset.editTarget;
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (!target) return;
    editTargetId = targetId;
    // trim: textContent 带着标签间的缩进与换行, 原样填入会在输入框里显示成空行 (issue #16)
    editInput.value = (target.textContent ?? '').trim();
    if (editDialog) editDialog.open = true;
  });
});

document.getElementById('edit-text-cancel')?.addEventListener('click', () => {
  if (editDialog) editDialog.open = false;
});
document.getElementById('edit-text-save')?.addEventListener('click', () => {
  if (editDialog) editDialog.open = false;
  if (!editTargetId) return;
  const target = document.getElementById(editTargetId);
  if (target) target.textContent = editInput.value;
});
