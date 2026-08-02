# FontMM

FontMM 是一个用于在 Android 设备上一键更换系统字体的 **Magisk / KernelSU 模块**，内置 WebUI 字体管理界面，目前适配 **ColorOS 16**。

只需在 WebUI 中挑选一个 `.ttf` 字体文件，点一下「应用字体」，重启即可生效 —— 不需要在电脑上手动解压、改名、打包模块。

> 当前分支为 v26 全新架构（WebUI + 统一 `apply.sh` 安装逻辑），旧版 v1.x 的「解压模板 → 放入 ttf → 运行打包脚本」流程已被取代。

## 特性

- 🖥️ **内置 WebUI**：Material Design 3 风格的管理界面，在 KernelSU 管理器（或支持 WebUI 的 Root 管理器）中直接打开
- 🎯 **三槽位字体**：中文简体 / 中文繁体 / 英文与数字分别独立设置
- 🔄 **智能回退**：繁体、英文未设置时自动回退到简体，不会出现「缺字」或「没换成功」的情况
- 📁 **可视化文件选择器**：浏览设备目录、一键过滤非 `.ttf` 文件
- 🛡️ **安装自检**：刷入时自动校验 ColorOS 版本、KernelSU 元模块、FontLoader 版本
- ♻️ **更新模式**：覆盖安装/更新模块时自动继承旧版模块中已设置的字体
- 📦 **统一安装逻辑**：WebUI 换字体与刷机安装共用同一个 `apply.sh`，行为完全一致

## 支持环境

