import '@material/web/dialog/dialog.js';
import '@material/web/list/list.js';
import '@material/web/list/list-item.js';
import '@material/web/icon/icon.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/button/text-button.js';
import { exec, shellQuote } from './ksu';

export interface FileItem {
  name: string;
  isDir: boolean;
  size?: string;
}

/** 选中文件时的回调: 完整路径与文件名 */
export type FontSelectHandler = (path: string, fileName: string) => void;

const DEFAULT_PATH = '/storage/emulated/0';

/**
 * 文件选择器。全局只应存在一个实例 (下方导出 fontPicker) —— 对话框 DOM 是
 * 单例 (按 id 复用), 若允许第二个实例, 它会复用这份 DOM 却拿不到返回/取消
 * 按钮的监听 (initDialog 命中已有元素时直接返回), 于是返回键按上一个实例的
 * 过期路径导航、选中文件也回调给上一个实例, 表现为「返回跳两层」「在别的
 * 目录选文件没反应」(issue #13)。因此选中回调改为每次 show 时传入。
 */
class FontFilePicker {
  private currentPath = DEFAULT_PATH;
  private dialogEl: any = null;
  private listEl: HTMLElement | null = null;
  private pathEl: HTMLElement | null = null;
  private onSelect: FontSelectHandler | null = null;

  /** 打开选择器: initialPath 为起始目录, onSelect 为本次选择的处理函数 */
  public show(initialPath: string, onSelect: FontSelectHandler): void {
    this.initDialog();
    this.onSelect = onSelect;
    this.currentPath = initialPath || DEFAULT_PATH;
    this.pathEl!.textContent = this.currentPath;
    this.dialogEl.open = true;
    void this.loadDirectory(this.currentPath);
  }

  public hide(): void {
    if (this.dialogEl) this.dialogEl.open = false;
    this.onSelect = null;
  }

  private initDialog(): void {
    if (this.dialogEl) return;

    const dialogHTML = `
      <md-dialog id="picker-dialog" class="font-picker-dialog">
        <div slot="headline" class="picker-header">
          <div class="picker-title-bar">
            <md-icon-button id="picker-back-btn" class="picker-back" aria-label="返回上一级">
              <md-icon>arrow_back</md-icon>
            </md-icon-button>
            <div class="picker-path-group">
              <div class="picker-subtitle">选择字体文件</div>
              <div id="picker-path" class="picker-path-text">${DEFAULT_PATH}</div>
            </div>
          </div>
        </div>

        <div slot="content" class="picker-content">
          <md-list id="picker-list" class="picker-list"></md-list>
        </div>

        <div slot="actions">
          <md-text-button id="picker-cancel-btn">取消</md-text-button>
        </div>
      </md-dialog>
    `;
    document.body.insertAdjacentHTML('beforeend', dialogHTML);

    this.dialogEl = document.getElementById('picker-dialog');
    this.listEl = document.getElementById('picker-list');
    this.pathEl = document.getElementById('picker-path');

    document.getElementById('picker-back-btn')?.addEventListener('click', () => this.navigateUp());
    document.getElementById('picker-cancel-btn')?.addEventListener('click', () => this.hide());

    // 列表项用事件委托: 只绑定一次, 渲染只替换内容, 不重复挂监听
    this.listEl!.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.picker-item') as HTMLElement | null;
      if (!item) return;
      const name = item.dataset.name!;

      if (item.dataset.isdir === 'true') {
        this.currentPath = this.currentPath === '/' ? `/${name}` : `${this.currentPath}/${name}`;
        void this.loadDirectory(this.currentPath);
      } else {
        const fullPath = `${this.currentPath}/${name}`;
        const handler = this.onSelect;
        this.hide();
        handler?.(fullPath, name);
      }
    });
  }

  private navigateUp(): void {
    if (this.currentPath === '/' || this.currentPath === '') return;
    const parts = this.currentPath.split('/').filter(Boolean);
    parts.pop();
    this.currentPath = parts.length === 0 ? '/' : '/' + parts.join('/');
    void this.loadDirectory(this.currentPath);
  }

  private async loadDirectory(path: string): Promise<void> {
    this.pathEl!.textContent = path;
    this.listEl!.innerHTML = `<div class="picker-loading">正在读取目录...</div>`;

    try {
      const { items, failed } = await this.readDir(path);
      if (failed) {
        this.listEl!.innerHTML = `<div class="picker-error">无法读取该目录</div>`;
        return;
      }
      this.renderList(items);
    } catch (e) {
      this.listEl!.innerHTML = `<div class="picker-error">读取目录异常: ${String(e)}</div>`;
    }
  }

  // 用 find 列出目录与文件: -print0 以 NUL 分隔路径, 路径含空格/换行也安全
  // (兼容 busybox 与 GNU find, 不解析 ls 的列输出)
  private async readDir(path: string): Promise<{ items: FileItem[]; failed: boolean }> {
    const [dirRes, fileRes] = await Promise.all([
      exec(`find ${shellQuote(path)} -maxdepth 1 -mindepth 1 -type d -print0`),
      exec(`find ${shellQuote(path)} -maxdepth 1 -mindepth 1 -type f -print0`),
    ]);

    if (dirRes.errno !== 0 || fileRes.errno !== 0) {
      return { items: [], failed: true };
    }

    const dirs = this.splitNul(dirRes.stdout).map((p) => this.basename(p));
    const files = this.splitNul(fileRes.stdout)
      .map((p) => this.basename(p))
      // 仅显示扩展名为 .ttf 的文件
      .filter((name) => name.toLowerCase().endsWith('.ttf'));

    const items: FileItem[] = [
      ...dirs.map((name) => ({ name, isDir: true })),
      ...files.map((name) => ({ name, isDir: false })),
    ].sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

    return { items, failed: false };
  }

  // 按 NUL 分隔 find -print0 的输出 (路径内的换行/空格不受影响)
  private splitNul(output: string): string[] {
    return output.split('\0').filter(Boolean);
  }

  private basename(path: string): string {
    return path.slice(path.lastIndexOf('/') + 1) || path;
  }

  private renderList(items: FileItem[]): void {
    if (items.length === 0) {
      this.listEl!.innerHTML = `
        <div class="picker-empty">
          <md-icon>find_in_page</md-icon>
          <span>此目录下没有 .ttf 字体文件</span>
        </div>`;
      return;
    }

    this.listEl!.innerHTML = items
      .map(
        (item) => `
      <md-list-item class="picker-item ${item.isDir ? 'is-dir' : 'is-file'}" data-name="${item.name}" data-isdir="${item.isDir}">
        <md-icon slot="start" class="item-icon">
          ${item.isDir ? 'folder' : 'font_download'}
        </md-icon>
        <div slot="headline" class="item-name">${item.name}</div>
        ${
          item.isDir
            ? `<md-icon slot="end" class="item-arrow">chevron_right</md-icon>`
            : `<md-text-button slot="end" class="item-select-btn">选择</md-text-button>`
        }
      </md-list-item>
    `,
      )
      .join('');
  }
}

/** 全局唯一的文件选择器实例 (见 FontFilePicker 的说明) */
export const fontPicker = new FontFilePicker();
