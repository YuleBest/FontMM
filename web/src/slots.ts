import { fontPicker } from './fontPicker';
import { exec, shellQuote } from './ksu';
import { readFontInfo } from './fontInfo';
import { ensureFontsCopy, getEnSubsetSizeText } from './fontFiles';
import { FONTS_DIR, TEST_FONT_DIR } from './constants';
import { applyBtn } from './dom';
import type { FontSlot } from './types';

export const SLOT_KEYS = ['hans', 'hant', 'en', 'mono', 'emoji'] as const;
export type SlotKey = (typeof SLOT_KEYS)[number];

export const slots: Record<SlotKey, FontSlot> = {
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

let pickingKey: SlotKey = 'hans';

// 应用流程进行中: renderSlots 据此禁用/启用应用按钮
export let applying = false;
export function setApplying(v: boolean): void {
  applying = v;
}

function pickFontFor(key: SlotKey): void {
  pickingKey = key;
  fontPicker.show('/storage/emulated/0', (path, name) => {
    const slot = slots[pickingKey];
    slot.path = path;
    slot.fileName = name;
    renderSlots();
    void refreshSlotInfo(slot);
  });
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

// 根据是否有可变字体决定是否禁用字重覆写 (emoji/mono 不计入)
export function updateWghtModeDisabled(): void {
  const hasVar = ['hans', 'hant', 'en'].some((k) => slots[k as 'hans']?.isVariable);
  if (wghtModeSelect) wghtModeSelect.disabled = !hasVar;
  if (wghtModeSub) {
    wghtModeSub.textContent = hasVar
      ? '可变字体 wght 范围与实际字重等级不符时, 按所选方式覆写 sans-serif 配置'
      : '当前未选择可变字体 (中文/繁体/英文), 此功能不可用';
  }
}

export function renderSlots() {
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
      // 英文字体被裁成拉丁子集后, 卡片上同时给出「原大小 → 子集大小」与徽标,
      // 否则用户看到原字体大小, 会以为裁切没生效 (issue #14)
      const sizeText = slot.subsetSizeText
        ? `${slot.sizeText || '…'} → ${slot.subsetSizeText}`
        : slot.sizeText || '…';
      const subsetBadge = slot.subsetSizeText
        ? `<span class="slot-meta-badge slot-meta-badge--subset" title="英文字体自带中文字形, 安装时已裁切为纯拉丁子集; 装入系统的是这个子集">已子集化</span>`
        : '';
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
              ? `<div class="slot-meta"><span class="slot-meta-badge">${sizeText}</span>${ext ? `<span class="slot-meta-badge">${ext}</span>` : ''}${subsetBadge}${slot.isVariable ? `<span class="slot-meta-badge slot-meta-badge--variable">可变字体${slot.wghtRange ? ` ${slot.wghtRange}` : ''}</span>` : ''}</div>`
              : ''
          }
        </div>
      </div>
    </md-filled-card>
  `;
    })
    .join('');

  // 绑定事件: 整卡点击选择字体 (回调按点击的槽位处理)
  slotsEl.querySelectorAll<HTMLElement>('.slot-card').forEach((card) => {
    card.addEventListener('click', () => {
      pickFontFor(card.dataset.key as SlotKey);
    });
  });
  slotsEl.querySelectorAll<HTMLElement>('.slot-clear').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // 阻止冒泡触发卡片选择
      const slot = slots[btn.dataset.key as SlotKey];
      slot.path = null;
      slot.fileName = '';
      // 解析结果一并清掉: 否则字重映射的轴范围 (取各槽位最小跨度) 与可变字体标记
      // 会停留在被删掉的字体上 —— 删掉 200-900 的字体后仍只能选 200-900
      slot.sizeText = undefined;
      slot.isVariable = false;
      slot.wghtRange = undefined;
      slot.subsetSizeText = undefined;
      renderSlots();
    });
  });

  if (applyBtn) {
    // 未选择简体字体时直接隐藏按钮 (不做半透明禁用); 应用过程中禁用
    applyBtn.style.display = !slots.hans.path ? 'none' : '';
    applyBtn.disabled = applying;
  }
  updateWghtModeDisabled();
  // 通知其他模块 (如字重映射预览) 槽位已变化
  document.dispatchEvent(new CustomEvent('slots-rendered'));
}

export async function copyFont(src: string, dest: string) {
  const { errno, stderr } = await exec(`cp -f ${shellQuote(src)} ${shellQuote(dest)}`);
  if (errno !== 0) throw new Error(`复制失败: ${stderr}`);
}

// 选择用于覆写的 wght 范围: 从 hans/hant/en 收集 (emoji/mono 除外), 取跨度最小者; 无可变返回 null
export function pickWghtRange(): { min: number; max: number } | null {
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

// 选择新字体后: 复制到 fonts-test 供解析, 更新卡片显示的名称/大小
async function refreshSlotInfo(slot: FontSlot) {
  if (!slot.path) return;
  // 换了英文字体: 旧的子集标记描述的是「上次应用」的状态, 先撤下, 应用后再刷新
  if (slot.key === 'en') slot.subsetSizeText = undefined;
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

// 刷新英文槽位的子集信息 (打开 WebUI 时, 以及每次应用后)。不负责重绘。
export async function refreshEnSubset(): Promise<void> {
  slots.en.subsetSizeText = (await getEnSubsetSizeText()) ?? undefined;
}

// 打开 WebUI 时: 复制 FONT/ 到 fonts-test, 读取已有字体的名称/大小填充卡片
async function loadExistingFonts() {
  const available = await ensureFontsCopy();
  for (const key of SLOT_KEYS) {
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
  await refreshEnSubset();
  renderSlots();
}

renderSlots();
void loadExistingFonts();
