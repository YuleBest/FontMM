import '@material/web/button/outlined-button.js';
import '@material/web/button/text-button.js';
import '@material/web/button/filled-button.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/icon/icon.js';
import '@material/web/textfield/outlined-text-field.js';
import '@material/web/dialog/dialog.js';
import '@material/web/slider/slider.js';
import '@material/web/select/outlined-select.js';
import '@material/web/select/select-option.js';
import '@material/web/progress/linear-progress.js';
import '@material/web/labs/card/elevated-card.js';
import '@material/web/labs/card/filled-card.js';
import '@material/web/labs/navigationbar/navigation-bar.js';
import '@material/web/labs/navigationtab/navigation-tab.js';
import 'material-symbols/outlined.css';

import './theme.scss';
import './style.scss';

import {
  amStart,
  exec,
  enableEdgeToEdge,
  getSystemInfo,
  moduleInfo,
  shellQuote,
  toast,
} from './ksu';
import { FontFilePicker } from './fontPicker';
import { FontEditorToolDef, MiFontToolDef, ToolHost } from './tools';
import { applyWghtMode } from './fontsXml';
import type { FontSlot } from './types';
import * as opentype from 'opentype.js';

// edge-to-edge: 启用安全区 insets, 内容延伸至状态栏/底部小白条区域,
// insets.css 的 --window-inset-* 变量随之生效, 底栏据此避让
enableEdgeToEdge(true);

const FONTS_DIR = '/data/adb/modules/FontMM/FONTS';

const slots: Record<'hans' | 'hant' | 'en' | 'mono' | 'emoji', FontSlot> = {
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
  emoji: {
    key: 'emoji',
    title: 'Emoji 表情',
    path: null,
    fileName: '',
  },
};

const slotsEl = document.getElementById('slots')!;
// 字重覆写模式选择 (声明提前: renderSlots 首轮调用会访问)
const wghtModeSelect = document.getElementById('wght-mode-select') as any;
const wghtModeSub = document.getElementById('wght-mode-sub');
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
// 可变字体时同时返回 wght 轴范围
function extractWghtRange(font: any): string | undefined {
  const fvar = font?.tables?.fvar;
  if (!fvar?.axes) return undefined;
  const wght = fvar.axes.find((a: any) => a.tag === 'wght');
  if (!wght) return undefined;
  return `${Math.round(wght.minValue)}-${Math.round(wght.maxValue)}`;
}

