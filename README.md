<h1 align="center">FontMM</h1>

<div align="center">
    一个用于快速更换系统字体的 Magisk 模块，内置 WebUI 以及一些好用的功能
</div>

<div align="center">
  <a href="#特性">特性</a> | <a href="#安装">安装</a> | <a href="#使用">使用</a> |  <a href="#技术细节">开发</a> | <a href="#致谢">致谢</a> | <a href="#许可">许可</a><br>
</div>

## 特性

- Material 风格的管理界面，在支持 WebUI 的 Root 管理器中直接打开
- 多槽位字体分别选择，满足你的个性化需求
- 可变字体 wght 范围与实际字重等级不符时可选择覆写配置，保证正确映射
- 内置字库补充字体，兜底 CJK 扩展区、Unicode 18.0 全覆盖

## 支持环境

| 项目      | 要求                    |
| --------- | ----------------------- |
| 系统      | >= ColorOS 16.0         |
| Root 环境 | Magisk 20.4+ / KernelSU |
| 字体格式  | `.ttf`                  |

## 安装

> 安装完成后，请在系统设置中选择 Roboto 作为字体，这样才能得到正确的字重映射！

### 选择版本

每个 Release 提供两个压缩包，区别仅在于是否预置字体：

| 版本               | FONT 目录                       | 适用场景                                                                    |
| ------------------ | ------------------------------- | --------------------------------------------------------------------------- |
| `..._preplace.zip` | 含预置简体字体 `FONTS/hans.ttf` | **全新安装**：刷入后立即可用默认字体，随后可再在 WebUI 更换                 |
| `..._template.zip` | `FONTS/` 为空目录               | **更新已有模块**：`customize.sh` 会自动从旧模块继承已设置的字体，包体积更小 |

- **首次安装**：用 `_preplace` 版，开箱即用；如果用 `_template` 版，刷入前需先在 `FONT/` 至少放置简体字体 `hans.ttf`，否则 `apply.sh` 会报错并拒绝安装
- **更新已安装的模块**：用 `_template` 版——更新模式会从旧模块的 `FONTS/` 目录继承已设置的字体，无需重新设置字体

### KernelSU 及其分支版本

> KernelSU 的分支版本包括但不限于：SukiSU Ultra, KernelSU Next, ReSukiSU

#### 元模块

