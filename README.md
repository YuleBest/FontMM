# FontMM

FontMM 是一个用于在 ColorOS 设备上一键更换系统字体的 **Magisk / KernelSU 模块**，内置 WebUI 字体管理界面。

只需在 WebUI 中挑选一个 `.ttf` 字体文件，点一下「应用字体」，重启即可生效——不需要在电脑上手动解压、改名、打包模块。

> 当前为 v26 架构（WebUI + 统一 `apply.sh` 安装逻辑），旧版 v1.x 的「解压模板 → 放入 ttf → 运行打包脚本」流程已被取代。

## 特性

- **内置 WebUI**：Material Design 3 风格的管理界面，在 KernelSU 管理器（或支持 WebUI 的 Root 管理器）中直接打开
- **五槽位字体**：中文简体 / 中文繁体 / 英文与数字 / 等宽 / Emoji 分别独立设置
- **智能回退**：繁体、英文未设置时自动回退到简体
- **可视化文件选择器**：浏览设备目录、仅显示 `.ttf` 文件
- **安装自检**：刷入时自动校验 ColorOS 版本、KernelSU 元模块、FontLoader 版本
- **更新模式**：覆盖安装/更新模块时自动继承旧版模块中已设置的字体
- **补充字库**：内置 OFL/MIT 许可字体，兜底 CJK 扩展区、最新 Unicode 字符与小篆（Seal）等罕见字形

## 支持环境

