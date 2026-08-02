import '@material/web/button/outlined-button.js';
import '@material/web/button/text-button.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/icon/icon.js';
import '@material/web/dialog/dialog.js';
import '@material/web/slider/slider.js';
import '@material/web/labs/card/elevated-card.js';
import '@material/web/labs/navigationbar/navigation-bar.js';
import '@material/web/labs/navigationtab/navigation-tab.js';
import 'material-symbols/outlined.css';

import './theme.scss';
import './style.scss';

import { exec, enableEdgeToEdge, moduleInfo, toast } from './ksu';
import { FontFilePicker } from './fontPicker';
import type { FontSlot } from './types';
import * as opentype from 'opentype.js';

// edge-to-edge: 启用安全区 insets, 内容延伸至状态栏/底部小白条区域,
// insets.css 的 --window-inset-* 变量随之生效, 底栏据此避让
enableEdgeToEdge(true);

const FONTS_DIR = '/data/adb/modules/FontMM/FONTS';

const slots: Record<'hans' | 'hant' | 'en' | 'mono', FontSlot> = {
  hans: {
    key: 'hans',
    title: '中文简体',
    path: null,
    fileName: '',
  },
  hant: {
    key: 'hant',
    title: '中文繁体',
    path: null,
    fileName: '',
  },
  en: {
    key: 'en',
    title: '英文 & 数字',
    path: null,
    fileName: '',
  },
  mono: {
    key: 'mono',
    title: '等宽字体',
    path: null,
    fileName: '',
  },
};

const slotsEl = document.getElementById('slots')!;
const applyBtn = document.getElementById('apply-btn') as HTMLButtonElement;
const logDialog = document.getElementById('log-dialog') as any;
const logContent = document.getElementById('log-content')!;

document.getElementById('log-close')?.addEventListener('click', () => {
  logDialog.open = false;
});

let pickingKey: keyof typeof slots = 'hans';
let applying = false;

const picker = new FontFilePicker((path, name) => {
  const slot = slots[pickingKey];
  slot.path = path;
  slot.fileName = name;
  renderSlots();
  void refreshSlotInfo(slot);
});

// ---------- 字体名称解析 (opentype.js) ----------
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

// 读取 fonts-test/ 下字体文件的名称与大小 (WebView 仅能访问 webroot 内文件)
async function readFontInfo(file: string): Promise<{ name?: string; sizeText?: string }> {
  try {
    const res = await fetch(`fonts-test/${file}`);
    if (!res.ok) return {};
    const buf = await res.arrayBuffer();
    const font = opentype.parse(buf);
    const name = extractFamilyName(font);
    const sizeText = `${(buf.byteLength / 1024 / 1024).toFixed(1)} MB`;
    return { name: name ?? undefined, sizeText };
  } catch {
    return {};
  }
}

// 选择新字体后: 复制到 fonts-test 供解析, 更新卡片显示的名称/大小
async function refreshSlotInfo(slot: FontSlot) {
  if (!slot.path) return;
  try {
    await exec(`cp -f '${slot.path}' '${TEST_FONT_DIR}/${slot.key}.ttf'`);
    const info = await readFontInfo(`${slot.key}.ttf`);
    if (info.name) slot.fileName = info.name;
    if (info.sizeText) slot.sizeText = info.sizeText;
    renderSlots();
  } catch {
    // 忽略解析失败, 保持选择器返回的文件名
  }
}

// 打开 WebUI 时: 复制 FONT/ 到 fonts-test, 读取已有字体的名称/大小填充卡片
async function loadExistingFonts() {
  const available = await ensureFontsCopy();
  for (const key of ['hans', 'hant', 'en', 'mono'] as const) {
    const file = `${key}.ttf`;
    if (!available.includes(file)) continue;
    const slot = slots[key];
    const info = await readFontInfo(file);
    slot.path = `${FONTS_DIR}/${file}`;
    slot.fileName = info.name ?? file;
    if (info.sizeText) slot.sizeText = info.sizeText;
  }
  renderSlots();
}

// 未选择时的占位文案: 回退可视化 (WYSIWYG)
function slotPlaceholder(slot: FontSlot): string {
  if (slot.path) return slot.fileName;
  if (slot.key === 'hans') return '未选择字体文件';
  if (slots.hans.path) {
    if (slot.key === 'mono') return '未选择，保持系统等宽字体';
    return `默认使用：${slots.hans.fileName}`;
  }
  return '未选择字体文件';
}

