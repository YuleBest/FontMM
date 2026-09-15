// dev/lib/go.mjs — fontmm-wght 的交叉编译 (pack 与 build-wght 共用, 避免标志漂移)
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ROOT, GOLANG_DIR, SRC_DIR } from './paths.mjs';
import { run } from './exec.mjs';

/**
 * 构建标志:
 *   -trimpath      去掉源码绝对路径 (否则换目录构建产物就变)
 *   -buildvcs=false 不嵌入 VCS 状态 (否则 vcs.modified 会随工作树是否干净而变化)
 * 两者共同保证同一份源码在任何环境构建出的二进制完全一致。
 */
export const GO_BUILD_FLAGS = ['-trimpath', '-buildvcs=false', '-ldflags=-s -w'];

/** fontmm-wght 产物路径 */
export const WGHT_BIN = path.join(SRC_DIR, 'tools', 'fontmm-wght');

/**
 * 交叉编译 fontmm-wght -> src/tools/fontmm-wght
 * @returns {Promise<number>} 产物字节数
 */
export async function buildWght() {
  await fsp.mkdir(path.dirname(WGHT_BIN), { recursive: true });
  run('go', ['build', ...GO_BUILD_FLAGS, '-o', WGHT_BIN, './cmd/fontmm-wght'], {
    cwd: GOLANG_DIR,
    env: { GOOS: 'android', GOARCH: 'arm64', CGO_ENABLED: '0' },
  });
  // 保证可执行位: 打包按磁盘权限位写入 zip, Magisk 安装后才能直接运行
  await fsp.chmod(WGHT_BIN, 0o755);
  const { size } = await fsp.stat(WGHT_BIN);
  return size;
}

/** 产物相对仓库根的路径 (日志用) */
export function wghtBinRel() {
  return path.relative(ROOT, WGHT_BIN);
}
