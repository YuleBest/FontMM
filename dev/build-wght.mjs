#!/usr/bin/env node
// dev/build-wght.mjs — 交叉编译 fontmm-wght (Go -> android/arm64, 无需 NDK)
// 产物输出到 src/tools/fontmm-wght, 随模块 zip 打包 (与 mi-font-download.sh 等工具脚本同层)
//
// 说明: Go 的 android 目标无需 NDK (CGO_ENABLED=0), 产物是静态链接的 arm64 ELF,
// 可直接在设备的 shell 中执行。
//
// 可复现构建: 见 dev/lib/go.mjs 中的 GO_BUILD_FLAGS 说明。若不加 -trimpath 与
// -buildvcs=false, Go 会把源码绝对路径和 VCS 状态嵌进二进制, 使同一份源码在不同
// 目录构建、或工作树有未提交改动时产物哈希不同, 导致 SHA256SUMS 随构建环境漂移。
//
// 用法: node dev/build-wght.mjs
import { log, die } from './lib/log.mjs';
import { hasCommand } from './lib/exec.mjs';
import { buildWght, wghtBinRel } from './lib/go.mjs';

if (!hasCommand('go')) die('未找到 go 命令, 请先安装 Go 工具链');

log.step('交叉编译 fontmm-wght (android/arm64)...');
const size = await buildWght();
log.ok(`产物: ${wghtBinRel()} (${size} 字节)`);
