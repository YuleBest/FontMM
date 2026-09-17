# FontMM 开发指南

面向本仓库的开发者与贡献者。用户文档见 [README](./README.md)。

## 环境要求

- **Node.js ≥ 18** + [pnpm](https://pnpm.io/)（构建脚本全部为 Node 脚本，不依赖 shell 工具链）
- **Golang**（编译字重覆写工具 `fontmm-wght`）
- **Android NDK**（编译 Zygisk 字体预加载模块 `zygisk/arm64-v8a.so`）
- `Python 3` + `fontTools`（仅 Unicode 覆盖测试需要）
- `shellcheck` + `shfmt`（可选，装上后 `pnpm check` 会额外检查 `src/` 下的 shell 脚本）

NDK 通过环境变量 `ANDROID_NDK_HOME` 指定，或放在以下位置之一（按优先级查找）：
`~/opt/android-ndk-r27c`、`~/Android/Sdk/ndk`、`/opt/android-ndk`。

```bash
# 下载 NDK (约 630MB)
curl -LO https://dl.google.com/android/repository/android-ndk-r27c-linux.zip
unzip android-ndk-r27c-linux.zip -d ~/opt/
```

> 构建流程不需要 `zip` / `unzip` 命令：打包由 Node 脚本调用
> [@zip.js/zip.js](https://github.com/gildas-lormeau/zip.js) 完成，
> 在 Windows、精简容器与各类 CI 镜像中均可直接运行。

## 快速开始

```bash
pnpm install && cd web && pnpm install   # 安装依赖
pnpm dev                                 # 本地预览 WebUI
pnpm build                               # 完整构建
```

`pnpm dev` 下 `ksu.ts` 使用内置 mock 文件系统，文件选择、槽位切换、应用字体
全流程可脱离真机调试。

## 项目结构

| 目录 | 内容 |
| ---- | ---- |
| `src/` | 模块本体（打包进 zip 的根目录）：刷入脚本、`apply.sh`、字体配置、设备端工具 |
| `web/` | WebUI 源码（Vite + TypeScript + Material Web），构建产物输出到 `src/webroot` |
| `native/` | Zygisk 字体预加载模块（C++） |
| `golang/` | `fontmm-wght`，字重覆写工具 |
| `dev/` | 构建与开发脚本 |

## 构建与打包

```bash
pnpm build               # WebUI + 模块打包 -> dist/FontMM_v<版本>_{preplace,template}.zip
```

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
| `dev/build-subset.mjs` | 交叉编译 `fontmm-subset`（英文字体子集化工具） |
| `dev/ci.mjs` | 代码检查（结构校验 + shellcheck/shfmt + 前端 lint/format/类型） |
| `dev/empty-font.mjs` | 重新生成占位字体文件 |
| `dev/sync-fonts-xml.mjs` | 本地生成派生字体配置（仅调试用） |
| `dev/cache.mjs` | 预压缩缓存管理（status / clean / test） |
| `dev/lib/zip.mjs` | ZIP 读写封装（打包 + 回读校验） |
| `dev/lib/zipcache.mjs` | 预压缩缓存（复用已压缩数据，跳过 deflate） |
| `dev/lib/ndk.mjs` | NDK 定位与 C++ 交叉编译（含产物兼容性校验） |
| `dev/lib/harfbuzz.mjs` | harfbuzz 源码获取与静态库编译（供 `fontmm-subset` 用） |

## 代码检查

> 前端 lint/format 由 [oxlint](https://oxc.rs/) 与 [oxfmt](https://oxc.rs/) 提供

```bash
pnpm check        # 全部检查 (缺 shellcheck/shfmt 时自动跳过)
pnpm check:strict # CI 模式: 缺少 shellcheck/shfmt 直接失败
pnpm lint         # 前端 oxlint 检查
pnpm fmt          # 前端 oxfmt 格式化
pnpm fmt:check    # 前端 oxfmt 格式检查
pnpm shfmt        # 检查 src/ 下 shell 脚本格式 (不改写)
pnpm shfmt:fix    # 格式化 src/ 下 shell 脚本
```

`pnpm check` 除了跑 lint 与类型检查，还会做几项结构一致性校验：`module.prop` 字段完整性、
`fonts.xml` 标签配对、`apply.sh` 的占位字体映射与 `empty-font.mjs` 清单是否一一对应、
Zygisk 预热字体清单与 `apply.sh` 是否一致、派生配置是否被误提交等。

## 预压缩缓存

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

> CI 中使用 `--no-cache`：缓存对一次性构建没有收益，也避免引入与构建机相关的状态。

## Zygisk 字体预加载模块

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

改动 `native/` 后建议检查产物：

```bash
node dev/build-zygisk.mjs
llvm-nm -D --defined-only src/zygisk/arm64-v8a.so       # 应只有 zygisk_module_entry
llvm-readelf -d src/zygisk/arm64-v8a.so | grep NEEDED   # 应不含 libc++_shared
```

## 英文字体子集化工具

源码在 `native/src/subset/`，产物 `src/tools/fontmm-subset`，由 `apply.sh` 在设备端调用。

**为什么需要它**：`fonts.xml` 中 `sans-serif` / `sys-sans-en` 排在 `zh-Hans` / `zh-Hant`
之前，因此 `en.ttf` 一旦自带 CJK 字形，这些字就会被用于中文渲染，盖掉 `hans.ttf` /
`hant.ttf`。Android 的 `fonts.xml` 无法限定字体"只负责英文"，只能在应用前把 CJK 裁掉。

**实现选择**：用 harfbuzz 的 subset API 并静态链接，编译成设备端 CLI。相比
PyInstaller + fontTools 的方案：

- 无需在设备上引入 Python 运行时（PyInstaller 也不支持交叉编译到 Android，
  且其产物依赖 glibc，无法在 Android 的 bionic libc 上运行）
- 子集化耗时约 21ms（21MB 字体），因此**不做结果缓存**——每次重算比维护缓存的
  失效判断与陈旧文件清理更简单可靠
- CLI 形式使 WebUI 与「手动放字体」两条路径都能覆盖

**可变字体**：已实测确认 `fvar` 轴（wght 范围与默认值）、`gvar` 变形数据（按字形
成比例保留）、`STAT` 与 `GSUB` / `GPOS` / `GDEF` 排版表均不丢失，字重覆写功能不受影响。

**CLI**：

```bash
fontmm-subset -check <font.ttf>              # 检测含 CJK 则退出码 1
fontmm-subset -in <f.ttf> -out <o.ttf>       # 生成子集 (默认保留拉丁/希腊/西里尔)
  [-minimal]                                 # 仅 ASCII/西欧 (体积更小, 但会缺字)
  [-keep-cjk]                                # 额外保留 CJK 区块
```

**harfbuzz 构建缓存**：harfbuzz 源码解压后 97MB，不入库，由 `dev/lib/harfbuzz.mjs`
在构建时下载。其中**编译耗时约 88 秒**（占整个构建绝大部分），因此缓存编译产物而非
源码：缓存键 = harfbuzz 版本 + NDK 版本 + 编译选项，任一变化即重新编译。
首次构建约 100s，之后约 1s。缓存位于 `dev/.cache/harfbuzz{,-obj}/`。

改动后检查产物：

```bash
node dev/build-subset.mjs
src/tools/fontmm-subset -check src/FONTS/hans.ttf    # 应返回 cjk=<非0> / 退出码 1
```

## 可复现构建

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
完全一致，功能等价。

## Unicode 覆盖测试

> 本地模拟 `fonts.xml` 的 fallback 链，对照 Unicode Blocks.txt 统计每个区块覆盖率，
> 首次运行会自动下载 Blocks.txt 缓存到 `dev/`

```bash
python3 dev/check-unicode-coverage.py                        # 全部区块
python3 dev/check-unicode-coverage.py "Archaic" "Seal"       # 只测指定区块
```

## 占位字体机制

`src/system/fonts/` 下的 `SysFont*` / `SysSans*` 是 **0 字节占位文件**，避免把大字体文件
提交进仓库；安装或应用字体时由 `apply.sh` 用 `FONTS/` 里的真实字体覆盖。

- 开发时可用 `pnpm empty-font` 重新生成这些占位文件
- `src/FONTS/hans.ttf` 是内置默认简体字体（仅 preplace 版打包）

## 技术细节

### 字体挂载

模块把 5 个用户字体槽位挂载到系统字体文件：

| 槽位        | 用户文件    | 挂载的系统字体文件                                                   | 回退逻辑（字体缺失时）      |
| ----------- | ----------- | :------------------------------------------------------------------- | --------------------------- |
| 中文简体    | `hans.ttf`  | `SysSans-Hans-Regular.ttf`、`SysFont-Static-Regular.ttf`、`SysFont-Myanmar.ttf`、`SysFont-Hans-Regular.ttf` | 拒绝安装和应用 |
| 中文繁体    | `hant.ttf`  | `SysSans-Hant-Regular.ttf`、`SysFont-Hant-Regular.ttf`               | 使用中文简体字体 `hans.ttf` |
| 英文 & 数字 | `en.ttf`    | `SysSans-En-Regular.ttf`、`SysFont-Regular.ttf`                      | 使用中文简体字体 `hans.ttf` |
| 等宽字体    | `mono.ttf`  | `DroidSansMono.ttf`                                                  | 不挂载                      |
| Emoji 表情  | `emoji.ttf` | `NotoColorEmoji.ttf`                                                 | 不挂载                      |

> 注：`SysFont-Regular.ttf` 是 `fonts.xml` 中 `sans-serif` 家族默认字体，由英文槽位填充
> （未设置时回退简体）。西文字体在配置中排在最前，中文字体自带的西文字形仅作兜底，
> 避免中文完全覆盖西文（issue #6）。
>
> 英文槽位在安装前会经 `fontmm-subset` 检测，含 CJK 字形时自动裁成拉丁子集
> （issue #10，见上节）。子集文件为 `FONTS/.en-subset.ttf`，属中转产物，
> 不是用户槽位，不被 WebUI 读取。

### 补充字库

模块内置一组 OFL-1.1 / MIT 许可的补充字体，作为 `fonts.xml` 末尾的全局 fallback，
兜底用户字体与系统字体未覆盖的字形（CJK 扩展区生僻字、最新 Unicode 字符、小篆等）：

| 字体                          | 说明                                                                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PlangothicP1/P2.ttf`         | CJK 扩展区覆盖（Ext-B、G/H、**I、J** 等生僻字与新汉字）                                                                                                                                   |
| `PlanschriftSeal-Regular.ttf` | **Seal（小篆）区块 11328 字符全覆盖**（Unicode 18 新增，子集化 34M；MIT/OFL 双许可，源自 [Planschrift_Project](https://github.com/Fitzgerald-Porthmouth-Koenigsegg/Planschrift_Project)） |
| `NotoSansPro.otf`             | 多 Noto 家族合并，覆盖广泛语言字形                                                                                                                                                        |
| `Unicode16/17/18-new.ttf`     | Unicode 最新版本已定义字符覆盖                                                                                                                                                            |
| `ZUno-Number.ttf`             | 保留符号 / 私用区未定义符号显示编码信息                                                                                                                                                   |

补充字库不参与用户槽位替换，仅在缺字形时按顺序兜底。字体来源与许可详见模块内
`system/fonts/LICENSE-*` 及 [MakeFontsGreatAgain](https://github.com/Numbersf/MakeFontsGreatAgain) 的 LICENSES。

### 工作原理

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

1. **安装阶段**（`customize.sh`）：系统检查（ColorOS 版本、KernelSU 元模块、Zygisk 环境）
   → 停用重叠的外部 Fontloader → 更新模式检测与旧字体继承 → 扫描设备系统 XML 生成派生字体配置
   → 调用 `apply.sh` 完成首次字体安装
2. **换字体阶段**（WebUI）：选择文件 → 复制到 `FONTS/` → 调用同一个 `apply.sh`，两条路径行为一致
3. **`apply.sh` 核心逻辑**：按字体映射表把 `FONTS/` 中的字体复制到 `system/fonts/` 的对应文件，
   缺繁体/英文时回退简体；英文槽位在复制前会检测并裁掉 CJK 字形（issue #10）
4. **字体生效**：ColorOS 通过 `/system/etc/fonts.xml` 等配置引用 `SysFont*` / `SysSans*` 字体族，
   模块只内置 `fonts.xml` 主配置，各派生配置（`fonts_base.xml` / `fonts_ule.xml` /
   `font_fallback.xml`）由安装时扫描设备系统 XML 生成（缺失时回退内置），字重覆写时
   `fontmm-wght -sync` 统一同步，提升跨 ColorOS 版本兼容性
5. **字体预加载**（`zygisk/arm64-v8a.so`）：App 进程 specialize 前，模块把 FontMM 的字体文件
   预读进系统字体缓存，使被「卸载模块」的 App 仍能正常渲染字体

## 发布流程

**发布资产由 CI 构建，不要在本地打包后手动上传** —— `Release` 工作流在 release 发布时
（`on: release: [published]`）会重新构建并上传 `dist/*.zip` 与 `dist/*.zip.sha256`；
手动传一遍既慢又会被 CI 覆盖（本地 zip 的时间戳与 CI 不同，校验和也不一样）。

1. 改 `src/module.prop` 的 `version` / `versionCode`，同步 `update.json`（版本号与 `zipUrl`）
2. `changelog.md` 写本次条目：**相对上一个已发布版本的用户可见变化**，不必逐条罗列 commit
3. `pnpm check` → commit（`chore: 发布 vX (版本码)`）→ push → 等 `Build & Upload Artifacts` 通过
4. 打 tag 并推送：`git tag -a vX -m "FontMM vX" && git push origin vX`
5. 创建预发布（**不传文件**）：

   ```bash
   gh release create vX --title "vX" --notes-file /tmp/relnotes.md --prerelease
   ```

   `Release` 工作流随即构建并上传 4 个资产（template / preplace 的 zip 与 `.sha256`）
6. 等 `Release` 工作流成功后，验证 `update.json` 的 `zipUrl` 可达（HTTP 200）——
   资产上传完成前该链接是 404

> 本地 `pnpm build` 只用于本地测试与实机验证；发布产物一律以 CI 为准。

## 相关文档

- [README](./README.md) — 用户文档
- [changelog.md](./changelog.md) — 版本变更记录
