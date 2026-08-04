import '@material/web/button/filled-button.js';
import { exec } from './ksu';

// ---------------- 工具: 下载国际版小米主题字体 (v1.0.0) ----------------
// 跨域请求与下载/解压全部由 root shell 完成: 前端调用模块内置脚本
// mi-font-download.sh, 脚本输出完整日志, 前端只负责展示。

const SEARCH_API = 'https://thm.market.intl.xiaomi.com/thm/search/npage?category=Font&keywords=';
// 搜索结果的图片路径前缀 (pic 字段为相对路径, 拼接此域名 + 处理参数)
// 格式: thumbnail/{format}/{尺寸参数}/{pic}, 如 thumbnail/webp/w120q70/ThemeMarket/xxx
const PIC_BASE = 'https://t17.market.mi-img.com/thumbnail/webp/w120q70/';
// 模块内置下载脚本 (真机路径)
const DL_SCRIPT = '/data/adb/modules/FontMM/tools/mi-font-download.sh';

interface MiFontItem {
  title: string;
  id: string;
  pic: string;
}

// HTML 转义, 防止 API 返回的标题注入
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class MiFontTool {
  private page!: HTMLElement;
  private list!: HTMLElement;
  private keywordInput!: HTMLInputElement;
  private resultEl!: HTMLElement;

  private keyword = '';
  private pageNo = 0;
  private items: MiFontItem[] = [];
  private downloading = false;

  constructor() {
    this.initPage();
    this.bindEvents();
  }

  private initPage(): void {
    this.page = document.getElementById('mi-font-page')!;
    this.list = document.getElementById('tools-list')!;
    this.keywordInput = document.getElementById('mi-keyword') as HTMLInputElement;
    this.resultEl = document.getElementById('mi-result')!;
    document.getElementById('mi-font-back')?.addEventListener('click', () => this.back());
  }

  private bindEvents(): void {
    document.getElementById('mi-search-btn')?.addEventListener('click', () => this.startSearch());
    // 回车触发搜索
    this.keywordInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.startSearch();
    });
  }

  /** 从工具列表进入工具详情页 */
  public open(): void {
    this.list.hidden = true;
    this.page.hidden = false;
    // 回到工具页顶部
    this.page.scrollIntoView();
    this.keywordInput?.focus?.();
  }

  /** 返回工具列表 */
  public back(): void {
    this.page.hidden = true;
    this.list.hidden = false;
  }

  private startSearch(): void {
    if (this.downloading) return; // 下载中禁止新搜索
    this.keyword = this.keywordInput.value.trim();
    if (!this.keyword) {
      this.renderError('请输入字体关键词');
      return;
    }
    this.pageNo = 0;
    void this.search(this.pageNo);
  }

  private async search(page: number): Promise<void> {
    this.renderLoading('正在搜索...');
    const url = `${SEARCH_API}${encodeURIComponent(this.keyword)}&page=${page}`;
    try {
      const { errno, stdout } = await exec(`curl -s '${url}'`);
      if (errno !== 0) {
        this.renderError(`搜索请求失败 (errno=${errno})`);
        return;
      }
      const data = JSON.parse(stdout) as any;
      const cards = data?.apiData?.cards ?? [];
      this.items = cards.flatMap((c: any) =>
        (c?.items ?? []).flatMap((it: any) =>
          (it?.schema?.clicks ?? []).map((cl: any) => ({
            title: String(cl?.title ?? '未知字体'),
            id: String(cl?.link ?? ''),
            pic: String(cl?.pic ?? ''),
          })),
        ),
      );
      if (this.items.length === 0) {
        this.renderError('未找到相关字体，换个关键词试试');
        return;
      }
      this.renderList();
    } catch (e) {
      this.renderError(`解析搜索结果失败: ${String(e)}`);
    }
  }

  private async download(item: MiFontItem): Promise<void> {
    if (this.downloading) return;
    this.downloading = true;
    const logFile = '/data/adb/modules/FontMM/webroot/mi-download.log';
    const encodedTitle = encodeURIComponent(item.title);
    this.renderLog(`开始下载「${item.title}」...\n`);

    // 后台运行脚本 (exec 立即返回, 不阻塞 UI), 日志重定向到 webroot 下的文件
    await exec(
      `rm -f '${logFile}' && nohup sh '${DL_SCRIPT}' '${item.title}' '${item.id}' '${encodedTitle}' > '${logFile}' 2>&1 &`,
    );

    // 轮询日志文件直到出现结束标记 __DONE__ (最多 5 分钟)
    let lastLog = '';
    for (let i = 0; i < 300; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const { stdout } = await exec(`cat '${logFile}' 2>/dev/null || true`);
      if (stdout && stdout !== lastLog) {
        lastLog = stdout;
        this.renderLog(stdout);
      }
      if (stdout.includes('__DONE__')) break;
    }

    this.downloading = false;
    if (!lastLog.includes('__DONE__')) {
      this.renderLog(`${lastLog || ''}\n[x] 下载超时或日志文件缺失`);
    }
  }

  // ---------- 渲染 ----------

  private renderLoading(text: string): void {
    this.resultEl.innerHTML = `<div class="mi-status">${escapeHtml(text)}</div>`;
  }

  private renderError(text: string): void {
    this.resultEl.innerHTML = `<div class="mi-status mi-status-error">${escapeHtml(text)}</div>`;
  }

  // 日志展示 (等宽字体, 保留换行)
  private renderLog(text: string): void {
    this.resultEl.innerHTML = `<pre class="mi-log">${escapeHtml(text)}</pre>`;
  }

  private renderList(): void {
    this.resultEl.innerHTML = `
      <div class="mi-list">
        ${this.items
          .map(
            (item, i) => `
          <div class="mi-item">
            <img class="mi-item-pic" src="${PIC_BASE}${escapeHtml(item.pic)}" alt="" onerror="this.style.display='none'">
            <span class="mi-item-title">${escapeHtml(item.title)}</span>
            <md-filled-button class="mi-item-dl" data-index="${i}">下载</md-filled-button>
          </div>`,
          )
          .join('')}
      </div>
      <div class="mi-pager">
        <md-text-button id="mi-prev" ${this.pageNo === 0 ? 'disabled' : ''}>上一页</md-text-button>
        <span class="mi-page">第 ${this.pageNo + 1} 页</span>
        <md-text-button id="mi-next">下一页</md-text-button>
      </div>
    `;
    this.resultEl.querySelectorAll<HTMLElement>('.mi-item-dl').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        const item = this.items[idx];
        if (item) void this.download(item);
      });
    });
    document.getElementById('mi-prev')?.addEventListener('click', () => {
      if (this.pageNo > 0) {
        this.pageNo--;
        void this.search(this.pageNo);
      }
    });
    document.getElementById('mi-next')?.addEventListener('click', () => {
      this.pageNo++;
      void this.search(this.pageNo);
    });
  }
}
