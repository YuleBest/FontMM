import { exec as ksuExec, toast as ksuToast, moduleInfo as ksuModuleInfo } from 'kernelsu';

export interface ExecResult {
  errno: number;
  stdout: string;
  stderr: string;
}

/**
 * Quote one argument for the POSIX shell used by KernelSU.exec.
 * Prefer spawn() when the command can be expressed as argv; use this helper
 * whenever exec() must receive a shell command containing external input.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
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
    return slow('hans.ttf\nhant.ttf\nen.ttf\nmono.ttf\nemoji.ttf');
  }

  if (command.includes('rm -f')) return fake('');
  if (command.includes('cp -f')) return fake('');
  if (command.includes('apply.sh')) {
    return fake('[*] 安装: SysSans-Hans-Regular.ttf (模拟)\n[*] 全部完成, 重启后生效 (模拟)');
  }
  // 字重覆写模式: cat 返回已选 '1' (裁切), echo 写入模拟成功
  if (command.includes('wght-mode.txt')) {
    return command.includes('echo') ? fake('') : slow('1');
  }
  // 字重覆写: Go 程序 fontmm-wght (模拟成功日志)
  if (command.includes('fontmm-wght')) {
    return slow(
      '[✓] 已覆写: system/etc/fonts.xml\n[✓] 已覆写: system/etc/fonts_base.xml\n[✓] 已覆写: system/etc/fonts_ule.xml\n[✓] 已覆写: system/etc/font_fallback.xml\n[✓] 已覆写: system/system_ext/etc/fonts_base.xml\n[✓] 已覆写: system/system_ext/etc/fonts_ule.xml\n[*] 完成, 共覆写 6 个文件',
    );
  }
  // 覆写日志回显: cat wght-apply.log
  if (command.includes('wght-apply.log')) {
    return slow('[✓] 已覆写: system/etc/fonts.xml\n[✓] 完成, 共覆写 6 个文件');
  }
  // 自定义字重映射: cat 返回模拟映射, rm/echo 写入模拟成功
  if (command.includes('wght-map.txt')) {
    if (command.includes('rm -f') || command.includes('echo')) return fake('');
    return slow('100 160\n200 250\n300 330\n400 400\n500 480\n600 560\n700 650\n800 680\n900 700');
  }
  // 覆写 fonts.xml: cp 模拟成功 (fetch work/fonts.xml 在 dev 下 404, 覆写被跳过, 不阻断应用)
  if (command.includes('fonts.xml')) {
    return slow('');
  }

  // 元模块 (KernelSU 3.0+ 需要): 模拟已安装
  if (command.includes('metamodule')) {
    return slow('name=KernelSU MetaModule\nversion=v1.0\nauthor=KernelSU');
  }

  // 小米主题字体工具: 搜索 (模拟)
  // 结构与真实接口一致: apiData.cards[].items[].schema.clicks[] 携带 title/link/pic,
  // apiData.hasMore 标识是否还有下一页
  if (command.includes('thm.market.intl.xiaomi.com')) {
    // 第二页返回空, 用于验证「下一页」按钮状态
    if (/[?&]page=1\b/.test(command)) {
      return slow(JSON.stringify({ apiData: { hasMore: false, cards: [] } }));
    }
    return slow(
      JSON.stringify({
        apiData: {
          hasMore: true,
          cards: [
            {
              items: [
                {
                  type: 'endlessList',
                  schema: {
                    type: 'Font',
                    clicks: [
                      {
                        title: 'MiSans Global (模拟)',
                        link: 'mock-font-1',
                        pic: 'ThemeMarket/mock-pic-1',
                      },
                      {
                        title: 'OPPO Sans (模拟)',
                        link: 'mock-font-2',
                        pic: 'ThemeMarket/mock-pic-2',
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      }),
    );
  }
  if (command.includes('api.zhuti.intl.xiaomi.com')) {
    return slow(
      JSON.stringify({
        apiData: { extraInfo: { themeDetail: { downloadUrl: 'mock/download/path' } } },
      }),
    );
  }
  // 下载: 后台启动脚本 (立即返回)
  if (command.includes('nohup sh') && command.includes('mi-font-download.sh')) {
    return fake('');
  }
  // 字体编辑导出: 复制/目录/分块 base64/mv 全部模拟成功
  if (
    command.includes('cp -f') ||
    command.includes("mkdir -p '/storage/emulated/0/Download/FontMM'") ||
    command.includes('base64 -d >>') ||
    command.includes("mv '")
  ) {
    return slow('');
  }
  // 下载: 轮询日志文件 (模拟完整日志 + 结束标记)
  if (command.includes('mi-download.log')) {
    return slow(
      [
        '[*] 获取「MiSans Global (模拟)」下载链接...',
        '[*] 下载: https://f17.market.xiaomi.com/issue/mock/download/path/MiSans%20Global%20(模拟).mtz',
        '[✓] 下载完成: /storage/emulated/0/Download/xttdown/MiSans_Global_模拟_.mtz (23.3M)',
        '[*] 解压 mtz 并提取字体...',
        '[✓] 提取字体:',
        '    /storage/emulated/0/Download/xttdown/extracted/MiSans_Global_模拟_/Roboto-Regular.ttf',
        '    /storage/emulated/0/Download/xttdown/extracted/MiSans_Global_模拟_/MiSans-DemiBold.ttf',
        '__DONE__',
      ].join('\n'),
    );
  }

  // 字体预热器状态检测 (模拟: 库已安装 + 检测到 Zygisk Next, 模块 ID 用真实的 zygisksu)
  if (command.includes('LIB:yes') && command.includes('PROV:')) {
    return slow('LIB:yes\nMAGISK:na\nPROV:zygisksu');
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

// ---------------- 主页: 字体预热器状态 ----------------

export interface PreloaderStatus {
  /** 预加载库是否随模块安装 (zygisk/arm64-v8a.so 存在) */
  libInstalled: boolean;
  /** 是否检测到可用的 Zygisk 环境 */
  zygiskReady: boolean;
  /** 检测到的 Zygisk 提供者名称 (如 "Magisk 内置" / "Zygisk Next"), 未检测到为空 */
  provider: string;
}

