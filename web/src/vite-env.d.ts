/// <reference types="vite/client" />

declare module 'opentype.js' {
  /** 解析字体二进制, 返回字体对象 (名称表: names.windows/macintosh) */
  export function parse(buffer: ArrayBuffer): any;
}
