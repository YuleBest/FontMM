import { defineConfig } from 'vite';

export default defineConfig({
  // WebView 从本地加载 webroot, 资源必须相对路径
  base: './',
  worker: {
    // Worker 内动态 import('pyodide') 需要 code-splitting, 输出 ESM
    format: 'es',
  },
  build: {
    // 构建产物直接进模块的 webroot
    outDir: '../src/webroot',
    // outDir 在项目根之外, 必须显式开启清空
    emptyOutDir: true,
  },
});
