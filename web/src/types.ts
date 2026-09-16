export interface FontSlot {
  key: 'hans' | 'hant' | 'en' | 'mono' | 'emoji';
  title: string;
  path: string | null;
  fileName: string;
  /** 字体大小展示文本 (如 "12.5 MB"), 异步获取 */
  sizeText?: string;
  /** 是否为可变字体 (fvar 表存在), 异步获取 */
  isVariable?: boolean;
  /** wght 轴范围 (如 "100-900"), 可变字体时有 */
  wghtRange?: string;
  /** 英文字体裁切后的子集大小 (如 "218 KB"), 仅英文槽位且子集有效时存在 (issue #14) */
  subsetSizeText?: string;
}