| 项目      | 要求                                                                                      |
| --------- | ----------------------------------------------------------------------------------------- |
| 系统      | ColorOS 16.0+（检测 `ro.build.version.oplus.api` 与 `ro.build.version.oplusrom.display`） |
| Root 环境 | Magisk 20.4+ / KernelSU（KernelSU ≥ 3.0.0 需先安装元模块）                                |
| 推荐组件  | [FontLoader](https://github.com/KernelSU-Modules-Repo/fontloader) v1.2.3+（提升字体显示） |
| 字体格式  | `.ttf`（支持可变字体）                                                                    |

> 非 ColorOS 系统、ColorOS 版本低于 16 的设备会在安装时被 `customize.sh` 直接拒绝。

## 安装

### 选择版本

每个 Release 提供两个压缩包，区别仅在是否预置字体：

| 版本                    | FONT 目录                                  | 适用场景                                                                    |
| ----------------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| `FontMM_*_preplace.zip` | 含预置简体字体 `FONTS/hans.ttf`（约 20MB） | **全新安装**：刷入后立即可用默认字体，随后可再在 WebUI 更换                 |
| `FontMM_*_template.zip` | `FONTS/` 为空目录（约 3MB）                | **更新已有模块**：`customize.sh` 会自动从旧模块继承已设置的字体，包体积更小 |

选择建议：

- **首次安装**：用 `_preplace` 版，开箱即用；如果用 `_template` 版，刷入后需先在 WebUI 设置简体字体，否则 `apply.sh` 会因缺少 `hans.ttf` 报错。
- **更新已安装的模块**：用 `_template` 版——更新模式会从旧模块的 `FONTS/` 目录继承 `hans.ttf` / `hant.ttf` / `en.ttf` / `mono.ttf` / `emoji.ttf`，无需重新设置字体，也不浪费下载预置字体。
- 在线更新（KernelSU 管理器检测到新版本时）走 `update.json`，其 `zipUrl` 指向 `_template` 版，行为同上。

### 安装步骤

1. 按上述说明下载对应版本（`FontMM_v*.zip`）
2. 在 KernelSU / Magisk 管理器中刷入该 zip（无需解压）
3. 安装脚本自动完成系统检查与字体安装，日志会给出「成功 / 失败原因」
4. **重启设备**

## 使用

### 通过 WebUI 更换字体

1. 打开 KernelSU 管理器，进入 FontMM 模块，点击「打开 WebUI」
2. 在槽位中分别选择字体：
   - **中文简体**——必选
   - **中文繁体**——可选，未选择时自动使用简体
   - **英文 & 数字**——可选，未选择时自动使用简体
   - **等宽字体**——可选，未选择时不覆盖系统等宽字体
   - **Emoji 表情**——可选，未选择时使用系统默认 Emoji
3. 点击「应用字体」，弹窗展示完整应用日志
4. **重启设备**后生效

### 手动放置字体（可选）

1. 把字体放入 `/data/adb/modules/FontMM/FONTS/`，命名规则：
   - `hans.ttf`——中文简体（必选）
   - `hant.ttf`——中文繁体（可选）
   - `en.ttf`——英文与数字（可选）
   - `mono.ttf`——等宽字体（可选）
   - `emoji.ttf`——Emoji 表情（可选）
2. 在 Root 管理器中点击本模块的「执行」（Action），或执行 `sh /data/adb/modules/FontMM/apply.sh`
3. 重启设备

## 字体映射

模块把 5 个用户字体槽位映射到 ColorOS 的系统字体文件：

| 槽位        | 用户文件          | 覆盖的系统字体文件                                                                                                                 |
| ----------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 中文简体    | `FONTS/hans.ttf`  | `SysSans-Hans-Regular.ttf`、`SysFont-Static-Regular.ttf`、`SysFont-Myanmar.ttf`、`SysFont-Hans-Regular.ttf`、`SysFont-Regular.ttf` |
| 中文繁体    | `FONTS/hant.ttf`  | `SysSans-Hant-Regular.ttf`、`SysFont-Hant-Regular.ttf`                                                                             |
| 英文 & 数字 | `FONTS/en.ttf`    | `SysSans-En-Regular.ttf`                                                                                                           |
| 等宽字体    | `FONTS/mono.ttf`  | `DroidSansMono.ttf`（直接替换系统等宽字体；未设置时移除模块内该文件，恢复系统原字体）         |
| Emoji 表情  | `FONTS/emoji.ttf` | `NotoColorEmoji.ttf`（直接替换系统 Emoji；未设置时从模块备份恢复默认，见下）                     |

**回退规则**：`hant.ttf` / `en.ttf` 缺失时对应槽位自动使用 `hans.ttf`；`hans.ttf` 缺失时 `apply.sh` 直接报错退出（WebUI 也会禁用「应用」按钮）。`mono.ttf` 未设置时**恢复**系统等宽字体（移除模块内 `DroidSansMono.ttf`，overlay 机制自动还原系统原文件）。`emoji.ttf` 未设置时**恢复**默认 Emoji（模块安装时已备份内嵌补充字库 `NotoColorEmoji.ttf` 到模块 `backup/`，清除槽位时自动还原；全新安装未设置时直接使用补充字库内嵌 Emoji）。

> 注意：等宽字体若不含中文字形，等宽区域的中文会按系统机制回退到中文字体（属正常 fallback）。如需等宽中文，请使用含中文字形的等宽字体（如 Sarasa、Maple Mono 等）。

### 补充字库

模块内置一组补充字体（OFL-1.1 / MIT 许可），作为 `fonts.xml` 末尾的全局 fallback，兜底用户字体与系统字体未覆盖的字形（CJK 扩展区生僻字、最新 Unicode 字符、小篆等）：

| 字体                          | 说明                                                                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PlangothicP1/P2.ttf`         | CJK 扩展区覆盖（Ext-B、G/H、**I、J** 等生僻字与新汉字）                                                                                                                                   |
| `PlanschriftSeal-Regular.ttf` | **Seal（小篆）区块 11328 字符全覆盖**（Unicode 18 新增，子集化 34M；MIT/OFL 双许可，源自 [Planschrift_Project](https://github.com/Fitzgerald-Porthmouth-Koenigsegg/Planschrift_Project)） |
| `NotoSansPro.otf`             | 多 Noto 家族合并，覆盖广泛语言字形                                                                                                                                                        |
| `Unicode16/17/18-new.ttf`     | Unicode 最新版本已定义字符覆盖                                                                                                                                                            |
| `ZUno-Number.ttf`             | 保留符号 / 私用区未定义符号显示编码信息                                                                                                                                                   |

补充字库不参与用户槽位替换（`SysFont*` / `SysSans*` 槽位规则不变），仅在缺字形时按顺序兜底。字体来源与许可详见模块内 `system/fonts/LICENSE-*` 及 [MakeFontsGreatAgain](https://github.com/Numbersf/MakeFontsGreatAgain) 的 LICENSES。

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
        │  hans.ttf             │             │  SysFont/SysSans 等  │
        │  hant.ttf (可选)      │             └──────────────────────┘
        │  en.ttf   (可选)      │
        └───────────────────────┘
```

1. **安装阶段**（`customize.sh`）：系统检查（ColorOS 版本、KernelSU 元模块、FontLoader）→ 更新模式检测与旧字体继承 → 调用 `apply.sh` 完成首次字体安装。
2. **换字体阶段**（WebUI）：选择文件 → 复制到 `FONTS/` → 调用同一个 `apply.sh`，两条路径行为一致。
3. **`apply.sh` 核心逻辑**：按字体映射表把 `FONTS/` 中的字体复制到 `system/fonts/` 的对应文件，缺繁体/英文时回退简体。
4. **字体生效**：ColorOS 通过 `/system/etc/fonts.xml` 等配置引用 `SysFont*` / `SysSans*` 字体族——模块内嵌从 ColorOS 16 提取的配置（`fonts.xml` 为唯一源，开发阶段自动生成 `fonts_base.xml` / `fonts_ule.xml` / `font_fallback.xml`），替换字体文件即可全局生效。

## 项目结构

```
FontMM/
├── src/                        # Magisk 模块源（打包时 zip 根 = 模块根）
│   ├── module.prop             # 模块元信息（id/version/updateJson）
│   ├── customize.sh            # 安装脚本：系统检查 + 更新模式 + 调用 apply.sh
│   ├── apply.sh                # 字体应用脚本（安装 & WebUI 共用）
│   ├── FONTS/                  # 用户字体目录（preplace 版含默认 hans.ttf）
│   ├── META-INF/               # Magisk 安装入口（update-binary / updater-script）
│   ├── system/
│   │   ├── fonts/              # 字体槽位 + 补充字库（占位文件安装时被填充）
│   │   └── etc/                # fonts.xml / fonts_base.xml / fonts_ule.xml / font_fallback.xml
│   ├── system_ext/etc/         # system_ext 分区字体配置（fonts_base.xml / fonts_ule.xml）
│   └── webroot/                # WebUI 构建产物（pnpm build 生成，不入库）
├── web/                        # WebUI 前端源码（Vite + TypeScript）
│   ├── index.html
│   ├── vite.config.ts          # base './'，产物输出到 ../src/webroot
│   └── src/
│       ├── main.ts             # 主界面：字体槽位 + 应用 + 日志
│       ├── fontPicker.ts       # 字体文件选择器
│       ├── ksu.ts              # kernelsu API 封装（DEV 模式内置 mock）
│       ├── theme.scss          # Material Design 3 主题变量
│       └── style.scss          # 全局样式
├── dev/                        # 开发脚本
│   ├── cd.sh                   # 打包模块 zip（preplace / template 两版）→ dist/
│   ├── ci.sh                   # shellcheck + shfmt 检查
│   ├── webzip.sh               # 仅打包 WebUI 产物 → dist/webroot.zip
│   ├── sync-fonts-xml.sh       # 以 fonts.xml 为唯一源生成派生字体配置
│   ├── check-unicode-coverage.py # 本地模拟字体 fallback, 统计 Unicode 区块覆盖
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
- Python 3 + fontTools（Unicode 覆盖测试）
- Android 设备（Termux）或任意可运行 `ash` 的环境（验证 shell 脚本）

### 安装依赖

```bash
pnpm install          # 根 workspace（会联动安装 web/）
```

### 本地预览 WebUI

```bash
pnpm dev
```

`dev` 模式下 `ksu.ts` 使用内置 mock 文件系统，文件选择、槽位切换、应用字体全流程可脱离真机调试。

### 构建与打包

```bash
pnpm build
```

依次执行：

1. `vite build`——把 WebUI 构建到 `src/webroot/`（相对路径，适配本地 WebView 加载）
2. `bash dev/cd.sh`——读取 `src/module.prop` 的 `version` 字段，打包出两个版本（zip 根 = 模块根）：
   - `dist/FontMM_v{VERSION}_preplace.zip`——含预置字体 `FONTS/hans.ttf`
   - `dist/FontMM_v{VERSION}_template.zip`——`FONTS/` 为空目录

   产物均校验内含 `module.prop`；template 版额外校验 `FONTS/` 下不含字体文件。打包前会自动同步派生字体 XML（`sync-fonts-xml.sh`）。

单独构建 WebUI 产物（调试用）：

```bash
pnpm build:only-web      # 产出 dist/webroot.zip
```

### 代码检查

```bash
pnpm lint        # 前端 oxlint 检查 (web/src)
pnpm fmt         # 前端 oxfmt 格式化
pnpm fmt:check   # 前端 oxfmt 格式检查
bash dev/ci.sh   # src/ 下所有 .sh 的 shellcheck + shfmt 检查
```

前端 lint/format 由 [oxlint](https://oxc.rs/) 与 [oxfmt](https://oxc.rs/) 提供。

### Unicode 覆盖测试

```bash
python3 dev/check-unicode-coverage.py                        # 全部区块
python3 dev/check-unicode-coverage.py "Archaic" "Seal"       # 只测指定区块
```

本地模拟 `fonts.xml` 的 fallback 链（fontTools 读取 `src/system/fonts/` 各字体 cmap），对照 Unicode Blocks.txt 统计每个区块覆盖率（首次运行自动下载 Blocks.txt 缓存到 `dev/`）。

### 占位字体机制

`src/system/fonts/` 下的 `SysFont*` / `SysSans*` 是 **0 字节占位文件**，避免把大字体文件提交进仓库；安装或应用字体时由 `apply.sh` 用 `FONTS/` 里的真实字体覆盖。

- 开发时可用 `dev/empty_font.sh` 重新生成这些占位文件
- `src/FONTS/hans.ttf` 是内置默认简体字体（仅 preplace 版打包）

## 常见问题

**Q：装完模块后字体没变？**

A：先重启设备；确认系统是 ColorOS 16+；建议安装 [FontLoader](https://github.com/KernelSU-Modules-Repo/fontloader)（v1.2.3+）。

**Q：KernelSU 3.0+ 装不上 / 报元模块错误？**

A：KernelSU ≥ 3.0.0 需要先安装元模块（`/data/adb/metamodule/module.prop`），安装日志会明确提示。

**Q：更新模块会丢失我设置好的字体吗？**

A：不会。`customize.sh` 检测到已安装的 FontMM 时会进入更新模式，从旧模块的 `FONTS/` 目录继承 `hans.ttf` / `hant.ttf` / `en.ttf` / `mono.ttf` / `emoji.ttf`。

**Q：`system/fonts/` 里的字体文件为什么是 0 字节？**

A：那是占位文件，安装或应用字体时会被真实字体覆盖（见「占位字体机制」）。

**Q：等宽字体设置了但不生效 / 显示成了简体字体？**

A：确认已重启；等宽字体不含中文字形时，等宽区域的中文会按系统机制回退到中文字体（正常行为），请使用含中文的等宽字体（Sarasa、Maple Mono 等）。

## 致谢

- 字体映射与配置文件参考 ColorOS 16 系统字体体系（`SysFont` / `SysSans` 字体族）
- 补充字库与 `fonts.xml` fallback 结构参考 [MakeFontsGreatAgain](https://github.com/Numbersf/MakeFontsGreatAgain)（Unicode Latest 全覆盖思路）
- WebUI 基于 [Material Web](https://github.com/material-components/material-web)（Material Design 3）与 [kernelsu](https://www.npmjs.com/package/kernelsu) SDK 构建
