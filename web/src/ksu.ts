import {
  exec as ksuExec,
  toast as ksuToast,
  moduleInfo as ksuModuleInfo,
  fullScreen as ksuFullScreen,
  enableEdgeToEdge as ksuEnableEdgeToEdge,
} from 'kernelsu';

export interface ExecResult {
  errno: number;
  stdout: string;
  stderr: string;
}

// dev 模式假文件系统 (用于文件选择器, 路径结构与 Android 一致)
const FAKE_FS: Record<string, { dirs: string[]; fonts: string[]; files: string[] }> = {
  '/': { dirs: ['storage'], fonts: [], files: [] },
  '/storage': { dirs: ['emulated'], fonts: [], files: [] },
  '/storage/emulated': { dirs: ['0'], fonts: [], files: [] },
  '/storage/emulated/0': {
    dirs: ['Download', 'Fonts', 'Documents', '字体'],
    fonts: [],
    files: ['notes.txt'],
  },
  '/storage/emulated/0/Download': {
    dirs: [],
    fonts: ['HarmonyOS_Sans.ttf', 'MiSans-Bold.ttf'],
    files: ['a.pdf'],
  },
  '/storage/emulated/0/Fonts': {
    dirs: [],
    fonts: ['OPPOSans.ttf', 'SourceHanSansCN.ttf'],
    files: [],
  },
  '/storage/emulated/0/Documents': { dirs: [], fonts: [], files: [] },
  '/storage/emulated/0/字体': { dirs: [], fonts: ['思源黑体.ttf', '霞鹜文楷.ttf'], files: [] },
};

async function mockExec(command: string): Promise<ExecResult> {
  const fake = (stdout = ''): ExecResult => ({ errno: 0, stdout, stderr: '' });
  const fail = (stderr: string): ExecResult => ({ errno: 1, stdout: '', stderr });
  const slow = (stdout = '') =>
    new Promise<ExecResult>((r) => setTimeout(() => r(fake(stdout)), 200));
  const slowFail = (stderr: string) =>
    new Promise<ExecResult>((r) => setTimeout(() => r(fail(stderr)), 200));

  // find 命令: 解析路径与类型 (d/f), 返回假目录/文件, 每行一个完整路径
  if (command.startsWith('find ')) {
    const m = command.match(/^find ['"]([^'"]*)['"] -maxdepth 1 -mindepth 1 -type ([df])$/);
    if (!m) return slow(`(mock 未定义: ${command})`);
    const dir = m[1];
    const node = FAKE_FS[dir];
    if (!node) return slowFail(`find: ${dir}: No such file or directory`);
    const full = (name: string) => (dir === '/' ? `/${name}` : `${dir}/${name}`);
    const lines = m[2] === 'd' ? node.dirs.map(full) : [...node.fonts, ...node.files].map(full);
    return slow(lines.join('\n'));
  }

  // 字体测试: 模拟 FONT 字体已放入 webroot/fonts-test, 返回可用字体列表
  if (command.includes('fonts-test')) {
    return slow('hans.ttf\nhant.ttf\nen.ttf\nmono.ttf');
  }

  if (command.includes('rm -f')) return fake('');
  if (command.includes('cp -f')) return fake('');
  if (command.includes('apply.sh')) {
    return fake('[*] 安装: SysSans-Hans-Regular.ttf (模拟)\n[*] 全部完成, 重启后生效 (模拟)');
  }

  if (command.includes('ro.product.model')) return slow('Pixel 8 Pro (模拟设备)');
  return slow(`(mock 未定义: ${command})`);
}

export async function exec(command: string): Promise<ExecResult> {
  if (import.meta.env.DEV) return mockExec(command);
  return ksuExec(command);
}

export function toast(msg: string): void {
  if (import.meta.env.DEV) console.log('[toast]', msg);
  else ksuToast(msg);
}

// 模块信息 (module.prop 风格文本), dev 模式返回模拟数据
export function moduleInfo(): string {
  if (import.meta.env.DEV) {
    return [
      'id=FontMM',
      'name=FontMM',
      'version=26.8.0(260800001)',
      'versionCode=26080001',
      'author=Yule',
      'description=ColorOS 16 字体模块模板',
    ].join('\n');
  }
  return ksuModuleInfo();
}

// 全屏: 让 WebView 内容延伸到状态栏 / 底部导航栏(小白条) 下方
export function fullScreen(enabled: boolean): void {
  if (import.meta.env.DEV) return;
  ksuFullScreen(enabled);
}

// edge-to-edge: 启用安全区 insets (配合 insets.css 的 --window-inset-* 变量)
export function enableEdgeToEdge(enabled: boolean): void {
  if (import.meta.env.DEV) return;
  ksuEnableEdgeToEdge(enabled);
}
