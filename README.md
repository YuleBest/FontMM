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

本模块已**内置字体预加载**，可以无需关闭「默认卸载模块」以及「卸载模块（内核级）」功能，**但我们始终建议关闭**，因为关闭后模块才能做到尽可能的全场景覆盖。

若您选择不关闭「默认卸载模块」以及「卸载模块（内核级）」功能，则被卸载的应用可能会出现字体不生效的情况，此时您可以通过 App Profile 功能单独关闭该应用的「卸载模块」选项，并重启应用。

> 若您此前安装过 Fontloader，刷入本模块时会自动为其添加 `disable` 文件停用（不影响其数据，删除该文件即可恢复），两者功能重叠无需同时启用。

### Magisk 及其分支版本

#### WebUI 支持

由于 Magisk 默认是不支持 WebUI 的，这意味着你需要安装一个外置的 WebUI 支持 App，比如：

- [WebUI X Portable](https://github.com/MMRLApp/WebUI-X-Portable)

- [KsuWebUI Standalone](https://github.com/5ec1cff/KsuWebUIStandalone)

### 通用依赖

#### Zygisk

本模块的字体预加载依赖 Zygisk 运行，因此需要一个可用的 Zygisk 实现：

- Magisk 用户：在设置中启用内置的 Zygisk
- KernelSU 用户：安装独立的 Zygisk 提供者，例如 [Zygisk Next](https://github.com/Dr-TSNG/ZygiskNext/releases) 或 [ReZygisk](https://github.com/PerformanC/ReZygisk/releases)

**如果您选择使用 Zygisk Next，则还需要到其 WebUI 页面中将「排除列表策略」选项更改为「仅还原挂载」**。

> 注意：Magisk 内置 Zygisk 与独立 Zygisk 提供者不可同时启用；使用 ReZygisk 等独立实现时请关闭 Magisk 内置 Zygisk。

#### 为什么不再需要 Fontloader

从 Android 12 起，系统加载字体的方式变为了在 App 启动时按需加载，这会导致被 Root 管理器卸载模块的 App 找不到字体文件，从而崩溃，**包括 Android 系统 App**。

Fontloader 这类模块的作用就是在 App 尚未失去字体访问权限时，抢先让系统把字体读入缓存。**本模块已把这套逻辑内置**（`native/`，约 200 行 C++），因此：

- 无需再安装任何外部 Fontloader（`RikkaW/FontLoader` 已删库，`aviraxp/fontloader` 和 `JingMatrix/FontLoader` 亦有停更风险）
- 不会因上游模块停更 / 删库而失效

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

### 校验模块完整性

每个模块包都附带可执行文件的 SHA256 校验（`SHA256SUMS`），可在一键校验模块内脚本/二进制是否被篡改或损坏：

```sh
sh /data/adb/modules/FontMM/tools/verify-sha256.sh
```

GitHub Release 的 zip 附件旁均提供 `.sha256` 校验文件，可用 `sha256sum -c` 在本地验证下载完整性。

---

## 技术细节

### 字体挂载

模块把 5 个用户字体槽位挂载到系统字体文件：

| 槽位        | 用户文件    | 挂载的系统字体文件                                                                                                                 | 回退逻辑（字体缺失时）      |
| ----------- | ----------- | :--------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 中文简体    | `hans.ttf`  | `SysSans-Hans-Regular.ttf`、`SysFont-Static-Regular.ttf`、`SysFont-Myanmar.ttf`、`SysFont-Hans-Regular.ttf`                       | 拒绝安装和应用              |
| 中文繁体    | `hant.ttf`  | `SysSans-Hant-Regular.ttf`、`SysFont-Hant-Regular.ttf`                                                                             | 使用中文简体字体 `hans.ttf` |
| 英文 & 数字 | `en.ttf`    | `SysSans-En-Regular.ttf`、`SysFont-Regular.ttf`                                                                                    | 使用中文简体字体 `hans.ttf` |
| 等宽字体    | `mono.ttf`  | `DroidSansMono.ttf`                                                                                                                | 不挂载                      |
| Emoji 表情  | `emoji.ttf` | `NotoColorEmoji.ttf`                                                                                                               | 不挂载                      |

> 注：`SysFont-Regular.ttf` 是 `fonts.xml` 中 `sans-serif` 家族默认字体，由英文槽位填充（未设置时回退简体）。西文字体在配置中排在最前，中文字体自带的西文字形仅作兜底，避免中文完全覆盖西文（issue #6）。

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

1. **安装阶段**（`customize.sh`）：系统检查（ColorOS 版本、KernelSU 元模块、Zygisk 环境）→ 停用重叠的外部 Fontloader → 更新模式检测与旧字体继承 → 扫描设备系统 XML 生成派生字体配置 → 调用 `apply.sh` 完成首次字体安装
2. **换字体阶段**（WebUI）：选择文件 → 复制到 `FONTS/` → 调用同一个 `apply.sh`，两条路径行为一致
3. **`apply.sh` 核心逻辑**：按字体映射表把 `FONTS/` 中的字体复制到 `system/fonts/` 的对应文件，缺繁体/英文时回退简体
4. **字体生效**：ColorOS 通过 `/system/etc/fonts.xml` 等配置引用 `SysFont*` / `SysSans*` 字体族，模块只内置 `fonts.xml` 主配置，各派生配置（`fonts_base.xml` / `fonts_ule.xml` / `font_fallback.xml`）由安装时扫描设备系统 XML 生成（缺失时回退内置），字重覆写时 `fontmm-wght -sync` 统一同步，提升跨 ColorOS 版本兼容性
5. **字体预加载**（`zygisk/arm64-v8a.so`）：App 进程 specialize 前，模块把 FontMM 的字体文件预读进系统字体缓存，使被「卸载模块」的 App 仍能正常渲染字体

## 开发指南

### 环境要求

- **Node.js ≥ 18** + [pnpm](https://pnpm.io/)（构建脚本全部为 Node 脚本，不再依赖 shell 工具链）
- `Golang`（编译字重覆写工具 `fontmm-wght`）
- **Android NDK**（编译 Zygisk 字体预加载模块 `zygisk/arm64-v8a.so`）
- `Python 3` + `fontTools`（仅 Unicode 覆盖测试需要）
- `shellcheck` + `shfmt`（可选，装上后 `pnpm check` 会额外检查 `src/` 下的 shell 脚本）

NDK 通过环境变量 `ANDROID_NDK_HOME` 指定，或放在以下位置之一（按优先级）：
`~/opt/android-ndk-r27c`、`~/Android/Sdk/ndk`、`/opt/android-ndk`。

```bash
# 下载 NDK (约 630MB)
curl -LO https://dl.google.com/android/repository/android-ndk-r27c-linux.zip
unzip android-ndk-r27c-linux.zip -d ~/opt/
```

> 构建流程不再需要 `zip` / `unzip` 命令：打包由 Node 脚本调用 [@zip.js/zip.js](https://github.com/gildas-lormeau/zip.js) 完成，
> 在 Windows、精简容器与各类 CI 镜像中均可直接运行。

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

完整构建（WebUI + 模块打包）：

```bash
pnpm build
```

产出 `dist/FontMM_v<版本>_preplace.zip` 与 `_template.zip` 两个模块包，以及对应的 `.sha256` 校验文件。

单独执行某一步：

```bash
pnpm -C web build        # 仅构建 WebUI 到 src/webroot
pnpm run pack            # 仅打包模块 (含 Go/C++ 交叉编译, 生成 .sha256)
pnpm build:only-web      # 仅打包 WebUI 产物 -> dist/webroot.zip (调试用)
pnpm go:build            # 仅交叉编译 fontmm-wght -> src/tools/
pnpm zygisk:build        # 仅交叉编译 Zygisk 模块 -> src/zygisk/
```

> 注意用 `pnpm run pack` 而非 `pnpm pack`——后者是 pnpm 内置的 npm 包打包命令。

构建脚本位于 `dev/`，公共逻辑在 `dev/lib/`：

| 脚本 | 作用 |
| ---- | ---- |
| `dev/pack.mjs` | 模块打包主流程（编译 Go/C++ → 生成校验表 → 打包两版 → 校验产物） |
| `dev/webzip.mjs` | 仅打包 WebUI 产物 |
| `dev/gen-sha256.mjs` | 生成 `src/SHA256SUMS` 与 `dist/*.zip.sha256` |
| `dev/build-wght.mjs` | 交叉编译 `fontmm-wght`（android/arm64） |
| `dev/build-zygisk.mjs` | 交叉编译 Zygisk 字体预加载模块（android/arm64-v8a） |
| `dev/ci.mjs` | 代码检查（结构校验 + shellcheck/shfmt + 前端 lint/format/类型） |
| `dev/empty-font.mjs` | 重新生成占位字体文件 |
| `dev/sync-fonts-xml.mjs` | 本地生成派生字体配置（仅调试用） |
| `dev/cache.mjs` | 预压缩缓存管理（status / clean / test） |
| `dev/lib/zip.mjs` | ZIP 读写封装（打包 + 回读校验） |
| `dev/lib/zipcache.mjs` | 预压缩缓存（复用已压缩数据，跳过 deflate） |
| `dev/lib/ndk.mjs` | NDK 定位与 C++ 交叉编译（含产物兼容性校验） |

### 预压缩缓存

打包耗时几乎全在压缩，而 `system/fonts/`（131MB 原始数据、压缩后 71MB）占了压缩量的
约 70%，且它只在发布新字体时才会变化。因此 `dev/pack.mjs` 会把这部分**预先压缩并缓存**到
`dev/.cache/`，后续打包直接搬运已压缩数据（不重新 deflate），本地构建从约 28s 降到约 13s。

缓存以「文件名 + 大小 + mtime + 权限位」为指纹，任一项变化即失效并自动重建。它是纯本地的
构建加速，**不入库、不影响产物**：命中缓存与不使用缓存产出的 zip 逐字节相同（可用
`SOURCE_DATE_EPOCH` 固定时间戳复现验证）。缓存缺失、损坏或版本不符时一律回退为现场压缩。

```bash
pnpm cache:status   # 查看缓存片段、大小、文件数
pnpm cache:test     # 校验缓存内容与源文件逐一相符
pnpm cache:clean    # 清空缓存
node dev/pack.mjs --no-cache   # 本次构建禁用缓存
```

> CI 中建议加 `--no-cache`：缓存对一次性构建没有收益，也避免引入与机器相关的状态。

### Zygisk 字体预加载模块

源码在 `native/`，编译产物 `src/zygisk/arm64-v8a.so` 随包分发。它做的事很小：在 App 进程
specialize 之前调用系统的 `Typeface.nativeWarmUpCache()`，把 FontMM 的字体文件预读进
系统字体缓存（详见 `native/src/fontmm.cpp` 顶部注释）。

编译选项有两条硬约束，改动时需留意 `dev/lib/ndk.mjs` 里的校验：

- **不得依赖 `libc++_shared.so`**：Zygisk 提供者使用自研 ELF 加载器（不用系统 `dlopen`），
  其库搜索路径只含系统目录，找不到 `libc++_shared.so` 会导致模块加载失败。
- **不得引用 `__cxa_guard_acquire` / `__cxa_guard_release`**：这两个符号不在 bionic libc
  的导出表中（仅 libc++ 提供），因此用 `-fno-threadsafe-statics` 取消静态局部变量的
  线程安全保护（`zygisk.hpp` 的 `entry_impl` 使用了静态局部变量）。

构建脚本会自动校验导出符号只有 `zygisk_module_entry`、且未链接 libc++，不满足即报错。

### 代码检查

> 前端 lint/format 由 [oxlint](https://oxc.rs/) 与 [oxfmt](https://oxc.rs/) 提供

```bash
pnpm check        # 全部检查 (缺 shellcheck/shfmt 时自动跳过)
pnpm check:strict # CI 模式: 缺少 shellcheck/shfmt 直接失败
pnpm lint         # 前端 oxlint 检查
pnpm fmt          # 前端 oxfmt 格式化
pnpm fmt:check    # 前端 oxfmt 格式检查
```

`pnpm check` 除了跑 lint 与类型检查，还会做几项结构一致性校验：`module.prop` 字段完整性、
`fonts.xml` 标签配对、`apply.sh` 的占位字体映射与 `empty-font.mjs` 的清单是否一一对应、
派生配置是否被误提交等。

### 可复现构建

产物由三类因素决定，本仓库分别做了处理：

**1. 源码路径与 VCS 状态** — 已消除。`fontmm-wght` 用 `-trimpath -buildvcs=false` 编译，
否则 Go 会把源码绝对路径与 `vcs.modified` 等状态嵌进二进制，导致产物哈希随构建目录、
以及工作树是否干净而变化。

**2. 条目的时间戳** — 可控。设置 `SOURCE_DATE_EPOCH` 固定所有 zip 条目时间戳，
即可得到逐字节相同的 zip（用于留档比对、镜像分发）：

```bash
SOURCE_DATE_EPOCH=1700000000 pnpm run pack
```

不设置时沿用源文件的修改时间，与 `zip` 的默认行为一致。

**3. 工具链版本** — 通过固定版本对齐。编译器版本会以指纹形式留在二进制里
（`fontmm-wght` 嵌 Go 版本，`arm64-v8a.so` 的 `.comment` 段嵌 clang 与 NDK 版本），
所以 CI 与本地必须用**相同版本**的工具链才能得到相同哈希：

| 工具 | 本地 | CI 如何对齐 |
| ---- | ---- | ---- |
| Go | 以 `golang/go.mod` 声明为准 | `go-version-file: golang/go.mod` |
| NDK | `~/opt/android-ndk-r27c` | `ndk-version: r27c` |

> 踩过的坑：`nttld/setup-ndk` **不会**自动设置 `ANDROID_NDK_HOME`，必须由 workflow
> 显式传入 `steps.setup-ndk.outputs.ndk-path`；否则会静默回退到 runner 预装的其它
> NDK 版本（曾出现声明 r27c 却用 r27d）。同理，`go-version: '1.24'` 这种宽泛写法会
> 解析到最新补丁版（CI 装 1.24.13 而本地 1.24.4），故改用 `go-version-file`。

即使工具链版本不同，产物也只是 `.comment` 指纹段有差异 —— 代码段、重定位与依赖符号
完全一致，功能等价。对比方法：

```bash
pnpm cache:status            # 查看缓存
node dev/build-zygisk.mjs    # 本地重建后对比
llvm-nm -D --defined-only src/zygisk/arm64-v8a.so   # 应只有 zygisk_module_entry
llvm-readelf -d src/zygisk/arm64-v8a.so | grep NEEDED  # 应不含 libc++_shared
```

### Unicode 覆盖测试

> 本地模拟 `fonts.xml` 的 fallback 链，对照 Unicode Blocks.txt 统计每个区块覆盖率，首次运行会自动下载 Blocks.txt 缓存到 `dev/`

```bash
python3 dev/check-unicode-coverage.py                        # 全部区块
python3 dev/check-unicode-coverage.py "Archaic" "Seal"       # 只测指定区块
```

### 占位字体机制

`src/system/fonts/` 下的 `SysFont*` / `SysSans*` 是 **0 字节占位文件**，避免把大字体文件提交进仓库；安装或应用字体时由 `apply.sh` 用 `FONTS/` 里的真实字体覆盖。

- 开发时可用 `pnpm empty-font` 重新生成这些占位文件
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

[GNU General Public License v3.0](./LICENSE)

本模块内置的 Zygisk 字体预加载部分（`native/`）参考了 [FontLoader](https://github.com/JingMatrix/FontLoader) 的实现思路，
其上游 Zygisk Next 以 GPL-3.0 发布，故本项目整体采用 GPL-3.0。
`native/src/zygisk.hpp` 为 [topjohnwu](https://github.com/topjohnwu/zygisk-module-sample) 的宽松许可（MIT 式）头文件，可自由内联。
