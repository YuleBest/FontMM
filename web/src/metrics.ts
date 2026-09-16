// metrics.ts — 固定行距/字距 (issue #17)
//
// 背景: Android 的行高取「paint 度量」与「该行实际使用字体度量」的并集, 而 paint
// 度量来自 typeface 家族里与请求字重最接近的那个条目 —— 本模块的 fonts.xml 中
// sans-serif 首个条目正是英文槽位字体, 于是换英文字体 (进而中文行距) 都会跟着变。
//
// 做法: 模块内置一个只有度量、没有文字字形的载体字体 (FontMM-Metrics.ttf, 由
// Roboto Flex 裁出), 开启后由 apply.sh 里的 fontmm-wght 把它插到各家族首位当基准。
// 开关记在 FONTS/metrics.txt。
import '@material/web/switch/switch.js';
import { exec, toast } from './ksu';
import { FONTS_DIR } from './constants';

const metricsSwitch = document.getElementById('metrics-switch') as any;
const metricsSub = document.getElementById('metrics-sub');

/** 当前 UI 开关状态 */
export function getSelectedMetrics(): boolean {
  return Boolean(metricsSwitch?.selected);
}

/** 写入开关到 FONTS/metrics.txt (apply.sh 读取) */
export async function writeMetrics(enabled: boolean): Promise<void> {
  try {
    await exec(`echo '${enabled ? 1 : 0}' > '${FONTS_DIR}/metrics.txt'`);
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

// 开关只在应用时生效 (载体由 apply.sh 生成), 切换后要提示
metricsSwitch?.addEventListener('change', () => {
  const on = getSelectedMetrics();
  toast(on ? '已启用固定行距字距，点「应用」后生效' : '已关闭固定行距字距，点「应用」后生效');
  if (metricsSub) metricsSub.classList.toggle('metrics-sub--on', on);
});

async function initMetricsUI(): Promise<void> {
  const enabled = await readMetrics();
  if (metricsSwitch) metricsSwitch.selected = enabled;
  if (metricsSub) metricsSub.classList.toggle('metrics-sub--on', enabled);
}

void initMetricsUI();
