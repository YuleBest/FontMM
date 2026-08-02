export interface FontSlot {
  key: 'hans' | 'hant' | 'en' | 'mono';
  title: string;
  path: string | null;
  fileName: string;
  /** 字体大小展示文本 (如 "12.5 MB"), 异步获取 */
  sizeText?: string;
}
