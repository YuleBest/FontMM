# Changelog

## v26.8.0-beta.10

- **修复英文字体子集化实际未生效**（issue #12）：汉字仍会盖掉中文字体。KernelSU 解压不保留 zip 里的执行位，工具在设备上是 0644，而脚本按 `-x` 判断可用性 → 每次都提示「找不到子集化工具」并跳过。改为按文件存在判断、执行前临时加执行位、用完还原；刷入时 `fontmm-wght` 的同类判断失效（派生字体配置未同步）一并修好
- **修复字体选择器**（issue #13）：从 Download 目录返回会跳两级、在其它目录选中字体无效
- **英文槽位显示子集化结果**（issue #14）：卡片上显示「原大小 → 子集大小」并加「已子集化」徽标，一眼能看出裁切生效了
- **修复字体测试页**：编辑测试文本时输入框出现空行（issue #16）；可变字体滑条说明改为明确的「仅预览」措辞（issue #15）
- **修复清空槽位后字重映射轴范围不刷新**：删掉 200-900 的字体后仍被限制在 200-900
- **模块更新后保留用户设置**：字重覆写模式与自定义字重映射此前会在更新时丢失，现在随 `FONTS/` 一起继承
- **移除字体度量改写**：测试版尝试过的「固定行距 & 字距」会导致部分设备**开机失败**，已整体删除。模块不再改动字体本身的度量与包围盒 —— 换字体后行距跟着字体走

## v26.8.0-beta.8

- **修复只选中文（或任一单槽位）字体时 WebUI 状态全空**（issue #11）：槽位与字重覆写被误判为未设置，实际字体已生效
  - 成因：作为字体安装结果的判据，逐槽位复制脚本的最后一行条件失败导致整段退出码非 0
  - 感谢 [@HelloCxin](https://github.com/HelloCxin) 提供详细的复现步骤
- **修复 Zygisk 提供者误判**：安装了 Zygisk Next 时，首页的字体预热器状态可能显示为另一个普通 Zygisk 模块（如 Hide My Applist）
  - 成因：此前以 `zygisk/` 目录判定提供者，而该目录是任何 Zygisk 模块（含本模块自身的消费者角色）都有的标记
  - 现改用提供者专有产物判定（`libzygisk.so` / `zygiskd` / `libzn_loader.so` 等），对照 Zygisk Next 实际安装包核实
- **仓库瘦身**：Pyodide 运行时（约 12MB）不再入库，改由构建脚本从 npm 依赖复制，消除仓库内一份易过期的混淆副本

## v26.8.0-beta.7

- **英文槽位自动子集化**（issue #10）：所选英文字体若自带中文字形，应用时自动裁剪为纯拉丁子集
  - 起因：`fonts.xml` 中西文家族排在中文之前，英文字体自带的汉字会盖掉中文字体，表现为「中文没换干净」；而 Android 的字体配置无法限定某字体只负责英文
  - 只处理英文槽位，中文字体不动；子集化约 21ms，因此不做缓存，每次重算
  - **完整保留可变字体特性**：`fvar` 字重轴、`gvar` 变形数据、`STAT` 与 `GSUB`/`GPOS`/`GDEF` 排版表均不丢失，字重覆写不受影响
  - 工具异常（缺失/损坏/字体无法解析）一律回退为原字体，不阻断字体安装
  - 实测效果：21.7MB 字体 → 223KB（默认保留拉丁/希腊/西里尔，避免缺字显示豆腐块）
- 新增设备端工具 `fontmm-subset`（harfbuzz 静态链接），WebUI 与手动放置字体两条路径均生效

## v26.8.0-beta.6

- **内置字体预加载，不再依赖 Fontloader**：把 Fontloader 的核心逻辑（约 200 行 C++）集成进模块（`native/`，产物 `zygisk/arm64-v8a.so`，6.8KB）
  - 原理：App 进程 specialize 前调用 `Typeface.nativeWarmUpCache()` 把字体预读进系统缓存，使被「卸载模块」的 App 仍能正常渲染字体
  - 只预热 FontMM 自己的字体（编译期常量表），无需 Fontloader 那样的 root companion 进程与 socket IPC
  - 刷入时自动为已安装的外部 Fontloader 添加 `disable` 停用（保留其数据，删除该文件即可恢复）
  - 不再要求用户预先安装 Fontloader（`RikkaW/FontLoader` 已删库，其余分支亦有停更风险）
- **Zygisk 环境检查**：替代原先的 Fontloader 版本检查，识别 Magisk 内置 Zygisk 与独立提供者（Zygisk Next / ReZygisk），缺失时提示而非阻断
- **首页显示字体预热器状态**：直接告知预加载是否生效、依赖哪个 Zygisk 提供者；未生效时说明原因与处理办法（预热失效不会报错，只表现为部分应用字体异常，用户难以自行定位）
- **许可证变更为 GPL-3.0**：因内置部分参考了 GPL-3.0 的 Fontloader 实现
- **构建流程由 shell 改为 Node 脚本**：`dev/*.sh` 全部重写为 `dev/*.mjs`，摆脱对 `zip`/`unzip` 的依赖，Windows / 精简容器 / CI 镜像均可构建
  - 修复 Go 构建不可复现问题（`-trimpath -buildvcs=false`）：原先产物哈希随构建目录与工作树状态变化
  - 修复 SHA256 校验文件写绝对路径导致用户无法 `sha256sum -c` 校验
  - 新增 `pnpm check` 结构校验（含预热字体清单与 `apply.sh` 的一致性检查）
- **修复小米主题字体工具**：搜索此前因响应解析结构与接口不符而恒无结果；下载按钮因未写入主题 ID 而始终失败

## v26.8.0-beta.5

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