async function readFontInfo(
  file: string,
): Promise<{ name?: string; sizeText?: string; isVariable?: boolean; wghtRange?: string }> {
  // dev 假数据: 模拟各槽位字体的名称/大小/可变标识
  if (import.meta.env.DEV) {
    const MOCK_FONT_INFO: Record<
      string,
      { name: string; size: string; variable: boolean; wght?: string }
    > = {
      'hans.ttf': { name: 'HarmonyOS Sans SC', size: '13.5 MB', variable: true, wght: '100-900' },
      'hant.ttf': { name: '源樣明體', size: '21.2 MB', variable: false },
      'en.ttf': { name: 'Inter Variable', size: '0.8 MB', variable: true, wght: '100-900' },
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
    const sizeText = `${(buf.byteLength / 1024 / 1024).toFixed(1)} MB`;
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

// 选择新字体后: 复制到 fonts-test 供解析, 更新卡片显示的名称/大小
async function refreshSlotInfo(slot: FontSlot) {
  if (!slot.path) return;
  try {
    await exec(`cp -f ${shellQuote(slot.path)} ${shellQuote(`${TEST_FONT_DIR}/${slot.key}.ttf`)}`);
    const info = await readFontInfo(`${slot.key}.ttf`);
    if (info.name) slot.fileName = info.name;
    if (info.sizeText) slot.sizeText = info.sizeText;
    // 无条件同步: 防止换字体后旧的可变标记残留
    slot.isVariable = Boolean(info.isVariable);
    slot.wghtRange = info.wghtRange;
    renderSlots();
  } catch {
    // 忽略解析失败, 保持选择器返回的文件名
  }
}

// 打开 WebUI 时: 复制 FONT/ 到 fonts-test, 读取已有字体的名称/大小填充卡片
async function loadExistingFonts() {
  const available = await ensureFontsCopy();
  for (const key of ['hans', 'hant', 'en', 'mono', 'emoji'] as const) {
    const file = `${key}.ttf`;
    if (!available.includes(file)) continue;
    const slot = slots[key];
    const info = await readFontInfo(file);
    slot.path = `${FONTS_DIR}/${file}`;
    slot.fileName = info.name ?? file;
    if (info.sizeText) slot.sizeText = info.sizeText;
    slot.isVariable = Boolean(info.isVariable);
    slot.wghtRange = info.wghtRange;
  }
  renderSlots();
}

// 未选择时的占位文案: 回退可视化 (WYSIWYG)
function slotPlaceholder(slot: FontSlot): string {
  if (slot.path) return slot.fileName;
  if (slot.key === 'hans') return '未选择字体文件';
  if (slots.hans.path) {
    if (slot.key === 'mono') return '未选择，保持系统等宽字体';
    if (slot.key === 'emoji') return '未选择，保持系统 Emoji';
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
      const nameText = required ? '未选择字体，此项为必选项' : slotPlaceholder(slot);
      // 扩展名大写 (TTF/OTF...), 从源文件路径动态提取, 不硬编码
      const ext = slot.path ? (slot.path.split('.').pop() ?? '').toUpperCase() : '';
      return `
    <md-filled-card class="slot-card ${slot.key === 'hans' ? 'slot-hans' : ''} ${slot.path ? 'selected' : ''}" data-key="${slot.key}">
      <div class="slot-header">
        <div class="slot-title-group">
          <span class="slot-title">${slot.title}</span>
        </div>
        <md-icon class="slot-arrow">chevron_right</md-icon>
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
          ${
            slot.path
              ? `<div class="slot-meta"><span class="slot-meta-badge">${slot.sizeText || '…'}</span>${ext ? `<span class="slot-meta-badge">${ext}</span>` : ''}${slot.isVariable ? `<span class="slot-meta-badge slot-meta-badge--variable">可变字体${slot.wghtRange ? ` ${slot.wghtRange}` : ''}</span>` : ''}</div>`
              : ''
          }
        </div>
      </div>
    </md-filled-card>
  `;
    })
    .join('');

  // 绑定事件: 整卡点击选择字体
  slotsEl.querySelectorAll<HTMLElement>('.slot-card').forEach((card) => {
    card.addEventListener('click', () => {
      pickingKey = card.dataset.key as keyof typeof slots;
      picker.show();
    });
  });
  slotsEl.querySelectorAll<HTMLElement>('.slot-clear').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // 阻止冒泡触发卡片选择
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
  updateWghtModeDisabled();
}

async function copyFont(src: string, dest: string) {
  const { errno, stderr } = await exec(`cp -f ${shellQuote(src)} ${shellQuote(dest)}`);
  if (errno !== 0) throw new Error(`复制失败: ${stderr}`);
}

// 选择用于覆写的 wght 范围: 从 hans/hant/en 收集 (emoji/mono 除外), 取跨度最小者; 无可变返回 null
function pickWghtRange(): { min: number; max: number } | null {
  let best: { min: number; max: number } | null = null;
  let bestSpan = Infinity;
  for (const key of ['hans', 'hant', 'en'] as const) {
    const r = slots[key]?.wghtRange;
    if (!r) continue;
    const m = r.match(/^(\d+)-(\d+)$/);
    if (!m) continue;
    const min = Number(m[1]);
    const max = Number(m[2]);
    const span = max - min;
    if (span < bestSpan) {
      bestSpan = span;
      best = { min, max };
    }
  }
  return best;
}

// 读取字重覆写模式 (FONTS/wght-mode.txt), 默认 0 不处理
async function readWghtMode(): Promise<0 | 1 | 2> {
  try {
    const { errno, stdout } = await exec(`cat '${FONTS_DIR}/wght-mode.txt' 2>/dev/null || true`);
    if (errno === 0) {
      const n = Number(stdout.trim());
      if (n === 1 || n === 2) return n as 0 | 1 | 2;
    }
  } catch {
    // 忽略
  }
  return 0;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += btoa(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
  }
  return s;
}

// 覆写模块 fonts.xml 的 sans-serif family 段: cp -> fetch -> 字符串替换 -> base64 分块写回
async function applyWghtOverride(mode: 1 | 2, min: number, max: number): Promise<void> {
  const modXml = '/data/adb/modules/FontMM/system/etc/fonts.xml';
  const tmp = `${WEBROOT_DIR}/work/fonts.new.xml`;
  try {
    await exec(
      `mkdir -p '${WEBROOT_DIR}/work' && cp -f '${modXml}' '${WEBROOT_DIR}/work/fonts.xml'`,
    );
    const res = await fetch('work/fonts.xml');
    if (!res.ok) throw new Error(`读取 fonts.xml 失败 (${res.status})`);
    const xml = await res.text();
    const replaced = applyWghtMode(xml, mode, min, max);
    if (replaced === xml) return; // 无变化 (mode 0 或无 sans-serif family)
    const b64 = bytesToBase64(new TextEncoder().encode(replaced));
    await exec(`rm -f '${tmp}'`);
    const CHUNK = 30000;
    for (let i = 0; i < b64.length; i += CHUNK) {
      const part = b64.slice(i, i + CHUNK);
      await exec(`echo '${part}' | base64 -d >> '${tmp}'`);
    }
    await exec(`cp -f '${tmp}' '${modXml}'`);
  } catch (e) {
    // 覆写失败不阻断应用主流程
    console.warn('字重范围覆写失败:', e);
  }
}

async function apply() {
  if (!slots.hans.path) return;
  applying = true;
  renderSlots();
  try {
    // 字重范围覆写: 用 UI 当前模式 (持久化到 FONTS/wght-mode.txt), 仅当存在可变字体且模式非 0 时处理
    const wghtMode = (Number(wghtModeSelect?.value ?? 0) || 0) as 0 | 1 | 2;
    await writeWghtMode(wghtMode);
    const wghtPick = pickWghtRange();
    if (wghtMode !== 0 && wghtPick) {
      await applyWghtOverride(wghtMode, wghtPick.min, wghtPick.max);
    }

    // 启动加载的字体 path 即 FONT/ 内的文件, 无需再复制
    if (slots.hans.path !== `${FONTS_DIR}/hans.ttf`) {
      await copyFont(slots.hans.path, `${FONTS_DIR}/hans.ttf`);
    }

    if (slots.hant.path) {
      if (slots.hant.path !== `${FONTS_DIR}/hant.ttf`) {
        await copyFont(slots.hant.path, `${FONTS_DIR}/hant.ttf`);
      }
    } else {
      await exec(`rm -f ${shellQuote(`${FONTS_DIR}/hant.ttf`)}`);
    }

    if (slots.en.path) {
      if (slots.en.path !== `${FONTS_DIR}/en.ttf`) {
        await copyFont(slots.en.path, `${FONTS_DIR}/en.ttf`);
      }
    } else {
      await exec(`rm -f ${shellQuote(`${FONTS_DIR}/en.ttf`)}`);
    }

    if (slots.mono.path) {
      if (slots.mono.path !== `${FONTS_DIR}/mono.ttf`) {
        await copyFont(slots.mono.path, `${FONTS_DIR}/mono.ttf`);
      }
    } else {
      await exec(`rm -f ${shellQuote(`${FONTS_DIR}/mono.ttf`)}`);
    }

    if (slots.emoji.path) {
      if (slots.emoji.path !== `${FONTS_DIR}/emoji.ttf`) {
        await copyFont(slots.emoji.path, `${FONTS_DIR}/emoji.ttf`);
      }
    } else {
      await exec(`rm -f ${shellQuote(`${FONTS_DIR}/emoji.ttf`)}`);
    }

    const { errno, stdout, stderr } = await exec('sh /data/adb/modules/FontMM/apply.sh');
    if (errno !== 0) throw new Error(stderr || 'apply.sh 执行失败');

    if (logContent && logDialog) {
      logContent.textContent = stdout;
      logDialog.open = true;
    }
    toast('字体已应用，重启后生效');
    // 字体已变化: 下次进入测试页时重新加载
    testLoaded = false;
  } catch (e) {
    toast(`应用失败: ${String(e)}`);
  } finally {
    applying = false;
    renderSlots();
  }
}

applyBtn?.addEventListener('click', apply);
renderSlots();

// ---------------- 字重覆写模式选择 ----------------

// 写入模式到 FONTS/wght-mode.txt
async function writeWghtMode(mode: 0 | 1 | 2): Promise<void> {
  try {
    await exec(`echo '${mode}' > '${FONTS_DIR}/wght-mode.txt'`);
  } catch {
    // 忽略写入失败
  }
}

// 回填模式选择
async function initWghtModeUI(): Promise<void> {
  const mode = await readWghtMode();
  if (wghtModeSelect) wghtModeSelect.value = String(mode);
  updateWghtModeDisabled();
}

// 根据是否有可变字体决定是否禁用 (emoji/mono 不计入)
function updateWghtModeDisabled(): void {
  const hasVar = ['hans', 'hant', 'en'].some((k) => slots[k as 'hans']?.isVariable);
  if (wghtModeSelect) wghtModeSelect.disabled = !hasVar;
  if (wghtModeSub) {
    wghtModeSub.textContent = hasVar
      ? '可变字体 wght 范围与实际字重等级不符时, 按所选方式覆写 sans-serif 配置'
      : '当前未选择可变字体 (中文/繁体/英文), 此功能不可用';
  }
}

wghtModeSelect?.addEventListener('change', () => {
  const v = Number(wghtModeSelect.value);
  if (v === 0 || v === 1 || v === 2) void writeWghtMode(v as 0 | 1 | 2);
});
void initWghtModeUI();

// ---------------- 导航与视图切换 ----------------
const homeView = document.getElementById('home-view')!;
const configView = document.getElementById('config-view')!;
const testView = document.getElementById('test-view')!;
const toolsView = document.getElementById('tools-view')!;

const views = [homeView, configView, testView, toolsView];
const navBar = document.getElementById('nav-bar') as any;
// 悬浮应用按钮 (与配置页绑定, 仅配置页显示)
const applyFab = document.getElementById('apply-btn') as HTMLElement;
// 重启按钮 (仅主页显示, 其他页隐藏)
const rebootBtn = document.getElementById('reboot-btn');
// 滑动视图轨道
const viewTrack = document.getElementById('view-track')!;
let currentIndex = 0;

// 顶栏滚动标题: 各页标题元素与相对偏移 (标题中心移出视口顶部时固定在顶栏)
const topBarTitle = document.getElementById('top-bar-title')!;
const pageTitleEls = Array.from(document.querySelectorAll<HTMLElement>('.home-title'));
const titleOffsets = views.map((view, i) => {
  const el = pageTitleEls[i];
  if (!el) return 0;
  return el.getBoundingClientRect().top - view.getBoundingClientRect().top + view.scrollTop;
});

// 视口 pager: 轨道高度 = 视口 - 顶栏 (显式计算, 避免依赖 vh/dvh/flex 解析)
function updateTrackHeight() {
  const topBar = document.querySelector<HTMLElement>('.top-app-bar');
  const h = window.innerHeight - (topBar?.offsetHeight ?? 64);
  viewTrack.style.height = `${Math.max(0, h)}px`;
}
updateTrackHeight();
window.addEventListener('resize', updateTrackHeight);
window.addEventListener('orientationchange', () => setTimeout(updateTrackHeight, 100));

function showView(index: number) {
  const target = Math.max(0, Math.min(views.length - 1, index));
  currentIndex = target;
  views.forEach((v, i) => v.classList.toggle('active', i === target));
  // 轨道滑动切换动画
  viewTrack.style.transform = `translateX(${-target * 100}%)`;
  // 悬浮应用按钮仅配置页显示, 且未选简体字体时不展示
  applyFab.style.display = target === 1 && slots.hans.path ? '' : 'none';
  // 重启按钮仅主页显示 (visibility 保持顶栏布局不跳动)
  if (rebootBtn) rebootBtn.style.visibility = target === 0 ? 'visible' : 'hidden';
  // 同步底部导航高亮
  if (navBar) navBar.activeIndex = target;
  // 每页独立滚动, 切换后回到该页顶部
  views[target].scrollTop = 0;
  // 顶栏标题: 切换页时更新文字, 并回到未滚动状态 (标题在内容区显示)
  topBarTitle.textContent = pageTitleEls[target]?.textContent ?? '';
  document.body.classList.remove('title-scrolled');
  if (target === 0) loadHome();
  if (target === 2) loadTestFonts();
}

// 悬浮按钮滚动隐藏: 向下滚动移出视口, 向上滚动出现 (每页独立滚动)
views.forEach((view, i) => {
  let lastY = 0;
  view.addEventListener(
    'scroll',
    () => {
      const y = view.scrollTop;
      if (y > lastY + 4) applyFab.classList.add('fab-hidden');
      else if (y < lastY - 4) applyFab.classList.remove('fab-hidden');
      lastY = y;
      // 顶栏标题: 当前页标题中心移出视口顶部时固定在顶栏
      if (view === views[currentIndex] && pageTitleEls[i]) {
        const titleCenter = titleOffsets[i] + pageTitleEls[i].offsetHeight / 2;
        document.body.classList.toggle('title-scrolled', y > titleCenter);
      }
    },
    { passive: true },
  );
});

navBar?.addEventListener('navigation-bar-activated', (e: { detail: { activeIndex: number } }) => {
  showView(e.detail.activeIndex);
});

// 初始加载主页
void loadHome();

// ---------------- 主页交互 ----------------
let donateOpen = false;
const donateExpand = document.getElementById('donate-expand')!;
const donateArrow = document.getElementById('donate-arrow')!;

document.getElementById('donate-entry')?.addEventListener('click', () => {
  donateOpen = !donateOpen;
  donateExpand.hidden = !donateOpen;
  donateArrow.classList.toggle('expanded', donateOpen);
});

// 支付宝捐献: 必须在 WebUI 外打开 (am start), 否则 alipays 协议无法唤起
void document.getElementById('donate-alipay')?.addEventListener('click', () => {
  void amStart(DONATE_ALIPAY_URI, ALIPAY_PKG);
});

// 开发者主页: 用系统默认浏览器打开 (am start, 避免在 WebView 内打开)
void document.getElementById('dev-entry')?.addEventListener('click', () => {
  void amStart(DEV_PROFILE_URL);
});

// ---------------- 工具 ----------------
const toolHost = new ToolHost();
toolHost.register(MiFontToolDef);
toolHost.register(FontEditorToolDef);

// ---------------- 测试文本编辑 ----------------
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
    editInput.value = target.textContent ?? '';
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

// ---------------- 重启设备 (二次确认) ----------------
const rebootDialog = document.getElementById('reboot-dialog') as any;
document.getElementById('reboot-btn')?.addEventListener('click', () => {
  if (rebootDialog) rebootDialog.open = true;
});
document.getElementById('reboot-cancel')?.addEventListener('click', () => {
  if (rebootDialog) rebootDialog.open = false;
});
document.getElementById('reboot-confirm')?.addEventListener('click', () => {
  if (rebootDialog) rebootDialog.open = false;
  // dev 模式由 mockExec 模拟输出; 真机立即重启
  void exec('sync; reboot');
});

// ---------------- 主页 ----------------
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

// ---------------- 主页 ----------------
// 捐献 (支付宝) 与开发者主页 (浏览器) 链接
const DONATE_ALIPAY_URI =
  'alipays://platformapi/startapp?saId=10000007&qrcode=https://qr.alipay.com/2m615805eflrafv8ipc2p15';
const ALIPAY_PKG = 'com.eg.android.AlipayGphone';
const DEV_PROFILE_URL = 'https://github.com/YuleBest';

// 渲染主页: 模块状态 + 设备信息
async function loadHome(): Promise<void> {
  // 模块信息 (module.prop)
  let prop: ModuleProp = {};
  try {
    prop = { ...prop, ...parseProp(moduleInfo()) };
  } catch {
    // dev 或 API 不可用时忽略, 走下方兜底
  }
  try {
    const { errno, stdout } = await exec('cat /data/adb/modules/FontMM/module.prop');
    if (errno === 0) prop = { ...prop, ...parseProp(stdout) };
  } catch {
    // 忽略读取失败
  }

  // 挂载状态与设备信息
  const sys = await getSystemInfo();
  const mounted = sys.fontCount > 0;

  const set = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  set('home-status', mounted ? '已挂载字体' : '未挂载字体');
  set('home-version', prop.version || '未知');
  set('home-android-version', sys.androidVersion || '未知');
  set('home-device-model', sys.deviceModel || '未知');
  set('home-abi', sys.abi || '未知');
  set('home-font-count', `${sys.fontCount} 个`);

  // 元模块: /data/adb/metamodule 是符号链接, cat 可直接读取其 module.prop 的 name
  try {
    const { errno, stdout } = await exec('cat /data/adb/metamodule/module.prop');
    if (errno === 0 && stdout.trim()) {
      set('home-metamodule', parseProp(stdout).name || '未知');
    } else {
      set('home-metamodule', '未安装');
    }
  } catch {
    set('home-metamodule', '未安装');
  }
}

// ---------------- 字体测试页 ----------------
const WEBROOT_DIR = '/data/adb/modules/FontMM/webroot';
const TEST_FONT_DIR = `${WEBROOT_DIR}/fonts-test`;

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

// 测试页字体只加载一次 (进入时), 应用新字体后重置, 避免每次进入重复加载
let testLoaded = false;

async function loadTestFonts(): Promise<void> {
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
  const varSlot = slots.hans.isVariable ? slots.hans : null;
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
