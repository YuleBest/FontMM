// dev/lib/exec.mjs — 外部命令调用封装 (取代 shell 里的直接调用)
// 统一处理: 命令缺失的友好提示、退出码检查、stdout 透传
import { spawnSync } from 'node:child_process';
import { log } from './log.mjs';

/** 命令是否存在于 PATH (只探测可执行性, 不关心退出码) */
export function hasCommand(cmd) {
  const probe = spawnSync(cmd, [], { stdio: 'ignore', shell: false });
  // ENOENT 表示命令不存在; 其余情况 (包括参数缺失导致的非 0 退出) 都说明命令可用
  return !(probe.error && probe.error.code === 'ENOENT');
}

/**
 * 运行命令, 失败即抛错 (由调用方捕获或用 runOrDie)。
 * @param {string} cmd
 * @param {string[]} args
 * @param {{cwd?: string, env?: Record<string,string>, quiet?: boolean}} [opts]
 */
export function run(cmd, args, opts = {}) {
  const { cwd, env, quiet = false } = opts;
  const res = spawnSync(cmd, args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
    encoding: 'utf8',
    shell: false,
  });
  if (res.error) {
    if (res.error.code === 'ENOENT') throw new Error(`未找到命令: ${cmd} (请先安装)`);
    throw new Error(`${cmd} 执行失败: ${res.error.message}`);
  }
  if (res.status !== 0) {
    const detail = quiet ? (res.stderr || res.stdout || '').trim() : '';
    throw new Error(`${cmd} 退出码 ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res;
}

/** 运行命令并返回 stdout (不打印) */
export function capture(cmd, args, opts = {}) {
  const res = run(cmd, args, { ...opts, quiet: true });
  return res.stdout ?? '';
}

/** 运行命令失败即终止脚本 (用于构建流程中的必需步骤) */
export function runOrDie(cmd, args, opts = {}) {
  try {
    return run(cmd, args, opts);
  } catch (e) {
    log.fail(e.message);
    process.exit(1);
  }
}