如果您的 Root 管理器支持元模块，则必须预先安装一个有效的元模块，这样本模块才能成功挂载并生效，参见：[什么是元模块](https://kernelsu.org/zh_CN/guide/metamodule.html)。

目前经过测试可以与本模块兼容的元模块有：

- [mountify](https://github.com/backslashxx/mountify/releases)

#### 管理器配置

一般而言，如果你**正确安装了 Fontloader**，可以无需关闭「默认卸载模块」以及「卸载模块（内核级）」功能，**但我们始终建议关闭**，因为关闭后模块才能做到尽可能的全场景覆盖。

若您选择不关闭「默认卸载模块」以及「卸载模块（内核级）」功能，则被卸载的应用可能会出现字体不生效的情况，此时您可以通过 App Profile 功能单独关闭该应用的「卸载模块」选项，并重启应用。

### Magisk 及其分支版本

#### WebUI 支持

由于 Magisk 默认是不支持 WebUI 的，这意味着你需要安装一个外置的 WebUI 支持 App，比如：

- [WebUI X Portable](https://github.com/MMRLApp/WebUI-X-Portable)

- [KsuWebUI Standalone](https://github.com/5ec1cff/KsuWebUIStandalone)

### 通用依赖

#### Zygisk

因为 Fontloader 依赖于 Zygisk 进行运行，所以你需要安装一个可用的 Zygisk 实现，例如：

- [Zygisk Next](https://github.com/Dr-TSNG/ZygiskNext/releases)

**如果您选择使用 Zygisk Next，则还需要到其 WebUI 页面中将「排除列表策略」选项更改为「仅还原挂载」**。

#### Fontloader

**我们建议您在安装本模块前预先安装 Fontloader，否则可能出现应用闪退、开机卡第二屏、字体显示错误等严重错误**。

从 Android 12 起，系统加载字体的方式变为了在 App 启动时按需加载，这会导致被管理器卸载模块的 App 找不到字体文件，从而崩溃，**包括 Android 系统 App**。Fontloader 就是用来解决这个问题的，它会在 App 尚未失去字体访问权限时为 App 预加载字体。

由于 `RikkaW/FontLoader` 已经停更，推荐使用：

- [aviraxp/fontloader](https://github.com/KernelSU-Modules-Repo/fontloader/releases)

---

## 使用方法

### 通过 WebUI 更换字体（推荐）

#### 基础配置

1. 打开 KernelSU 或 WebUI 管理器，进入 FontMM 模块的 WebUI 界面，切换至「配置」页面
2. 在槽位中分别选择字体：
   - **中文简体**：**必选**
   - **中文繁体**：可选，未选择时自动使用简体
   - **英文 & 数字**：可选，未选择时自动使用简体
   - **等宽字体**：可选，未选择时不覆盖系统等宽字体
   - **Emoji 表情**：可选，未选择时使用系统默认 Emoji
3. 点击「应用字体」，重启设备后生效

#### 高级配置

##### 字重覆写

当所选字体为可变字体时，可在配置页「字重覆写模式」选择字重映射的处理方式：

- **不处理**：默认，超出范围的字重由系统处理

- **裁切粗细等级**：删除范围外的字重条目

- **平均分配字重**：保留 9 档完整粗细，400 字重不变，两端按范围平均插值

- **自定义映射**：可以自定义 1-1000 字重的映射关系

### 手动放置字体

> 字体的 Fallback 逻辑同上

1. 把字体放入 `/data/adb/modules/FontMM/FONTS/`，命名规则：
   - `hans.ttf`：中文简体（必选）
   - `hant.ttf`：中文繁体（可选）
   - `en.ttf`：英文与数字（可选）
   - `mono.ttf`：等宽字体（可选）
   - `emoji.ttf`：Emoji 表情（可选）
2. 执行 `sh /data/adb/modules/FontMM/apply.sh`
3. 重启设备

---

## 技术细节

### 字体挂载

模块把 5 个用户字体槽位挂载到系统字体文件：

| 槽位        | 用户文件    | 挂载的系统字体文件                                                                                                                 | 回退逻辑（字体缺失时）      |
| ----------- | ----------- | :--------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 中文简体    | `hans.ttf`  | `SysSans-Hans-Regular.ttf`、`SysFont-Static-Regular.ttf`、`SysFont-Myanmar.ttf`、`SysFont-Hans-Regular.ttf`、`SysFont-Regular.ttf` | 拒绝安装和应用              |
| 中文繁体    | `hant.ttf`  | `SysSans-Hant-Regular.ttf`、`SysFont-Hant-Regular.ttf`                                                                             | 使用中文简体字体 `hans.ttf` |
| 英文 & 数字 | `en.ttf`    | `SysSans-En-Regular.ttf`                                                                                                           | 使用中文简体字体 `hans.ttf` |
| 等宽字体    | `mono.ttf`  | `DroidSansMono.ttf`                                                                                                                | 不挂载                      |
| Emoji 表情  | `emoji.ttf` | `NotoColorEmoji.ttf`                                                                                                               | 不挂载                      |

### 补充字库

模块内置一组 OFL-1.1 / MIT 许可的补充字体，作为 `fonts.xml` 末尾的全局 fallback，兜底用户字体与系统字体未覆盖的字形（CJK 扩展区生僻字、最新 Unicode 字符、小篆等）：

| 字体                          | 说明                                                                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PlangothicP1/P2.ttf`         | CJK 扩展区覆盖（Ext-B、G/H、**I、J** 等生僻字与新汉字）                                                                                                                                   |
| `PlanschriftSeal-Regular.ttf` | **Seal（小篆）区块 11328 字符全覆盖**（Unicode 18 新增，子集化 34M；MIT/OFL 双许可，源自 [Planschrift_Project](https://github.com/Fitzgerald-Porthmouth-Koenigsegg/Planschrift_Project)） |
| `NotoSansPro.otf`             | 多 Noto 家族合并，覆盖广泛语言字形                                                                                                                                                        |
| `Unicode16/17/18-new.ttf`     | Unicode 最新版本已定义字符覆盖                                                                                                                                                            |
| `ZUno-Number.ttf`             | 保留符号 / 私用区未定义符号显示编码信息                                                                                                                                                   |

补充字库不参与用户槽位替换，仅在缺字形时按顺序兜底。字体来源与许可详见模块内 `system/fonts/LICENSE-*` 及 [MakeFontsGreatAgain](https://github.com/Numbersf/MakeFontsGreatAgain) 的 LICENSES。

## 工作原理

```
┌─────────────────────────────────────────────────────────┐
│                     KernelSU 管理器                     │
│    ┌──────────────────────────────┐                     │
│    │  WebUI (web/ 构建产物)       │  ksu.exec / toast   │
│    └──────────────┬───────────────┘                     │
└───────────────────┼─────────────────────────────────────┘
                    │ sh /data/adb/modules/FontMM/apply.sh
                    ▼
        ┌───────────────────────┐   cp -f     ┌──────────────────────┐
        │  FONTS/ 用户字体      │ ──────────► │  system/fonts/       │
        │  hans.ttf             │             │  SysFont/SysSans 等  │
        │  hant.ttf (可选)      │             └──────────────────────┘
        │  en.ttf   (可选)      │
        └───────────────────────┘
```

1. **安装阶段**（`customize.sh`）：系统检查（ColorOS 版本、KernelSU 元模块、FontLoader）→ 更新模式检测与旧字体继承 → 调用 `apply.sh` 完成首次字体安装
2. **换字体阶段**（WebUI）：选择文件 → 复制到 `FONTS/` → 调用同一个 `apply.sh`，两条路径行为一致
3. **`apply.sh` 核心逻辑**：按字体映射表把 `FONTS/` 中的字体复制到 `system/fonts/` 的对应文件，缺繁体/英文时回退简体
4. **字体生效**：ColorOS 通过 `/system/etc/fonts.xml` 等配置引用 `SysFont*` / `SysSans*` 字体族，模块内嵌从 ColorOS 16 提取的配置（`fonts.xml` 为唯一源，开发阶段自动生成 `fonts_base.xml` / `fonts_ule.xml` / `font_fallback.xml`），替换字体文件即可全局生效

## 开发指南

### 环境要求

- Node.js ≥ 18 + [pnpm](https://pnpm.io/)
- `zip` / `unzip`
- `shellcheck` + `shfmt`（仅 CI 检查需要）
- `Python 3` + `fontTools`（Unicode 覆盖测试）
- `Golang`
- 任意可运行 `ash` 的环境（验证 shell 脚本）

### 安装依赖

```bash
pnpm install && cd web && pnpm install
```

### 本地预览 WebUI

```bash
pnpm dev
```

`dev` 模式下 `ksu.ts` 使用内置 mock 文件系统，文件选择、槽位切换、应用字体全流程可脱离真机调试。

### 构建与打包

完整构建：

```bash
pnpm build
```

单独构建 WebUI 产物（调试用）：

```bash
pnpm build:only-web      # 产出 dist/webroot.zip
```

### 代码检查

> 前端 lint/format 由 [oxlint](https://oxc.rs/) 与 [oxfmt](https://oxc.rs/) 提供

```bash
pnpm lint        # 前端 oxlint 检查
pnpm fmt         # 前端 oxfmt 格式化
pnpm fmt:check   # 前端 oxfmt 格式检查
bash dev/ci.sh   # src/ 下所有 .sh 的 shellcheck + shfmt 检查
```

### Unicode 覆盖测试

> 本地模拟 `fonts.xml` 的 fallback 链，对照 Unicode Blocks.txt 统计每个区块覆盖率，首次运行会自动下载 Blocks.txt 缓存到 `dev/`

```bash
python3 dev/check-unicode-coverage.py                        # 全部区块
python3 dev/check-unicode-coverage.py "Archaic" "Seal"       # 只测指定区块
```

### 占位字体机制

`src/system/fonts/` 下的 `SysFont*` / `SysSans*` 是 **0 字节占位文件**，避免把大字体文件提交进仓库；安装或应用字体时由 `apply.sh` 用 `FONTS/` 里的真实字体覆盖。

- 开发时可用 `dev/empty_font.sh` 重新生成这些占位文件
- `src/FONTS/hans.ttf` 是内置默认简体字体（仅 preplace 版打包）

## 常见问题

**Q：装完模块后字体没变？**

A：确认系统是 ColorOS 16+，并完成 [安装前的配置](#安装)，记得重启

**Q：更新模块会丢失我设置好的字体吗？**

A：不会，检测到已安装的 FontMM 时会进入更新模式，从旧模块的 `FONTS/` 目录继承字体

## 致谢

- 字体映射与配置文件参考 ColorOS 16 系统字体体系
- 补充字库与 `fonts.xml` fallback 结构参考 [MakeFontsGreatAgain](https://github.com/Numbersf/MakeFontsGreatAgain)
- WebUI 基于 [Material Web](https://github.com/material-components/material-web)（Material Design 3）与 [kernelsu](https://www.npmjs.com/package/kernelsu) 构建

## 许可

[MIT License](./LICENSE)
