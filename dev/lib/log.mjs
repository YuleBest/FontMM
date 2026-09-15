// dev/lib/log.mjs — 统一日志输出 (沿用原 shell 脚本的 [*] [✓] [!] [✗] 前缀风格)
// 颜色仅在终端下启用, 重定向到文件/CI 时自动降级为纯文本

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

function paint(code, text) {
  return useColor ? `\u001b[${code}m${text}\u001b[0m` : text;
}

export const log = {
  /** 流程节点 */
  step: (msg) => console.log(`[*] ${msg}`),
  /** 成功 */
  ok: (msg) => console.log(paint('32', `[✓] ${msg}`)),
  /** 中性信息 */
  info: (msg) => console.log(`[-] ${msg}`),
  /** 警告 (不中断) */
  warn: (msg) => console.log(paint('33', `[!] ${msg}`)),
  /** 错误 (不中断, 由调用方决定是否终止) */
  fail: (msg) => console.error(paint('31', `[✗] ${msg}`)),
  /** 缩进明细 */
  detail: (msg) => console.log(`    ${msg}`),
};

/** 打印错误并以非 0 退出 */
export function die(msg, code = 1) {
  log.fail(msg);
  process.exit(code);
}

/** 秒表: 返回一个函数, 调用后得到 "x.xs" 文本 */
export function stopwatch() {
  const t0 = Date.now();
  return () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
}