// 模块内 Zygisk 库路径 (与 dev/lib/ndk.mjs 的产物名一致)
const ZYGISK_LIB = '/data/adb/modules/FontMM/zygisk/arm64-v8a.so';

/**
 * 检测字体预热器状态。
 *
 * Zygisk 提供者的识别规则与 src/customize.sh 的 CHECK_ZYGISK_ENV 保持一致 ——
 * 两处判断标准不同会让用户看到互相矛盾的结论 (刷入时说可用、首页说不可用)。
 */
export async function getPreloaderStatus(): Promise<PreloaderStatus> {
  if (import.meta.env.DEV) {
    return { libInstalled: true, zygiskReady: true, provider: 'Zygisk Next (模拟)' };
  }

  const status: PreloaderStatus = { libInstalled: false, zygiskReady: false, provider: '' };
  try {
    // 一条命令拿全部信息, 减少 root shell 往返。每项都用显式前缀标记,
    // 避免靠输出内容猜测 (例如 Magisk 开关值恰好也是 "1")。
    const cmd = [
      // 1. 预加载库是否随模块安装
      `if [ -f '${ZYGISK_LIB}' ]; then echo 'LIB:yes'; else echo 'LIB:no'; fi`,
      // 2. Magisk 内置 Zygisk 开关 (值为 1 表示启用)
      `if [ -f /data/adb/magisk/magisk ]; then v=$(/data/adb/magisk/magisk --sqlite "SELECT value FROM settings WHERE key='zygisk';" 2>/dev/null | tr -d '\\r'); if [ "$v" = "1" ]; then echo 'MAGISK:yes'; else echo 'MAGISK:no'; fi; else echo 'MAGISK:na'; fi`,
      // 3. 独立 Zygisk 提供者模块
      //    判据是提供者**独有**的文件: lib{64}/libzygisk.so (核心库) 或
      //    bin/zygiskd{64,32} (守护进程)。注意不能以 zygisk/ 目录判断 ——
      //    那是「Zygisk 模块」(消费者) 的标志, 任何自带 zygisk/<abi>.so 的
      //    模块都有 (本模块自己也有), 据此判断会把消费者误认成提供者。
      //    这些文件名取自 Zygisk Next 与 ReZygisk 的实际安装布局。
      `for d in /data/adb/modules/*; do [ -d "$d" ] || continue; n=$(basename "$d"); [ "$n" = "FontMM" ] && continue; [ -f "$d/disable" ] && continue; for f in "$d/lib64/libzygisk.so" "$d/lib/libzygisk.so" "$d/bin/zygiskd64" "$d/bin/zygiskd32" "$d/bin/zygiskd" "$d/lib64/libzn_loader.so" "$d/lib/libzn_loader.so"; do if [ -f "$f" ]; then echo "PROV:$n"; break; fi; done; done`,
    ].join('; ');

    const { errno, stdout } = await exec(cmd);
    if (errno !== 0) return status;

    const lines = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    status.libInstalled = lines.includes('LIB:yes');

    if (lines.includes('MAGISK:yes')) {
      status.zygiskReady = true;
      status.provider = 'Magisk 内置 Zygisk';
    }

    // 独立提供者模块 (Zygisk Next / ReZygisk 等)
    const prov = lines.find((l) => l.startsWith('PROV:'));
    if (prov) {
      const name = prov.slice('PROV:'.length);
      // 模块目录名可读性较差 (如 rezygisk), 做一次友好化映射
      const friendly: Record<string, string> = {
        rezygisk: 'ReZygisk',
        // Zygisk Next 的模块 ID 是 zygisksu (取自其 module.prop)
        zygisksu: 'Zygisk Next',
        zygisknext: 'Zygisk Next',
        'zygisk-next': 'Zygisk Next',
      };
      status.zygiskReady = true;
      status.provider = friendly[name.toLowerCase()] ?? name;
    }
  } catch {
    // 读取失败保持默认值 (未安装 / 不可用)
  }
  return status;
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
