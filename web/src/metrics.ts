// metrics.ts — 固定行距/字距 (issue #17)
//
// 背景: Android 的行高取「paint 度量」与「该行实际使用字体度量」的并集, 只能抬高不能
// 压低 (StaticLayout: lineAscent = min(paint 上升部, 该行字体上升部))。因此只要装入
// system/fonts 的字体行距各不相同, 换字体行距就会变; 只在家族首位放一个度量载体
// 也压不住比它更高的字体。
//
// 做法: apply.sh 按本页开关与档位, 把装入 system/fonts 的字体行距度量按比例统一到同一
// 总量, 并收紧虚高的包围盒 (段落上下留白来自它)。字形完全不动。
// 开关存 FONTS/metrics.txt, 档位 (千分比 em) 存 FONTS/line-height.txt。
import '@material/web/switch/switch.js';
import { exec, toast } from './ksu';
import { FONTS_DIR } from './constants';

/** 行距档位: 字身框倍数 (千分比)。与 index.html 的选项、apply.sh 的缺省值对应 */
export const LEVEL_COMPACT = 1200;
export const LEVEL_STANDARD = 1450;
export const LEVEL_LOOSE = 1600;

const metricsSwitch = document.getElementById('metrics-switch') as any;
const metricsSub = document.getElementById('metrics-sub');
const levelSelect = document.getElementById('metrics-level-select') as any;
const levelSub = document.getElementById('metrics-level-sub');

/** 当前 UI 开关状态 */
export function getSelectedMetrics(): boolean {
  return Boolean(metricsSwitch?.selected);
}

/** 当前 UI 选择的档位 (千分比 em) */
export function getSelectedLevel(): number {
  const v = Number(levelSelect?.value ?? LEVEL_STANDARD);
  return v > 0 ? v : LEVEL_STANDARD;
}

/** 写入开关到 FONTS/metrics.txt (apply.sh 读取) */
export async function writeMetrics(enabled: boolean): Promise<void> {
  try {
    await exec(`echo '${enabled ? 1 : 0}' > '${FONTS_DIR}/metrics.txt'`);
  } catch {
    // 忽略写入失败
  }
}

/** 写入档位到 FONTS/line-height.txt (apply.sh 读取) */
export async function writeLevel(total: number): Promise<void> {
  try {
    await exec(`echo '${total}' > '${FONTS_DIR}/line-height.txt'`);
  } catch {
    // 忽略写入失败
  }
}

/** 读取开关 (FONTS/metrics.txt), 默认关闭 */
async function readMetrics(): Promise<boolean> {
  try {
    const { errno, stdout } = await exec(`cat '${FONTS_DIR}/metrics.txt' 2>/dev/null || true`);
    if (errno === 0) return stdout.trim() === '1';
  } catch {
    // 忽略
  }
  return false;
}

/** 读取档位 (FONTS/line-height.txt), 默认标准档 */
async function readLevel(): Promise<number> {
  try {
    const { errno, stdout } = await exec(`cat '${FONTS_DIR}/line-height.txt' 2>/dev/null || true`);
    if (errno === 0) {
      const n = Number(stdout.trim());
      if (n >= 1000 && n <= 3000) return n;
    }
  } catch {
    // 忽略
  }
  return LEVEL_STANDARD;
}

// 档位只在开关打开时有意义: 关闭时置灰
function syncLevelEnabled(): void {
  const on = getSelectedMetrics();
  if (levelSelect) levelSelect.disabled = !on;
  if (levelSub) levelSub.classList.toggle('metrics-sub--on', on);
  if (metricsSub) metricsSub.classList.toggle('metrics-sub--on', on);
}

// 开关/档位改动即落盘 (与字重覆写模式一致), 应用时 apply.sh 按文件内容统一行距。
// 立即落盘的好处: 只改设置不重新应用、或随后更新模块时, 继承到的都是最新选择。
metricsSwitch?.addEventListener('change', () => {
  syncLevelEnabled();
  void writeMetrics(getSelectedMetrics());
  void writeLevel(getSelectedLevel());
  toast(
    getSelectedMetrics()
      ? '已启用固定行距字距，点「应用」后生效'
      : '已关闭固定行距字距，点「应用」后生效',
  );
});
levelSelect?.addEventListener('change', () => {
  void writeLevel(getSelectedLevel());
  toast('已改行距档位，点「应用」后生效');
});

async function initMetricsUI(): Promise<void> {
  const [enabled, level] = await Promise.all([readMetrics(), readLevel()]);
  if (metricsSwitch) metricsSwitch.selected = enabled;
  if (levelSelect) levelSelect.value = String(level);
  syncLevelEnabled();
}

void initMetricsUI();
