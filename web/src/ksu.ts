import { exec as ksuExec, toast as ksuToast, moduleInfo as ksuModuleInfo } from 'kernelsu';

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
    fonts: ['HarmonyOS_Sans.ttf', 'MiSans-Bold.ttf', 'AlibabaPuHuiTi.otf'],
    files: ['a.pdf'],
  },
  '/storage/emulated/0/Fonts': {
    dirs: [],
    fonts: ['OPPOSans.ttf', 'SourceHanSansCN.ttf', 'Inter-Variable.otf'],
    files: [],
  },
  '/storage/emulated/0/Documents': { dirs: [], fonts: [], files: ['notes.txt'] },
  '/storage/emulated/0/字体': { dirs: [], fonts: ['思源黑体.ttf', '霞鹜文楷.ttf'], files: [] },
};

async function mockExec(command: string): Promise<ExecResult> {
  const fake = (stdout = ''): ExecResult => ({ errno: 0, stdout, stderr: '' });
  const fail = (stderr: string): ExecResult => ({ errno: 1, stdout: '', stderr });
  const slow = (stdout = '') =>
    new Promise<ExecResult>((r) => setTimeout(() => r(fake(stdout)), 200));
  const slowFail = (stderr: string) =>
    new Promise<ExecResult>((r) => setTimeout(() => r(fail(stderr)), 200));

  // find 命令: 解析路径与类型 (d/f), 返回假目录/文件, 以 NUL 分隔 (与 -print0 一致)
  if (command.startsWith('find ')) {
    const m = command.match(
      /^find ['"]([^'"]*)['"] -maxdepth 1 -mindepth 1 -type ([df]) ?-print0$/,
    );
    if (!m) return slow(`(mock 未定义: ${command})`);
    const dir = m[1];
    const node = FAKE_FS[dir];
    if (!node) return slowFail(`find: ${dir}: No such file or directory`);
    const full = (name: string) => (dir === '/' ? `/${name}` : `${dir}/${name}`);
    const lines = m[2] === 'd' ? node.dirs.map(full) : [...node.fonts, ...node.files].map(full);
    return slow(lines.join('\0'));
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

  // 元模块 (KernelSU 3.0+ 需要): 模拟已安装
  if (command.includes('metamodule')) {
    return slow('name=KernelSU MetaModule\nversion=v1.0\nauthor=KernelSU');
  }

  if (command.includes('ro.product.model')) return slow('Pixel 8 Pro (模拟设备)');
  return slow(`(mock 未定义: ${command})`);
}

export async function exec(command: string): Promise<ExecResult> {
  if (import.meta.env.DEV) return mockExec(command);
  // KernelSU-Next 等分支的 ksu API 可能与 KernelSU 不一致, 缺失时优雅降级
  if (typeof ksuExec !== 'function') {
    return { errno: 1, stdout: '', stderr: 'kernelsu exec API 不可用' };
  }
  return ksuExec(command);
}

export function toast(msg: string): void {
  if (import.meta.env.DEV) console.log('[toast]', msg);
  else if (typeof ksuToast === 'function') ksuToast(msg);
}

// 模块信息 (module.prop 风格文本), dev 模式返回模拟数据
export function moduleInfo(): string {
  if (import.meta.env.DEV) {
    return [
      'id=FontMM',
      'name=FontMM',
      'version=26.8.0-beta.1(260800001)',
      'versionCode=26080001',
      'author=Yule',
      'description=ColorOS 16 字体模块模板',
    ].join('\n');
  }
  if (typeof ksuModuleInfo === 'function') return ksuModuleInfo();
  return '';
}

// 全屏: 让 WebView 内容延伸到状态栏 / 底部导航栏(小白条) 下方
export function fullScreen(enabled: boolean): void {
  if (import.meta.env.DEV) return;
  // 直接调用全局 ksu (绕过 npm 包封装), KernelSU-Next 分支缺失/命名不同时忽略
  try {
    const ksuApi = (window as any).ksu as Record<string, unknown> | undefined;
    if (ksuApi && typeof ksuApi.fullScreen === 'function') {
      (ksuApi.fullScreen as (v: boolean) => void)(enabled);
    }
  } catch {
    // 忽略
  }
}

// edge-to-edge: 启用安全区 insets (配合 insets.css 的 --window-inset-* 变量)
export function enableEdgeToEdge(enabled: boolean): void {
  if (import.meta.env.DEV) return;
  // 关键: 不能检查 npm 包的 import 绑定 (它始终存在, 真正的 TypeError 在包内部
  // 调用 ksu.enableEdgeToEdge 时抛出, 会中断整个脚本)。必须直接检查全局 ksu 对象。
  // KernelSU: enableEdgeToEdge; KernelSU-Next: enableInsets (命名不同)
  try {
    const ksuApi = (window as any).ksu as Record<string, unknown> | undefined;
    if (!ksuApi) return;
    const fn = (ksuApi.enableEdgeToEdge ?? ksuApi.enableInsets) as
      | ((v: boolean) => void)
      | undefined;
    if (typeof fn === 'function') fn(enabled);
  } catch {
    // 忽略
  }
}

// ---------------- 主页: 设备 / 模块信息 ----------------

export interface SystemInfo {
  /** ro.build.version.release, 如 "16.0" */
  androidVersion: string;
  /** ro.build.version.sdk, 如 "36" */
  sdk: string;
  /** ro.product.model, 如 "PHZ110" */
  deviceModel: string;
  /** ro.product.cpu.abi, 如 "arm64-v8a" */
  abi: string;
  /** FONTS/ 中实际存在的用户字体文件数 (0-4) */
  fontCount: number;
}

// 模块 FONT 目录 (与 main.ts 的 FONTS_DIR 保持一致)
const MODULE_FONTS_DIR = '/data/adb/modules/FontMM/FONTS';

export async function getSystemInfo(): Promise<SystemInfo> {
  if (import.meta.env.DEV) {
    return {
      androidVersion: '16.0',
      sdk: '36',
      deviceModel: 'Pixel 8 Pro (模拟设备)',
      abi: 'arm64-v8a',
      fontCount: 2,
    };
  }
  const info: SystemInfo = { androidVersion: '', sdk: '', deviceModel: '', abi: '', fontCount: 0 };
  try {
    const props = [
      'ro.build.version.release',
      'ro.build.version.sdk',
      'ro.product.model',
      'ro.product.cpu.abi',
    ];
    const { errno, stdout } = await exec(
      `${props.map((p) => `getprop ${p}`).join('; ')}; ls -1 '${MODULE_FONTS_DIR}'/*.ttf 2>/dev/null`,
    );
    if (errno === 0) {
      const lines = stdout.split('\n');
      [info.androidVersion, info.sdk, info.deviceModel, info.abi] = lines
        .slice(0, 4)
        .map((l) => l.trim());
      // 剩余行是 FONTS/ 中实际存在的字体文件名
      info.fontCount = lines.slice(4).filter((l) => l.trim() && l.endsWith('.ttf')).length;
    }
  } catch {
    // 读取失败时保持空值, 由 UI 显示占位
  }
  return info;
}

// 用 am start 在 WebUI 之外打开链接/应用 (避免在 WebView 内打开)
export async function amStart(uri: string, pkg?: string): Promise<void> {
  const cmd = `am start -a android.intent.action.VIEW -d '${uri}'${pkg ? ` -p ${pkg}` : ''}`;
  if (import.meta.env.DEV) {
    console.log('[am start]', cmd);
    return;
  }
  await exec(cmd);
}
