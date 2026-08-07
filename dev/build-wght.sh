#!/bin/sh
# build-wght.sh - 交叉编译 fontmm-wght (Go -> android-arm64, 无需 NDK)
# 产物输出到 src/tools/fontmm-wght, 随模块 zip 打包 (与 mi-font-download.sh 等工具脚本同层)
set -e
cd "$(dirname "$0")/../golang"

echo "[*] 交叉编译 fontmm-wght (android/arm64)..."
GOOS=android GOARCH=arm64 CGO_ENABLED=0 go build -ldflags="-s -w" -o ../src/tools/fontmm-wght ./cmd/fontmm-wght

echo "[✓] 产物: src/tools/fontmm-wght ($(wc -c < ../src/tools/fontmm-wght) 字节)"
