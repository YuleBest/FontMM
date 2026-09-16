import '@material/web/button/filled-button.js';
import { exec, shellQuote } from './ksu';
import { fontPicker } from './fontPicker';
import { renderPreview, type PreviewData } from './previewRenderer';

// ---------------- 工具框架 ----------------
// 每个工具是一个独立页面: 注册 ToolDef 后自动出现在工具列表, 点击进入其页面。
// 便于大量扩展 (后续可能支持创意工坊: 工具定义可来自远端, 动态注册)。

export interface ToolDef {
  /** 唯一 id, 同时用于工具页 DOM 前缀 */
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  version?: string;
  /** 工具页 HTML 模板 (含返回栏; 返回按钮用 class="tool-page-back") */
  template: () => string;
  /** 页面挂载后初始化 (绑定事件等), page 为模板渲染出的元素 */
  mount: (page: HTMLElement) => void;
  /** 页面卸载前清理 (可选) */
  unmount?: (page: HTMLElement) => void;
}

export class ToolHost {
  private tools: ToolDef[] = [];
  private gridEl!: HTMLElement;
  private listEl!: HTMLElement;
  private pagesEl!: HTMLElement;
  private active: ToolDef | null = null;
  private mountedPage: HTMLElement | null = null;

  constructor() {
    this.listEl = document.getElementById('tools-list')!;
    this.pagesEl = document.getElementById('tools-pages')!;
    this.gridEl = this.listEl.querySelector('#tools-grid') as HTMLElement;
  }

  /** 注册工具: 渲染列表卡片 */
  register(tool: ToolDef): void {
    this.tools.push(tool);
    const card = document.createElement('md-elevated-card');
    card.className = 'home-card tool-card home-entry-card';
    card.innerHTML = `
      <div class="home-entry-row">
        <div class="home-entry-icon">
          <md-icon>${tool.icon}</md-icon>
        </div>
        <div class="home-entry-text">
          <div class="home-entry-title"></div>
          <div class="home-entry-sub"></div>
        </div>
        <md-icon class="home-entry-arrow">chevron_right</md-icon>
      </div>
    `;
    card.querySelector('.home-entry-title')!.textContent = tool.title;
    card.querySelector('.home-entry-sub')!.textContent =
      (tool.version ? `v${tool.version} · ` : '') + tool.subtitle;
    card.addEventListener('click', () => this.open(tool.id));
    this.gridEl.appendChild(card);
  }

  /** 打开工具: 隐藏列表, 挂载工具页面 */
  open(id: string): void {
    const tool = this.tools.find((t) => t.id === id);
    if (!tool || this.active) return;
    this.active = tool;
    this.listEl.hidden = true;

    const page = document.createElement('div');
    page.className = 'tool-page';
    page.innerHTML = tool.template();
    this.pagesEl.appendChild(page);
    this.mountedPage = page;

    page.querySelector('.tool-page-back')?.addEventListener('click', () => this.back());
    tool.mount(page);
    this.scrollViewTop();
  }

  /** 返回工具列表 */
  back(): void {
    if (!this.active) return;
    this.active.unmount?.(this.mountedPage!);
    this.active = null;
    this.mountedPage = null;
    this.pagesEl.textContent = '';
    this.listEl.hidden = false;
    this.scrollViewTop();
  }

  private scrollViewTop(): void {
    const view = this.listEl.closest('.view') as HTMLElement | null;
    if (view) view.scrollTop = 0;
  }
}

// ---------------- 工具: 下载国际版小米主题字体 ----------------
// 跨域请求与下载/解压全部由 root shell 完成: 前端调用模块内置脚本
// mi-font-download.sh, 脚本输出完整日志, 前端只负责展示。

const SEARCH_API = 'https://thm.market.intl.xiaomi.com/thm/search/npage?category=Font&keywords=';
// 搜索结果的图片路径前缀 (pic 字段为相对路径, 拼接此域名 + 处理参数)
// 格式: thumbnail/{format}/{尺寸参数}/{pic}, 如 thumbnail/webp/w120q70/ThemeMarket/xxx
const PIC_BASE = 'https://t17.market.mi-img.com/thumbnail/webp/w120q70/';

/** 搜索结果条目 (来自 apiData.cards[].items[].schema.clicks[]) */
interface MiFontItem {
  title: string;
  /** 主题 ID, 详情 API 用它换取下载地址 */
  link: string;
  /** 相对图片路径 */
  pic: string;
}