function renderSlots() {
  slotsEl.innerHTML = Object.values(slots)
    .map((slot) => {
      // 选了其他槽位但未选简体时, 简体卡片提示"必选"
      const required =
        slot.key === 'hans' &&
        !slot.path &&
        Object.values(slots).some((s) => s.key !== 'hans' && s.path);
      const nameText = required ? '此字体为必选' : slotPlaceholder(slot);
      return `
    <md-elevated-card class="slot-card ${slot.key === 'hans' ? 'slot-hans' : ''} ${slot.path ? 'selected' : ''}">
      <div class="slot-header">
        <div class="slot-title-group">
          <span class="slot-title">${slot.title}</span>
        </div>
        <div class="slot-actions">
          <md-outlined-button class="slot-pick" data-key="${slot.key}">
            <md-icon slot="icon">folder_open</md-icon>
            ${slot.path ? '更换' : '选择'}
          </md-outlined-button>
        </div>
      </div>

      <div class="slot-file">
        ${
          slot.path
            ? `<md-icon-button class="slot-clear" data-key="${slot.key}" aria-label="取消选择">
               <md-icon>close</md-icon>
             </md-icon-button>`
            : ''
        }
        <div class="slot-file-text">
          <div class="slot-name ${!slot.path ? 'placeholder' : ''} ${required ? 'required' : ''}">${nameText}</div>
          ${slot.path ? `<div class="slot-meta">${slot.sizeText || '…'} · 字体文件</div>` : ''}
        </div>
      </div>
    </md-elevated-card>
  `;
    })
    .join('');

  // 绑定事件
  slotsEl.querySelectorAll<HTMLElement>('.slot-pick').forEach((btn) => {
    btn.addEventListener('click', () => {
      pickingKey = btn.dataset.key as keyof typeof slots;
      picker.show();
    });
  });
  slotsEl.querySelectorAll<HTMLElement>('.slot-clear').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slot = slots[btn.dataset.key as keyof typeof slots];
      slot.path = null;
      slot.fileName = '';
      renderSlots();
    });
  });

  if (applyBtn) {
    // 未选择简体字体时直接隐藏按钮 (不做半透明禁用)
    applyBtn.style.display = !slots.hans.path ? 'none' : '';
    applyBtn.disabled = applying;
  }
}

async function copyFont(src: string, dest: string) {
  const { errno, stderr } = await exec(`cp -f '${src}' '${dest}'`);
  if (errno !== 0) throw new Error(`复制失败: ${stderr}`);
}

async function apply() {
  if (!slots.hans.path) return;
  applying = true;
  renderSlots();
  try {
    // 启动加载的字体 path 即 FONT/ 内的文件, 无需再复制
    if (slots.hans.path !== `${FONTS_DIR}/hans.ttf`) {
      await copyFont(slots.hans.path, `${FONTS_DIR}/hans.ttf`);
    }

    if (slots.hant.path) {
      if (slots.hant.path !== `${FONTS_DIR}/hant.ttf`) {
        await copyFont(slots.hant.path, `${FONTS_DIR}/hant.ttf`);
      }
    } else {
      await exec(`rm -f '${FONTS_DIR}/hant.ttf'`);
    }

    if (slots.en.path) {
      if (slots.en.path !== `${FONTS_DIR}/en.ttf`) {
        await copyFont(slots.en.path, `${FONTS_DIR}/en.ttf`);
      }
    } else {
      await exec(`rm -f '${FONTS_DIR}/en.ttf'`);
    }

    if (slots.mono.path) {
      if (slots.mono.path !== `${FONTS_DIR}/mono.ttf`) {
        await copyFont(slots.mono.path, `${FONTS_DIR}/mono.ttf`);
      }
    } else {
      await exec(`rm -f '${FONTS_DIR}/mono.ttf'`);
    }

    const { errno, stdout, stderr } = await exec('sh /data/adb/modules/FontMM/apply.sh');
    if (errno !== 0) throw new Error(stderr || 'apply.sh 执行失败');

    if (logContent && logDialog) {
      logContent.textContent = stdout;
      logDialog.open = true;
    }
    toast('字体已应用，重启后生效');
  } catch (e) {
    toast(`应用失败: ${String(e)}`);
  } finally {
    applying = false;
    renderSlots();
  }
}

applyBtn?.addEventListener('click', apply);
renderSlots();

// ---------------- 导航与视图切换 ----------------
const homeView = document.getElementById('home-view')!;
const testView = document.getElementById('test-view')!;
const aboutView = document.getElementById('about-view')!;

const views = [homeView, testView, aboutView];
const navBar = document.getElementById('nav-bar') as any;
// 悬浮应用按钮 (与首页绑定, 仅首页显示)
const applyFab = document.getElementById('apply-btn') as HTMLElement;