| 项目 | 要求 |
| --- | --- |
| 系统 | ColorOS 16.0+（检测 `ro.build.version.oplus.api` 与 `ro.build.version.oplusrom.display`） |
| Root 环境 | Magisk 20.4+ / KernelSU（KernelSU ≥ 3.0.0 需先安装元模块） |
| 推荐组件 | [FontLoader](https://github.com/KernelSU-Modules-Repo/fontloader) v1.2.3+（提升字体显示效果） |
| 字体格式 | `.ttf`（支持可变字体） |

> 非 ColorOS 系统、ColorOS 版本低于 16 的设备会在安装时被 `customize.sh` 直接拒绝。

## 快速开始（用户）

### 1. 安装模块

1. 在 [Releases](https://github.com/YuleBest/FontMM/releases) 下载最新版 `FontMM_v*.zip`
2. 在 KernelSU / Magisk 管理器中刷入该 zip（无需解压）
3. 安装脚本会自动完成系统检查，并给出「成功 / 失败原因」

### 2. 通过 WebUI 更换字体

1. 打开 KernelSU 管理器，进入 FontMM 模块，点击「**打开 WebUI**」（或类似入口）
2. 在三个槽位中分别选择字体：
   - **中文简体** —— 必选
   - **中文繁体** —— 可选，未选择时自动使用简体
   - **英文 & 数字** —— 可选，未选择时自动使用简体
3. 点击底部「**应用字体**」，等待执行完成
4. 弹窗中会展示完整应用日志（每个系统字体文件的安装结果）
5. **重启设备**后生效

### 3. 手动放置字体（可选）

不想用 WebUI 时，也可以直接操作文件：

1. 把字体放入 `/data/adb/modules/FontMM/FONTS/`，命名规则：
   - `hans.ttf` —— 中文简体（必选）
   - `hant.ttf` —— 中文繁体（可选）
   - `en.ttf` —— 英文与数字（可选）
2. 在 Root 管理器中点击本模块的「**执行**」（Action），或执行 `sh /data/adb/modules/FontMM/apply.sh`
3. 重启设备

## 字体映射

模块把 3 个用户字体槽位映射到 ColorOS 的 8 个系统字体文件：

| 槽位 | 用户文件 | 覆盖的系统字体文件 |
| --- | --- | --- |
| 中文简体 | `FONTS/hans.ttf` | `SysSans-Hans-Regular.ttf`、`SysFont-Static-Regular.ttf`、`SysFont-Myanmar.ttf`、`SysFont-Hans-Regular.ttf`、`SysFont-Regular.ttf` |
| 中文繁体 | `FONTS/hant.ttf` | `SysSans-Hant-Regular.ttf`、`SysFont-Hant-Regular.ttf` |
| 英文 & 数字 | `FONTS/en.ttf` | `SysSans-En-Regular.ttf` |
| 等宽字体 | `FONTS/mono.ttf` | `DroidSansMono.ttf` |

**回退规则**：`hant.ttf` / `en.ttf` 缺失时，对应槽位自动使用 `hans.ttf`；`hans.ttf` 缺失时 `apply.sh` 直接报错退出（WebUI 也会禁用「应用」按钮）。`mono.ttf` 未设置时**不覆盖**系统等宽字体（`DroidSansMono.ttf` 保持系统原生）。

## 工作原理

```
┌─────────────────────────────────────────────────────────┐
│                     KernelSU 管理器                       │
│    ┌──────────────────────────────┐                      │
│    │  WebUI (web/ 构建产物)       │  ksu.exec / toast     │
│    └──────────────┬───────────────┘                      │
└───────────────────┼──────────────────────────────────────┘
                    │ sh /data/adb/modules/FontMM/apply.sh
                    ▼
        ┌───────────────────────┐   cp -f     ┌──────────────────────┐
        │  FONTS/ 用户字体      │ ──────────► │  system/fonts/       │
        │  hans.ttf             │             │  8 个 SysFont 文件   │
        │  hant.ttf (可选)      │             └──────────────────────┘
        │  en.ttf   (可选)      │
        └───────────────────────┘
```

1. **安装阶段**（`customize.sh`）：系统检查（ColorOS 版本、KernelSU 元模块、FontLoader）→ 更新模式检测与旧字体继承 → 调用 `apply.sh` 完成首次字体安装。
2. **换字体阶段**（WebUI）：选择文件 → 复制到 `FONTS/` → 调用同一个 `apply.sh`，保证两条路径行为一致。
3. **`apply.sh` 核心逻辑**：按上表的映射关系，把 `FONTS/` 中的字体 `cp` 到 `system/fonts/` 的对应文件，缺繁体/英文时回退简体。
4. **字体生效**：ColorOS 通过 `/system/etc/fonts.xml`、`fonts_base.xml`、`fonts_ule.xml`、`font_fallback.xml`（及 `/system/system_ext/etc/` 下的对应文件）引用 `SysFont*` / `SysSans*` 字体族 —— 模块内嵌了从 ColorOS 16 提取的这些配置，替换字体文件即可全局生效。

## 项目结构

```
FontMM/
├── src/                        # Magisk 模块源（打包时 zip 根 = 模块根）
│   ├── module.prop             # 模块元信息（id/version/updateJson）
│   ├── customize.sh            # 安装脚本：系统检查 + 更新模式 + 调用 apply.sh
│   ├── apply.sh                # 字体应用脚本（安装 & WebUI 共用）
│   ├── FONTS/                  # 用户字体目录（hans.ttf 默认字体）
│   ├── META-INF/               # Magisk 安装入口（update-binary / updater-script）
│   ├── system/
│   │   ├── fonts/              # 8 个字体槽位（0 字节占位，安装时被填充）
│   │   └── etc/                # fonts.xml / fonts_base.xml / fonts_ule.xml / font_fallback.xml
│   ├── system_ext/etc/         # system_ext 分区字体配置（fonts_base.xml / fonts_ule.xml）
│   └── webroot/                # WebUI 构建产物（pnpm build 生成，不入库）
├── web/                        # WebUI 前端源码（Vite + TypeScript）
│   ├── index.html
│   ├── vite.config.ts          # base './'，产物输出到 ../src/webroot
│   └── src/
│       ├── main.ts             # 主界面：三槽位 + 应用按钮 + 日志弹窗
│       ├── fontPicker.ts       # 字体文件选择器（.ttf 过滤、目录导航）
│       ├── ksu.ts              # kernelsu exec/toast 封装（DEV 模式内置 mock）
│       ├── theme.scss          # Material Design 3 主题变量
│       └── style.scss          # 全局样式
├── dev/                        # 开发脚本
│   ├── cd.sh                   # 打包模块 zip（preplace / template 两版）→ dist/
│   ├── ci.sh                   # shellcheck + shfmt 检查（在 Termux 中运行）
│   ├── webzip.sh               # 仅打包 WebUI 产物 → dist/webroot.zip
│   └── empty_font.sh           # 生成 0 字节占位字体
├── package.json                # pnpm workspace 根
├── web/package.json            # WebUI 依赖与脚本
└── dist/                       # 打包产物（构建时生成，不入库）
```

## 开发指南

### 环境要求

- Node.js ≥ 18 + [pnpm](https://pnpm.io/)
- `zip` / `unzip`（打包）
- `shellcheck` + `shfmt`（仅 CI 检查需要）
- Android 设备（Termux）或任意可运行 `ash` 的环境（验证 shell 脚本）

### 安装依赖

```bash
pnpm install          # 根 workspace（会联动安装 web/）
```

### 本地预览 WebUI

```bash
pnpm dev
```

启动 Vite dev server，浏览器打开后即可预览。`dev` 模式下 `ksu.ts` 使用内置 **mock 文件系统**（`/sdcard`、`/sdcard/Fonts` 等假目录与字体），文件选择、槽位切换、应用字体全流程均可脱离真机调试。

### 构建与打包

```bash
pnpm build
```

依次执行：

1. `vite build` —— 把 WebUI 构建到 `src/webroot/`（相对路径 `base: './'`，适配本地 WebView 加载）
2. `bash dev/cd.sh` —— 读取 `src/module.prop` 的 `version` 字段，打包出两个版本（zip 根 = 模块根）：
   - `dist/FontMM_v{VERSION}_preplace.zip` —— 含预置字体 `FONTS/hans.ttf`
   - `dist/FontMM_v{VERSION}_template.zip` —— `FONTS/` 为空目录（不含预置字体）

   产物均校验内含 `module.prop` 防止打包错目录；template 版额外校验 `FONTS/` 下不含字体文件。

产物示例：`dist/FontMM_v26.8.0(260800001)_preplace.zip`（注意版本号带括号，shell 中使用请加引号）。

### 代码检查

```bash
pnpm lint        # 前端 oxlint 检查 (web/src)
pnpm fmt         # 前端 oxfmt 格式化
pnpm fmt:check   # 前端 oxfmt 格式检查 (CI 用)
bash dev/ci.sh   # src/ 下所有 .sh 的 shellcheck + shfmt 检查
```

- 前端 lint/format 由 [oxlint](https://oxc.rs/) 与 [oxfmt](https://oxc.rs/) 提供，配置在 `web/.oxlintrc.json`（`correctness` 类别 + typescript/unicorn/oxc 插件）与 `web/.oxfmtrc.json`（`singleQuote: true`，与代码风格一致）
- `dev/ci.sh` 对 `src/` 下所有 `.sh` 依次执行 `shellcheck` 校验与 `shfmt` 格式检查（`-i 4`）。脚本预设了 Termux 的 PATH/`LD_LIBRARY_PATH`，可在 Android 的 Termux 中直接运行

### 占位字体机制

`src/system/fonts/` 下的 8 个字体文件是 **0 字节占位文件**，避免把大字体文件提交进仓库；模块安装或应用字体时由 `apply.sh` 用 `FONTS/` 里的真实字体覆盖。

- 开发时可用 `dev/empty_font.sh` 重新生成这些占位文件（字体清单与 `apply.sh` 保持一致）
- `src/FONTS/hans.ttf` 是内置默认简体字体（随模块发布），未继承到旧字体时的兜底

### 版本号

版本号只维护在 `src/module.prop` 中：

```
version=26.8.0(260800001)
versionCode=26080001
```

`dev/cd.sh` 会解析 `version` 字段作为 zip 文件名（`_preplace` / `_template` 两个后缀），无需手动改别处。

## 常见问题

**Q：装完模块后字体没变？**
A：先重启设备；确认系统是 ColorOS 16+；建议安装 [FontLoader](https://github.com/KernelSU-Modules-Repo/fontloader)（v1.2.3+），部分场景下能显著改善字体显示效果。

**Q：KernelSU 3.0+ 装不上 / 报元模块错误？**
A：KernelSU ≥ 3.0.0 需要先安装元模块（`/data/adb/metamodule/module.prop`），安装日志会明确提示。

**Q：选了繁体 / 英文字体但界面还是简体？**
A：检查对应槽位是否真的选了文件；未选择时按设计会回退到简体。

**Q：更新模块会丢失我设置好的字体吗？**
A：不会。`customize.sh` 检测到已安装的 FontMM 时会进入更新模式，从旧模块的 `FONTS/` 目录继承 `hans.ttf` / `hant.ttf` / `en.ttf`。

**Q：`system/fonts/` 里的字体文件为什么是 0 字节？**
A：那是占位文件，安装或应用字体时会被真实字体覆盖，详见「占位字体机制」。

**Q：zip 文件名里的括号在终端里打不开？**
A：版本号形如 `26.8.0(260800001)`，在 shell 中请用引号包裹：`unzip "FontMM_v26.8.0(260800001)_preplace.zip"`。

## 致谢

- 字体映射与配置文件参考 ColorOS 16 系统字体体系（`SysFont` / `SysSans` 字体族）
- WebUI 基于 [Material Web](https://github.com/material-components/material-web)（Material Design 3）与 [kernelsu](https://www.npmjs.com/package/kernelsu) SDK 构建