/**
 * 解析搜索响应。
 * 真实结构: apiData.cards[].items[].schema.clicks[] —— 字段 title/link/pic;
 * 找不到结果时返回 noResultMessage 类型的 item (clicks 为空)。
 */
function parseSearchResponse(data: any): MiFontItem[] {
  const cards: any[] = data?.apiData?.cards ?? [];
  const items: MiFontItem[] = [];
  for (const card of cards) {
    for (const item of card?.items ?? []) {
      for (const click of item?.schema?.clicks ?? []) {
        const title = String(click?.title ?? '').trim();
        const link = String(click?.link ?? '').trim();
        if (!title || !link) continue;
        items.push({ title, link, pic: String(click?.pic ?? '') });
      }
    }
  }
  return items;
}

export const MiFontToolDef: ToolDef = {
  id: 'mi-font',
  title: '下载国际版小米主题字体',
  subtitle: '搜索并下载国际版主题商店的字体',
  icon: 'download',
  version: '1.0.0',
  template: () => `
    <div class="view-topbar">
      <md-icon-button class="tool-page-back" aria-label="返回">
        <md-icon>arrow_back</md-icon>
      </md-icon-button>
      <span class="view-topbar-title">下载国际版小米主题字体</span>
    </div>
    <div class="mi-search-row">
      <md-outlined-text-field
        id="mi-keyword"
        label="字体关键词"
        style="flex: 1"
      ></md-outlined-text-field>
      <md-filled-button id="mi-search-btn">搜索</md-filled-button>
    </div>
    <div id="mi-result" class="mi-result"></div>
    <div id="mi-log" class="mi-log" hidden></div>
  `,
  mount(page) {
    let pageNo = 0;
    let searchLock = false;
    let downloading = false;

    const resultEl = page.querySelector('#mi-result') as HTMLElement;
    const keywordEl = page.querySelector('#mi-keyword') as HTMLInputElement;
    const searchBtn = page.querySelector('#mi-search-btn') as any;
    const logEl = page.querySelector('#mi-log') as HTMLElement;

    const escapeHtml = (s: string): string =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const renderItems = (items: MiFontItem[]): void => {
      resultEl.textContent = '';
      for (const it of items) {
        const card = document.createElement('div');
        card.className = 'mi-item';
        const pic = it.pic ? `${PIC_BASE}${it.pic}` : '';
        card.innerHTML = `
          <div class="mi-item-info">
            <div class="mi-item-title"></div>
          </div>
          ${pic ? `<img class="mi-item-pic" src="${escapeHtml(pic)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
          <md-icon-button class="mi-item-dl" aria-label="下载">
            <md-icon>download</md-icon>
          </md-icon-button>
        `;
        card.querySelector('.mi-item-title')!.textContent = it.title;
        // 下载所需的主题 ID 存在按钮上, 供点击时读取 (之前未写入导致下载始终失败)
        const dlBtn = card.querySelector('.mi-item-dl') as HTMLElement;
        dlBtn.dataset.link = it.link;
        dlBtn.dataset.title = it.title;
        resultEl.appendChild(card);
      }
    };

    // 分页: 接口每页固定返回 12 条并以 hasMore 标识是否还有下一页。
    // 之前按「返回条数 >= 20 才算有下一页」估算总数, 与真实分页规则不符,
    // 会导致第一页就显示 100 页。改为记录 hasMore, 只区分「有/无下一页」。
    let hasMore = false;

    const renderPager = (): void => {
      const nav = document.createElement('div');
      nav.className = 'mi-pager';
      nav.innerHTML = `
        <md-text-button id="mi-prev" ${pageNo === 0 ? 'disabled' : ''}>上一页</md-text-button>
        <span class="mi-page">第 ${pageNo + 1} 页</span>
        <md-text-button id="mi-next" ${hasMore ? '' : 'disabled'}>下一页</md-text-button>
      `;
      resultEl.appendChild(nav);
      nav.querySelector('#mi-prev')?.addEventListener('click', () => {
        if (pageNo > 0) {
          pageNo--;
          void search(pageNo);
        }
      });
      nav.querySelector('#mi-next')?.addEventListener('click', () => {
        if (hasMore) {
          pageNo++;
          void search(pageNo);
        }
      });
    };

    // 搜索 API (跨域走 root shell curl)
    const search = async (page: number): Promise<void> => {
      if (searchLock) return;
      searchLock = true;
      searchBtn.disabled = true;
      resultEl.textContent = '搜索中...';
      try {
        const url = `${SEARCH_API}${encodeURIComponent(keywordEl.value.trim() || '字体')}&page=${page}`;
        const { errno, stdout } = await exec(`curl -s ${shellQuote(url)}`);
        if (errno !== 0) throw new Error('curl 执行失败');
        const data = JSON.parse(stdout);
        const items = parseSearchResponse(data);
        if (items.length === 0) {
          resultEl.textContent = '未找到相关字体, 换个关键词试试';
          return;
        }
        hasMore = Boolean(data?.apiData?.hasMore);
        renderItems(items);
        renderPager();
      } catch (e) {
        resultEl.textContent = `搜索失败: ${(e as Error).message}`;
      } finally {
        searchLock = false;
        searchBtn.disabled = false;
      }
    };

    // 下载 + 解压: 后台运行模块脚本, 日志写入文件, 前端轮询展示
    const pollLog = async (logFile: string): Promise<void> => {
      const deadline = Date.now() + 5 * 60 * 1000;
      let seen = 0;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1000));
        const { stdout } = await exec(`cat ${shellQuote(logFile)} 2>/dev/null || true`);
        if (stdout.length > seen) {
          logEl.textContent += stdout.slice(seen);
          seen = stdout.length;
        }
        if (stdout.includes('__DONE__')) return;
      }
      logEl.textContent += '\n[超时] 下载超时 (5 分钟), 请检查网络后重试';
    };

    const startDownload = async (itemEl: HTMLElement): Promise<void> => {
      if (downloading) return;
      // link/title 由 renderItems 写在按钮的 data-* 上
      const title = itemEl.dataset.title ?? '';
      const link = itemEl.dataset.link ?? '';
      if (!link) {
        logEl.hidden = false;
        logEl.textContent = '下载失败: 缺少主题 ID, 请重新搜索后再试';
        return;
      }
      downloading = true;
      try {
        const logFile = '/data/adb/modules/FontMM/webroot/mi-download.log';
        const script = '/data/adb/modules/FontMM/webroot/mi-font-download.sh';
        const encodedTitle = encodeURIComponent(title);
        await exec(
          `rm -f ${shellQuote(logFile)} && nohup sh ${shellQuote(script)} ${shellQuote(title)} ${shellQuote(link)} ${shellQuote(encodedTitle)} > ${shellQuote(logFile)} 2>&1 &`,
        );
        logEl.hidden = false;
        logEl.textContent = '';
        await pollLog(logFile);
      } catch (e) {
        logEl.textContent = `下载失败: ${(e as Error).message}`;
      } finally {
        downloading = false;
      }
    };

    searchBtn?.addEventListener('click', () => {
      pageNo = 0;
      void search(pageNo);
    });
    resultEl.addEventListener('click', (e) => {
      const dl = (e.target as HTMLElement).closest('.mi-item-dl');
      if (dl) void startDownload(dl as HTMLElement);
    });
  },
};

// ---------------- 工具: 字体编辑 (Pyodide + fontTools) ----------------
// 实验性工具: Pyodide 在独立 Worker 线程运行 fontTools 编辑字体
// 功能: 打开 ttf -> 基本信息 -> 字形缩放/偏移/字距/行距 -> 自定义预览 -> 导出新字体

// 模块 webroot 绝对路径 (真机); dev 下仅用于导出临时文件, 由 mock 接管
const WEBROOT_DIR = '/data/adb/modules/FontMM/webroot';

// 默认预览文本 (三体)
const DEFAULT_PREVIEW_TEXT =
  '在雕塑群的边缘，罗辑看到了一块肃穆的方碑，上面刻着一行金色的大字：\n' +
  '给岁月以文明，而不是给文明以岁月。\n' +
  '“大低谷纪念碑。”';

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += btoa(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
  }
  return s;
}

// 可编辑的 name 表字段 (原文标签); 基础字段默认展示, 其余点击「展开更多」后显示
const NAMEFIELDS: { label: string; nameId: number }[] = [
  { label: 'Copyright', nameId: 0 },
  { label: 'Font Family', nameId: 1 },
  { label: 'Font Subfamily', nameId: 2 },
  { label: 'Unique ID', nameId: 3 },
  { label: 'Full Name', nameId: 4 },
  { label: 'Version', nameId: 5 },
  { label: 'PostScript Name', nameId: 6 },
  { label: 'Trademark', nameId: 7 },
  { label: 'Manufacturer', nameId: 8 },
  { label: 'Designer', nameId: 9 },
  { label: 'Description', nameId: 10 },
  { label: 'URL Vendor', nameId: 11 },
  { label: 'URL Designer', nameId: 12 },
  { label: 'License Description', nameId: 13 },
  { label: 'License Info URL', nameId: 14 },
  { label: 'Typographic Family', nameId: 16 },
  { label: 'Typographic Subfamily', nameId: 17 },
];

// 默认展示的基础字段 (Font Family / Font Subfamily / Version)
const BASIC_NAME_IDS = [1, 2, 5];

class FontEditorPage {
  private page!: HTMLElement;
  private statusEl!: HTMLElement;
  private infoCard!: HTMLElement;
  private editPanel!: HTMLElement;
  private previewEl!: HTMLElement;
  private previewCanvas!: HTMLCanvasElement;
  private openBtn!: HTMLButtonElement & { disabled: boolean };
  private exportBtn!: HTMLButtonElement & { disabled: boolean };
  private openProgress!: any;
  private exportProgress!: any;
  private scaleSlider!: any;
  private dxSlider!: any;
  private dySlider!: any;
  private lsSlider!: any;
  private llSlider!: any;

  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

  private pyReady = false;
  private loading = false;

  private originalBytes: Uint8Array | null = null;
  private fileName = '';
  private hasNameChanges = false;
  private previewText = DEFAULT_PREVIEW_TEXT;

  private editTimer: number | null = null;

  mount(page: HTMLElement): void {
    this.page = page;
    this.statusEl = page.querySelector('#ft-status')!;
    this.infoCard = page.querySelector('#ft-info')!;
    this.editPanel = page.querySelector('#ft-edit')!;
    this.previewEl = page.querySelector('#ft-preview')!;
    this.previewCanvas = page.querySelector('#ft-preview-canvas')!;
    this.openBtn = page.querySelector('#ft-open-btn') as any;
    this.exportBtn = page.querySelector('#ft-export-btn') as any;
    this.openProgress = page.querySelector('#ft-open-progress') as any;
    this.exportProgress = page.querySelector('#ft-export-progress') as any;
    this.scaleSlider = page.querySelector('#ft-scale');
    this.dxSlider = page.querySelector('#ft-dx');
    this.dySlider = page.querySelector('#ft-dy');
    this.lsSlider = page.querySelector('#ft-ls');
    this.llSlider = page.querySelector('#ft-ll');

    this.openBtn?.addEventListener('click', () => this.pickFont());
    this.exportBtn?.addEventListener('click', () => void this.exportFont());
    page.querySelector('#ft-names-apply')?.addEventListener('click', () => void this.applyNames());
    page.querySelector('#ft-export-done-close')?.addEventListener('click', () => {
      (page.querySelector('#ft-export-done') as any).open = false;
    });
    // 预览文本自定义: 点击预览区 -> 对话框
    const previewBox = page.querySelector('.ft-preview') as HTMLElement | null;
    const previewInput = page.querySelector('#ft-preview-input') as any;
    const previewDialog = page.querySelector('#ft-preview-dialog') as any;
    previewBox?.addEventListener('click', () => {
      previewInput.value = this.previewText;
      if (previewDialog) previewDialog.open = true;
    });
    page.querySelector('#ft-preview-cancel')?.addEventListener('click', () => {
      if (previewDialog) previewDialog.open = false;
    });
    page.querySelector('#ft-preview-save')?.addEventListener('click', () => {
      if (previewDialog) previewDialog.open = false;
      this.previewText = previewInput.value ?? '';
      void this.applyEdit(); // 重新提取新字符轮廓并渲染
    });
    // 展开/收起更多 name 字段
    const moreBtn = page.querySelector('#ft-names-more') as HTMLElement | null;
    const extraWrap = page.querySelector('#ft-name-fields-extra') as HTMLElement | null;
    const moreLabel = page.querySelector('#ft-names-more-label') as HTMLElement | null;
    const moreIcon = page.querySelector('#ft-names-more-icon') as HTMLElement | null;
    let extraOpen = false;
    moreBtn?.addEventListener('click', () => {
      extraOpen = !extraOpen;
      if (extraWrap) extraWrap.hidden = !extraOpen;
      if (moreLabel) moreLabel.textContent = extraOpen ? '收起' : '展开更多';
      if (moreIcon) moreIcon.textContent = extraOpen ? 'expand_less' : 'expand_more';
    });

    const onEdit = () => {
      this.updateSliderLabels();
      if (this.editTimer !== null) clearTimeout(this.editTimer);
      this.editTimer = window.setTimeout(() => void this.applyEdit(), 300);
    };
    this.scaleSlider?.addEventListener('input', onEdit);
    this.dxSlider?.addEventListener('input', onEdit);
    this.dySlider?.addEventListener('input', onEdit);
    this.lsSlider?.addEventListener('input', onEdit);
    this.llSlider?.addEventListener('input', onEdit);

    void this.ensurePyodide();
  }

  // ---- Worker 通信封装 ----
  private initWorker(): void {
    this.worker = new Worker(new URL('./fontWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent) => {
      const { id, ok, error, ...rest } = e.data;
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      if (ok) p.resolve(rest);
      else p.reject(new Error(error ?? '未知错误'));
    };
    this.worker.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(new Error(e.message || 'Worker 错误'));
      this.pending.clear();
    };
  }

  private call(type: string, payload: any, transfer?: Transferable[]): Promise<any> {
    if (!this.worker) this.initWorker();
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ id, type, payload }, transfer ?? []);
    });
  }

  // 懒加载: Worker 内启动 Pyodide + fontTools (仅一次)
  private async ensurePyodide(): Promise<void> {
    if (this.pyReady || this.loading) return;
    this.loading = true;
    this.statusEl.textContent = '正在加载字体编辑引擎...';
    try {
      // indexURL 用绝对路径 (Worker 内相对路径基于脚本 URL, 会错位)
      const indexURL = new URL('pyodide/', document.baseURI).href;
      await this.call('init', { indexURL });
      this.pyReady = true;
      this.statusEl.textContent = '引擎就绪 (fontTools 4.62.1)';
    } catch (e) {
      this.statusEl.textContent = `引擎加载失败: ${(e as Error).message}`;
    } finally {
      this.loading = false;
    }
  }

  // 打开字体: 真机走文件选择器 (exec 复制到 webroot), dev 直接读内置 demo 字体
  private pickFont(): void {
    if (!this.pyReady) {
      this.statusEl.textContent = '引擎尚未就绪, 请稍候';
      return;
    }
    if (import.meta.env.DEV) {
      void this.loadFont('demo-font.ttf', 'demo-font.ttf');
      return;
    }
    fontPicker.show('/storage/emulated/0/Download', (path, name) => {
      void this.copyAndLoad(path, name);
    });
  }

  private async copyAndLoad(path: string, name: string): Promise<void> {
    this.statusEl.textContent = '正在复制字体到工作目录...';
    this.openProgress.hidden = false;
    try {
      await exec(
        `mkdir -p ${shellQuote(`${WEBROOT_DIR}/work`)} && cp -f ${shellQuote(path)} ${shellQuote(`${WEBROOT_DIR}/work/${name}`)}`,
      );
      await this.loadFont(`work/${encodeURIComponent(name)}`, name);
    } catch (e) {
      this.statusEl.textContent = `复制失败: ${(e as Error).message}`;
    } finally {
      this.openProgress.hidden = true;
    }
  }

  private async loadFont(url: string, name: string): Promise<void> {
    this.fileName = name;
    this.statusEl.textContent = `正在读取 ${name}...`;
    this.openProgress.hidden = false;
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`读取失败 (HTTP ${resp.status})`);
      this.originalBytes = new Uint8Array(await resp.arrayBuffer());

      const info = await this.call('analyze', { data: this.originalBytes });
      if (!info.family) throw new Error('解析失败');

      this.renderNameFields(info.names ?? {});
      this.page.querySelector('#ft-glyphs')!.textContent = String(info.glyphs);
      this.page.querySelector('#ft-units')!.textContent = String(info.units);
      this.page.querySelector('#ft-variable')!.textContent = info.variable
        ? info.wghtRange
          ? `是 (wght ${info.wghtRange})`
          : '是'
        : '否';

      this.page.querySelector('#ft-file-name')!.textContent = name;
      this.infoCard.hidden = false;
      this.editPanel.hidden = false;
      this.statusEl.textContent = '已加载, 可开始编辑';
      void this.applyEdit(); // 首次生成原始预览
    } catch (e) {
      this.statusEl.textContent = `读取失败: ${(e as Error).message}`;
    } finally {
      this.openProgress.hidden = true;
    }
  }

  private updateSliderLabels(): void {
    this.page.querySelector('#ft-scale-val')!.textContent = `${this.scaleSlider?.value ?? 100}%`;
    this.page.querySelector('#ft-dx-val')!.textContent = String(this.dxSlider?.value ?? 0);
    this.page.querySelector('#ft-dy-val')!.textContent = String(this.dySlider?.value ?? 0);
    this.page.querySelector('#ft-ls-val')!.textContent = String(this.lsSlider?.value ?? 0);
    this.page.querySelector('#ft-ll-val')!.textContent = String(this.llSlider?.value ?? 0);
  }

  // 渲染可编辑 name 字段输入框: 基础字段默认展示, 其余收进「展开更多」
  private renderNameFields(names: Record<string, string>): void {
    const wrap = this.page.querySelector('#ft-name-fields') as HTMLElement;
    const extraWrap = this.page.querySelector('#ft-name-fields-extra') as HTMLElement;
    wrap.textContent = '';
    extraWrap.textContent = '';
    for (const f of NAMEFIELDS) {
      const row = document.createElement('div');
      row.className = 'ft-name-field';
      const field = document.createElement('md-outlined-text-field');
      field.id = `ft-name-${f.nameId}`;
      field.label = f.label;
      field.placeholder = '(未设置)';
      field.value = names[String(f.nameId)] ?? '';
      row.appendChild(field);
      if (BASIC_NAME_IDS.includes(f.nameId)) wrap.appendChild(row);
      else extraWrap.appendChild(row);
    }
    // 额外字段默认折叠
    extraWrap.hidden = true;
  }

  // 收集当前所有非空 name 字段
  private collectNames(): Record<string, string> {
    const names: Record<string, string> = {};
    for (const f of NAMEFIELDS) {
      const input = this.page.querySelector(`#ft-name-${f.nameId}`) as HTMLInputElement | null;
      if (input && input.value.trim()) names[String(f.nameId)] = input.value.trim();
    }
    return names;
  }

  // 应用 name 修改: 基于原始字体写入新名称并刷新预览/导出缓存
  private async applyNames(): Promise<void> {
    if (!this.pyReady || !this.originalBytes) return;
    this.statusEl.textContent = '正在应用字体信息修改...';
    try {
      const names = this.collectNames();
      await this.call('updateNames', { data: this.originalBytes, names });
      this.hasNameChanges = true;
      this.statusEl.textContent = '字体信息已更新';
      await this.applyEdit(); // 刷新预览
    } catch (e) {
      this.statusEl.textContent = `应用失败: ${(e as Error).message}`;
    }
  }

  // 执行预览 (Worker 提取轮廓, Canvas 渲染) — 不生成字体文件, 大字体也毫秒级
  private async applyEdit(): Promise<void> {
    if (!this.pyReady || !this.originalBytes) return;
    const scale = Number(this.scaleSlider?.value ?? 100) / 100;
    const dx = Number(this.dxSlider?.value ?? 0);
    const dy = Number(this.dySlider?.value ?? 0);
    const letterSpacing = Number(this.lsSlider?.value ?? 0);
    const lineSpacing = Number(this.llSlider?.value ?? 0);
    this.previewEl.classList.add('ft-preview-busy');
    try {
      const result = await this.call('preview', {
        dataKey: this.fileName || 'font',
        data: this.originalBytes,
        text: this.previewText,
        scale,
        dx,
        dy,
        letterSpacing,
        lineSpacing,
      });
      if (!result.glyphs) throw new Error(result.error ?? '预览失败');
      this.renderCanvas(result);
      this.exportBtn.disabled = false;
    } catch (e) {
      this.previewCanvas.hidden = true;
      this.previewEl.hidden = false;
      this.previewEl.textContent = `编辑失败: ${(e as Error).message}`;
    } finally {
      this.previewEl.classList.remove('ft-preview-busy');
    }
  }

  // Canvas 渲染预览 (主题色填充)
  private renderCanvas(data: PreviewData): void {
    const color =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--md-sys-color-on-surface')
        .trim() || '#1c1b1f';
    renderPreview(this.previewCanvas, data, this.previewText, {
      fontSize: 36,
      color,
    });
    this.previewCanvas.hidden = false;
    this.previewEl.hidden = true;
  }

  // 导出: 字形编辑结果 (若有 name 修改则链式合并) -> base64 分块写盘
  private async exportFont(): Promise<void> {
    if (!this.originalBytes) return;
    this.exportBtn.disabled = true;
    this.statusEl.textContent = '正在全量编辑字形（大字体可能需要 1-3 分钟）...';
    this.exportProgress.value = 0;
    this.exportProgress.hidden = false;
    try {
      // 全量编辑 (非预览模式): 所有字形变换
      const scale = Number(this.scaleSlider?.value ?? 100) / 100;
      const dx = Number(this.dxSlider?.value ?? 0);
      const dy = Number(this.dySlider?.value ?? 0);
      const letterSpacing = Number(this.lsSlider?.value ?? 0);
      const lineSpacing = Number(this.llSlider?.value ?? 0);
      const editResult = await this.call('edit', {
        dataKey: this.fileName || 'font',
        data: this.originalBytes,
        scale,
        dx,
        dy,
        letterSpacing,
        lineSpacing,
        // 不传 previewChars: 全量编辑
      });
      let finalBytes = editResult.data;
      if (this.hasNameChanges) {
        this.statusEl.textContent = '正在写入字体信息...';
        const names = this.collectNames();
        const r = await this.call('updateNames', { data: finalBytes, names });
        finalBytes = r.data;
      }
      this.statusEl.textContent = '正在导出 (分块写入, 请稍候)...';
      const b64 = bytesToBase64(finalBytes);
      const base = this.fileName.replace(/\.[^.]+$/, '') || 'font';
      const outName = `edited-${base}.ttf`;
      const outDir = '/storage/emulated/0/Download/FontMM';
      const tmp = `${WEBROOT_DIR}/work/export.tmp`;

      await exec(`rm -f ${shellQuote(tmp)} && mkdir -p ${shellQuote(outDir)}`);
      // exec 命令长度真机受限 (~32KB), 分块必须远小于该限制 (60000 会截断导出)
      const CHUNK = 8000; // base64 字符, 约 6KB 二进制
      const total = Math.ceil(b64.length / CHUNK);
      for (let i = 0; i < b64.length; i += CHUNK) {
        const part = b64.slice(i, i + CHUNK);
        await exec(`echo ${shellQuote(part)} | base64 -d >> ${shellQuote(tmp)}`);
        this.exportProgress.value = (i / CHUNK + 1) / total;
      }
      await exec(`mv ${shellQuote(tmp)} ${shellQuote(`${outDir}/${outName}`)}`);
      this.statusEl.textContent = `已导出: ${outDir}/${outName}`;
      // 弹窗反馈 (在操作附近, 明确可见)
      this.page.querySelector('#ft-export-path')!.textContent = `${outDir}/${outName}`;
      (this.page.querySelector('#ft-export-done') as any).open = true;
    } catch (e) {
      this.statusEl.textContent = `导出失败: ${(e as Error).message}`;
    } finally {
      this.exportBtn.disabled = false;
      this.exportProgress.hidden = true;
    }
  }
}

const editorPage = new FontEditorPage();

export const FontEditorToolDef: ToolDef = {
  id: 'font-editor',
  title: '字体编辑',
  subtitle: '打开 ttf 字体, 缩放/偏移字形并导出 (实验性)',
  icon: 'edit',
  version: '1.0.0',
  template: () => `
    <div class="view-topbar">
      <md-icon-button class="tool-page-back" aria-label="返回">
        <md-icon>arrow_back</md-icon>
      </md-icon-button>
      <span class="view-topbar-title">字体编辑</span>
    </div>
    <div class="view-topbar-sub">Pyodide + fontTools · 实验性</div>

    <div class="ft-status" id="ft-status">准备中...</div>

    <div class="ft-open-row">
      <md-filled-button id="ft-open-btn">打开字体</md-filled-button>
      <span class="ft-file-name" id="ft-file-name">未选择字体</span>
    </div>
    <md-linear-progress
      id="ft-open-progress"
      indeterminate
      class="ft-progress"
      hidden
      aria-label="正在打开字体"
    ></md-linear-progress>

    <div class="ft-info-card" id="ft-info" hidden>
      <div class="ft-info-title">字体信息</div>
      <div class="ft-info-sub">字段可直接修改, 点击「应用更改」写入字体</div>
      <div id="ft-name-fields"></div>
      <md-text-button id="ft-names-more" class="ft-names-more">
        <span id="ft-names-more-label">展开更多</span>
        <md-icon id="ft-names-more-icon">expand_more</md-icon>
      </md-text-button>
      <div id="ft-name-fields-extra" class="ft-names-extra" hidden></div>
      <div class="ft-info-readonly">
        <div class="ft-info-ro-row"><span>Num Glyphs</span><span id="ft-glyphs">-</span></div>
        <div class="ft-info-ro-row"><span>Units Per Em</span><span id="ft-units">-</span></div>
        <div class="ft-info-ro-row"><span>Variable Font</span><span id="ft-variable">-</span></div>
      </div>
      <md-filled-button id="ft-names-apply" class="ft-apply-btn">应用更改</md-filled-button>
    </div>

    <div class="ft-edit" id="ft-edit" hidden>
      <div class="ft-edit-title">编辑项目</div>

      <div class="ft-control-row">
        <div class="ft-control-label">
          字形缩放 <span class="ft-control-val" id="ft-scale-val">100%</span>
        </div>
        <md-slider id="ft-scale" min="50" max="150" value="100" step="1"></md-slider>
      </div>
      <div class="ft-control-row">
        <div class="ft-control-label">
          水平偏移 <span class="ft-control-val" id="ft-dx-val">0</span>
        </div>
        <md-slider id="ft-dx" min="-200" max="200" value="0" step="1"></md-slider>
      </div>
      <div class="ft-control-row">
        <div class="ft-control-label">
          垂直偏移 <span class="ft-control-val" id="ft-dy-val">0</span>
        </div>
        <md-slider id="ft-dy" min="-200" max="200" value="0" step="1"></md-slider>
      </div>
      <div class="ft-control-row">
        <div class="ft-control-label">
          字间距 <span class="ft-control-val" id="ft-ls-val">0</span>
        </div>
        <md-slider id="ft-ls" min="-100" max="200" value="0" step="1"></md-slider>
      </div>
      <div class="ft-control-row">
        <div class="ft-control-label">
          行间距 <span class="ft-control-val" id="ft-ll-val">0</span>
        </div>
        <md-slider id="ft-ll" min="-50" max="200" value="0" step="1"></md-slider>
      </div>

      <div class="ft-preview">
        <div class="ft-preview-label">
          实时预览（点击可自定义文本）
          <md-icon class="ft-preview-edit">edit</md-icon>
        </div>
        <canvas id="ft-preview-canvas" class="ft-preview-canvas"></canvas>
        <div class="ft-preview-text" id="ft-preview" hidden></div>
      </div>

      <md-filled-button id="ft-export-btn" class="ft-export-btn" disabled>导出字体</md-filled-button>
      <md-linear-progress
        id="ft-export-progress"
        class="ft-progress"
        value="0"
        hidden
        aria-label="正在导出"
      ></md-linear-progress>
    </div>

    <!-- 预览文本编辑对话框 -->
    <md-dialog id="ft-preview-dialog">
      <div slot="headline">自定义预览文本</div>
      <div slot="content">
        <md-outlined-text-field
          id="ft-preview-input"
          type="textarea"
          rows="4"
          label="预览文本"
          style="width: 100%"
        ></md-outlined-text-field>
      </div>
      <div slot="actions">
        <md-text-button id="ft-preview-cancel">取消</md-text-button>
        <md-text-button id="ft-preview-save">保存</md-text-button>
      </div>
    </md-dialog>

    <!-- 导出完成弹窗 -->
    <md-dialog id="ft-export-done">
      <div slot="headline">导出完成</div>
      <div slot="content">
        <div class="ft-export-done-text">字体已导出到:</div>
        <div class="ft-export-done-path" id="ft-export-path"></div>
      </div>
      <div slot="actions">
        <md-text-button id="ft-export-done-close">知道了</md-text-button>
      </div>
    </md-dialog>
  `,
  mount(page) {
    editorPage.mount(page);
  },
};
