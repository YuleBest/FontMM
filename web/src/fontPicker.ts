import '@material/web/dialog/dialog.js';
import '@material/web/list/list.js';
import '@material/web/list/list-item.js';
import '@material/web/icon/icon.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/button/text-button.js';
import { exec } from './ksu';

export interface FileItem {
  name: string;
  isDir: boolean;
  size?: string;
}

export class FontFilePicker {
  private currentPath = '/storage/emulated/0';
  private dialogEl!: HTMLElement;
  private listEl!: HTMLElement;
  private pathEl!: HTMLElement;
  private onSelectCallback: (path: string, fileName: string) => void;

  constructor(onSelect: (path: string, fileName: string) => void) {
    this.onSelectCallback = onSelect;
    this.initDialog();
  }

  private initDialog(): void {
    if (document.getElementById('picker-dialog')) {
      this.dialogEl = document.getElementById('picker-dialog')!;
      this.listEl = document.getElementById('picker-list')!;
      this.pathEl = document.getElementById('picker-path')!;
      return;
    }

    const dialogHTML = `
      <md-dialog id="picker-dialog" class="font-picker-dialog">
        <div slot="headline" class="picker-header">
          <div class="picker-title-bar">
            <md-icon-button id="picker-back-btn" class="picker-back" aria-label="返回上一级">
              <md-icon>arrow_back</md-icon>
            </md-icon-button>
            <div class="picker-path-group">
              <div class="picker-subtitle">选择字体文件</div>
              <div id="picker-path" class="picker-path-text">/storage/emulated/0</div>
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

    this.dialogEl = document.getElementById('picker-dialog')!;
    this.listEl = document.getElementById('picker-list')!;
    this.pathEl = document.getElementById('picker-path')!;

    document.getElementById('picker-back-btn')?.addEventListener('click', () => this.navigateUp());
    document.getElementById('picker-cancel-btn')?.addEventListener('click', () => this.hide());
  }

  public show(initialPath = '/storage/emulated/0'): void {
    this.currentPath = initialPath;
    (this.dialogEl as any).open = true;
    this.loadDirectory(this.currentPath);
  }

  public hide(): void {
    (this.dialogEl as any).open = false;
  }

  private navigateUp(): void {
    if (this.currentPath === '/' || this.currentPath === '') return;
    const parts = this.currentPath.split('/').filter(Boolean);
    parts.pop();
    this.currentPath = parts.length === 0 ? '/' : '/' + parts.join('/');
    this.loadDirectory(this.currentPath);
  }

  private async loadDirectory(path: string): Promise<void> {
    this.pathEl.textContent = path;
    this.listEl.innerHTML = `<div class="picker-loading">正在读取目录...</div>`;

    try {
      const { items, failed } = await this.readDir(path);
      if (failed) {
        this.listEl.innerHTML = `<div class="picker-error">无法读取该目录</div>`;
        return;
      }
      this.renderList(items);
    } catch (e) {
      this.listEl.innerHTML = `<div class="picker-error">读取目录异常: ${String(e)}</div>`;
    }
  }

  // 用 find 列出目录与文件: 每行一个完整路径, 目录/文件分两次查询
  // (兼容 busybox 与 GNU find, 不解析 ls 的列输出, 路径含空格也安全)
  private async readDir(path: string): Promise<{ items: FileItem[]; failed: boolean }> {
    const [dirRes, fileRes] = await Promise.all([
      exec(`find "${path}" -maxdepth 1 -mindepth 1 -type d`),
      exec(`find "${path}" -maxdepth 1 -mindepth 1 -type f`),
    ]);

    if (dirRes.errno !== 0 || fileRes.errno !== 0) {
      return { items: [], failed: true };
    }

    const dirs = this.splitLines(dirRes.stdout).map((p) => this.basename(p));
    const files = this.splitLines(fileRes.stdout)
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

  private splitLines(output: string): string[] {
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  private basename(path: string): string {
    return path.slice(path.lastIndexOf('/') + 1) || path;
  }

  private renderList(items: FileItem[]): void {
    if (items.length === 0) {
      this.listEl.innerHTML = `
        <div class="picker-empty">
          <md-icon>find_in_page</md-icon>
          <span>此目录下没有 .ttf 字体文件</span>
        </div>`;
      return;
    }

    this.listEl.innerHTML = items
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

    this.listEl.querySelectorAll('.picker-item').forEach((el) => {
      el.addEventListener('click', () => {
        const name = (el as HTMLElement).dataset.name!;
        const isDir = (el as HTMLElement).dataset.isdir === 'true';

        if (isDir) {
          this.currentPath = this.currentPath === '/' ? `/${name}` : `${this.currentPath}/${name}`;
          this.loadDirectory(this.currentPath);
        } else {
          const fullPath = `${this.currentPath}/${name}`;
          this.onSelectCallback(fullPath, name);
          this.hide();
        }
      });
    });
  }
}
