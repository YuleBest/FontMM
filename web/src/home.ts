import { amStart, exec, getPreloaderStatus, getSystemInfo, moduleInfo } from './ksu';
import { rebootBtn } from './dom';
import { ALIPAY_PKG, DEV_PROFILE_URL, DONATE_ALIPAY_URI, DONATE_IFDIAN_URL } from './constants';

interface ModuleProp {
  [key: string]: string;
}

// 解析 module.prop 风格文本 (key=value 每行一个)
function parseProp(text: string): ModuleProp {
  const out: ModuleProp = {};
  for (const line of text.split('\n')) {
    const idx = line.indexOf('=');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      if (key) out[key] = line.slice(idx + 1).trim();
    }
  }
  return out;
}

// 渲染主页: 模块状态 + 设备信息
export async function loadHome(): Promise<void> {
  // 模块信息 (module.prop)
  let prop: ModuleProp = {};
  try {
    prop = { ...prop, ...parseProp(moduleInfo()) };
  } catch {
    // dev 或 API 不可用时忽略, 走下方兜底
  }
  try {
    const { errno, stdout } = await exec('cat /data/adb/modules/FontMM/module.prop');
    if (errno === 0) prop = { ...prop, ...parseProp(stdout) };
  } catch {
    // 忽略读取失败
  }

  // 挂载状态与设备信息
  const sys = await getSystemInfo();
  const mounted = sys.fontCount > 0;

  const set = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  set('home-status', mounted ? '已挂载字体' : '未挂载字体');
  set('home-version', prop.version || '未知');
  set('home-android-version', sys.androidVersion || '未知');
  set('home-device-model', sys.deviceModel || '未知');
  set('home-abi', sys.abi || '未知');
  set('home-font-count', `${sys.fontCount} 个`);

  // 元模块: /data/adb/metamodule 是符号链接, cat 可直接读取其 module.prop 的 name
  try {
    const { errno, stdout } = await exec('cat /data/adb/metamodule/module.prop');
    if (errno === 0 && stdout.trim()) {
      set('home-metamodule', parseProp(stdout).name || '未知');
    } else {
      set('home-metamodule', '未安装');
    }
  } catch {
    set('home-metamodule', '未安装');
  }

  await loadPreloader();
}

// 渲染字体预热器状态。
// 就绪条件: 预加载库随模块安装 + 存在可用的 Zygisk 环境 (两者缺一不可)。
async function loadPreloader(): Promise<void> {
  const status = await getPreloaderStatus();

  const statusEl = document.getElementById('home-preload-status');
  const providerEl = document.getElementById('home-preload-provider');
  const noteEl = document.getElementById('home-preload-note');
  if (!statusEl || !providerEl || !noteEl) return;

  const ready = status.libInstalled && status.zygiskReady;

  // 状态色: 就绪用主题主色, 未就绪用错误色 (与其他状态提示一致的语义)
  statusEl.textContent = ready ? '已启用' : '未生效';
  statusEl.classList.toggle('is-error', !ready);
  providerEl.textContent = status.provider || '未检测到';

  // 未就绪时给出具体原因, 而不是只显示一个笼统的失败状态
  if (ready) {
    noteEl.hidden = true;
    noteEl.textContent = '';
  } else if (!status.libInstalled) {
    noteEl.hidden = false;
    noteEl.textContent = '模块内未找到 zygisk/arm64-v8a.so, 请重新刷入模块。';
  } else {
    noteEl.hidden = false;
    noteEl.textContent =
      '未检测到可用的 Zygisk 环境, 字体预热不会生效, 被「卸载模块」的应用可能字体异常。请在 Root 管理器中启用内置 Zygisk, 或安装 Zygisk Next / ReZygisk。';
  }
}

// 支付宝捐献: 必须在 WebUI 外打开 (am start), 否则 alipays 协议无法唤起
let donateOpen = false;
const donateExpand = document.getElementById('donate-expand')!;
const donateArrow = document.getElementById('donate-arrow')!;

document.getElementById('donate-entry')?.addEventListener('click', () => {
  donateOpen = !donateOpen;
  donateExpand.hidden = !donateOpen;
  donateArrow.classList.toggle('expanded', donateOpen);
});

document.getElementById('donate-alipay')?.addEventListener('click', () => {
  void amStart(DONATE_ALIPAY_URI, ALIPAY_PKG);
});

// 爱发电: 用系统默认浏览器打开 (am start)
document.getElementById('donate-ifdian')?.addEventListener('click', () => {
  void amStart(DONATE_IFDIAN_URL);
});

// 开发者主页: 用系统默认浏览器打开 (am start, 避免在 WebView 内打开)
document.getElementById('dev-entry')?.addEventListener('click', () => {
  void amStart(DEV_PROFILE_URL);
});

// 重启设备 (二次确认): dev 模式由 mockExec 模拟输出; 真机立即重启
const rebootDialog = document.getElementById('reboot-dialog') as any;
rebootBtn?.addEventListener('click', () => {
  if (rebootDialog) rebootDialog.open = true;
});
document.getElementById('reboot-cancel')?.addEventListener('click', () => {
  if (rebootDialog) rebootDialog.open = false;
});
document.getElementById('reboot-confirm')?.addEventListener('click', () => {
  if (rebootDialog) rebootDialog.open = false;
  void exec('sync; reboot');
});
