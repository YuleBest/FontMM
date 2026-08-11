# Changelog

## Unreleased

- **修复中文字体完全覆盖西文字体**（issue #6）：`SysFont-Regular.ttf` 改为英文槽位填充（未设置英文时仍回退简体），不再被中文字体占用，西文字形可正常显示
- **字重覆写覆盖全部生效家族**（issue #7）：不再只改 `sans-serif`，同时覆写 `sys-sans-en` / `zh-Hans` / `zh-Hant` 家族，保证中英文一致映射
- **字重覆写只改一份配置**（issue #7）：`fontmm-wght` 只修改 `fonts.xml` 主配置，再 `-sync` 同步到各派生配置；派生配置不再打包进模块，改由刷入脚本（`customize.sh`）扫描设备系统 XML 生成，提升跨 ColorOS 版本兼容性
- **SHA256 完整性校验**（issue #8）：新增 `dev/gen-sha256.sh` 生成可执行文件校验（随模块打包），设备端 `tools/verify-sha256.sh` 一键校验；GitHub Release/CI 产物附带 `*.sha256` 校验文件

## v26.8.0-beta.4

- **字重范围覆写**（可变字体映射引擎，Go 方案）：可变字体 wght 轴范围与实际字重等级不符时，可视化覆写 `sans-serif` 配置
  - 支持三种模式：**裁切粗细等级** / **平均分配字重**（9 档线性插值）/ **自定义映射**
  - 字重映射编辑器：实时预览、新增/删除映射、滑块拖拽（按住并水平滑动才触发，防误触）、轴值对比标注（+25 / -100）
  - 工具栏：撤销（30 步历史）、导出/导入（base64 JSON，跨设备备份恢复）、重置
  - 内置 Go 程序 `fontmm-wght` 本地覆写全部 6 个字体配置 XML，无命令长度限制；修复嵌套 family 深度配对，杜绝段被切掉导致无法开机的严重问题
- **新增「字体编辑」工具**（实验性，Pyodide + fontTools）：打开 `.ttf` 编辑字体信息与字形
  - 17 个 name 字段编辑；字形缩放 50-150% / 水平垂直偏移 / 字间距 / 行间距（Canvas 实时预览）
  - 性能重构：lazy 解析 + 快照-重置 + numpy 批量矩阵变换，大字体导出提速 62s → 11.5s
  - 编辑结果 base64 分块导出到 `Download/FontMM/`；Pyodide 全部本地化（零外部依赖），移入 Web Worker 不阻塞 UI
- **工具页重构**：ToolHost 注册表框架，每个工具独立页面（template/mount/unmount），为创意工坊等扩展铺路
- **安装体验**：非 ColorOS / 版本过低不再拒绝安装，改为音量键确认风险后继续（音量上继续 / 音量下中止）
- **WebUI 架构重构**：`main.ts`（1039 行）按职责拆分为 slots / wght / apply / home / navigation 等模块；修复动态 shell 参数未加引号的安全问题
- **文档完善**：README 重写（支持环境、KernelSU/Magisk 分支、元模块、Fontloader 配置说明）

## v26.8.0-beta.3

- **新增「工具」页**（底部导航第 4 个 tab）：下载国际版小米主题字体 v1.0.0
  - 搜索小米主题商店字体（跨域走 root shell 解决）、缩略图预览、分页浏览
  - 下载 mtz 并自动解压提取 `fonts/` 目录字体，日志实时展示（后台运行 + 轮询，避免阻塞 WebUI）
- **等宽/Emoji 修复**：`mono.ttf` 与 `emoji.ttf` 改回**直接替换系统字体**（`DroidSansMono.ttf` / `NotoColorEmoji.ttf`，overlay 生效），不再使用自创独立字体文件（`FontMM-Mono` / `FontMM-Emoji` 不生效）
- **Emoji 槽位完善**：清除 emoji 槽位时从模块 `backup/` 恢复内嵌补充字库 Emoji（安装时自动备份）；旧包更新继承列表补全 `emoji.ttf`

## v26.8.0-beta.2

- **补充字库**：内置 OFL-1.1 / MIT 许可字体，在 `fonts.xml` 末尾作为全局 fallback：
  - PlangothicP1/P2——CJK 扩展区覆盖（Ext-B、G/H、**I、J** 等生僻字与新汉字）
  - PlanschriftSeal——**Seal（小篆）区块 11328 字符 100% 覆盖**（Unicode 18 新增，子集化 34M，MIT/OFL 双许可）
  - ArchaicCuneiformNumerals、NotoUnicode、NotoColorEmoji、UnicodiaFunky、Unknown-symbol 等
- **等宽字体修复**：改为独立文件 `FontMM-Mono.ttf`（monospace 家族优先引用），不再覆盖系统 `DroidSansMono`，解决设置等宽字体后不生效的问题
- **单一源字体配置**：`fonts.xml` 为唯一源，`dev/sync-fonts-xml.sh` 自动生成 `fonts_base.xml` / `fonts_ule.xml` / `font_fallback.xml`
- **Unicode 覆盖测试**：新增 `dev/check-unicode-coverage.py`，本地模拟 fallback 链统计各区块覆盖率
- 致谢补充字库来源 [MakeFontsGreatAgain](https://github.com/Numbersf/MakeFontsGreatAgain)

## v26.8.0-beta.1

全新 v26 架构重构：

- **WebUI 重写**（Material Design 3 + 底部导航）：字体槽位选择/应用、字体测试（字重 100–900、可变字体滑条、字号调节）、关于页、深色模式跟随系统、edge-to-edge 延伸至小白条
- **字体名称解析**：打开 WebUI 时用 opentype.js 读取 FONT/ 内字体的真实名称并显示在卡片（如 OPPO Sans 4.0）
- **双版本打包**：`_preplace`（含预置字体）与 `_template`（FONT 空目录）两版；新增 `build:only-web` 快速调试产物
- **开发工具链**：oxlint / oxfmt / type-check / shellcheck 脚本化
- 新增 MIT LICENSE