function showView(index: number) {
  views.forEach((v, i) => v.classList.toggle('active', i === index));
  // 悬浮应用按钮仅首页显示, 且未选简体字体时不展示
  applyFab.style.display = index === 0 && slots.hans.path ? '' : 'none';
  // 关于页隐藏顶栏 (自身带返回栏)
  document.body.classList.toggle('no-top-bar', index === 2);
  // 同步底部导航高亮 (仅首页/字体测试两个 tab)
  if (index < 2 && navBar) navBar.activeIndex = index;
  if (index === 1) loadTestFonts();
  if (index === 2) loadAbout();
}

// 悬浮按钮滚动隐藏: 向下滚动移出视口, 向上滚动出现
let lastScrollY = window.scrollY;
window.addEventListener(
  'scroll',
  () => {
    const y = window.scrollY;
    if (y > lastScrollY + 4) applyFab.classList.add('fab-hidden');
    else if (y < lastScrollY - 4) applyFab.classList.remove('fab-hidden');
    lastScrollY = y;
  },
  { passive: true },
);

navBar?.addEventListener('navigation-bar-activated', (e: { detail: { activeIndex: number } }) => {
  showView(e.detail.activeIndex);
});

// 关于入口: 顶栏按钮进入, 关于页返回栏回首页
document.getElementById('about-btn')?.addEventListener('click', () => showView(2));
document.getElementById('about-back')?.addEventListener('click', () => showView(0));

// ---------------- 关于页 ----------------
interface ModuleProp {
  [key: string]: string;
}

// 解析 module.prop 风格文本 (key=value 每行一个)
function parseProp(text: string): ModuleProp {
  const out: ModuleProp = {};
  for (const line of text.split('\n')) {
    const idx = line.indexOf('=');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      if (key) out[key] = line.slice(idx + 1).trim();
    }
  }
  return out;
}

async function loadAbout() {
  let prop: ModuleProp = {};

  // 1) 优先从 kernelsu WebUI API 获取模块信息
  try {
    prop = { ...prop, ...parseProp(moduleInfo()) };
  } catch {
    // dev 或 API 不可用时忽略, 走下方兜底
  }

  // 2) 兜底: 通过 kernelsu exec 读取模块的 module.prop
  try {
    const { errno, stdout } = await exec('cat /data/adb/modules/FontMM/module.prop');
    if (errno === 0) prop = { ...prop, ...parseProp(stdout) };
  } catch {
    // 忽略读取失败
  }

  const set = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  set('about-version', prop.version || '未知');
  set('about-version-code', prop.versionCode || '未知');
  set('about-author', prop.author || '未知');
  set('about-id', prop.id || 'FontMM');
  set('about-desc', prop.description || 'ColorOS 16 字体模块');
}

// ---------------- 字体测试页 ----------------
const WEBROOT_DIR = '/data/adb/modules/FontMM/webroot';
const TEST_FONT_DIR = `${WEBROOT_DIR}/fonts-test`;

const testStatus = document.getElementById('test-status')!;
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

// 复制 FONT/ 到 webroot/fonts-test, 供页面加载与名称解析
// (WebView 无法直接访问模块外部目录, 符号链接在真机也不可靠, 直接复制)
async function ensureFontsCopy(): Promise<string[]> {
  const copyCmd = [
    `rm -rf '${TEST_FONT_DIR}'`,
    `mkdir -p '${TEST_FONT_DIR}'`,
    `cp -f '${FONTS_DIR}'/*.ttf '${TEST_FONT_DIR}'/ 2>/dev/null`,
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
async function listFontsDir(): Promise<string[]> {
  try {
    const { errno, stdout } = await exec(`find '${TEST_FONT_DIR}' -maxdepth 1 -mindepth 1 -type f`);
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

async function loadTestFonts(): Promise<void> {
  testStatus.hidden = false;
  testContent.hidden = true;
  testStatus.textContent = '正在加载字体...';

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
  setTag('var-tag', `使用 ${hansLabel ?? '系统字体'}`);

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

  testStatus.textContent =
    available.length === 0
      ? '未找到已设置的字体 (FONTS 为空), 当前使用系统字体预览'
      : '字体已加载, 下方为预览效果 (按 fallback 逻辑)';
  testContent.hidden = false;
}

// 可变字体滑动条: 滑动中只更新数值显示, 停止 250ms 后才应用字重 (省性能)
const wghtSlider = document.getElementById('wght-slider') as any;
const wghtValue = document.getElementById('wght-value')!;
const varPreview = document.getElementById('test-var-preview') as HTMLElement | null;

let wghtTimer: number | undefined;
function applyWght(weight: number) {
  if (varPreview) varPreview.style.fontVariationSettings = `'wght' ${weight}`;
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

// 打开 WebUI 时读取 FONT/ 已有字体并填充卡片 (置于文件末尾, 确保常量均已初始化)
void loadExistingFonts();
