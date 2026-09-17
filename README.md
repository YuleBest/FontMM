<h1 align="center">FontMM</h1>

<div align="center">
    一个用于快速更换系统字体的 Magisk 模块，内置 WebUI 以及一些好用的功能
</div>

<div align="center">
  <a href="#特性">特性</a> | <a href="#安装">安装</a> | <a href="#使用">使用</a> | <a href="#常见问题">常见问题</a> | <a href="#致谢">致谢</a> | <a href="#许可">许可</a><br>
</div>

## 特性

- Material 风格的管理界面，在支持 WebUI 的 Root 管理器中直接打开
- 多槽位字体分别选择，满足你的个性化需求
- 可变字体 wght 范围与实际字重等级不符时可选择覆写配置，保证正确映射
- 内置字库补充字体，兜底 CJK 扩展区、Unicode 18.0 全覆盖
- 内置字体预加载，无需额外安装 Fontloader

## 支持环境

| 项目      | 要求                    |
| --------- | ----------------------- |
| 系统      | >= ColorOS 16.0         |
| Root 环境 | Magisk 20.4+ / KernelSU |
| 字体格式  | `.ttf`                  |

## 安装

> 安装完成后，请在系统设置中选择 Roboto 作为字体，这样才能得到正确的字重映射！

### 选择刷入包

每个 Release 提供两个压缩包，区别仅在于是否预置字体：

| 包名                 | 内容                            | 适用场景                                        |
| -------------------- | ------------------------------- | ----------------------------------------------- |
| `..._preplace.zip`   | 含预置简体字体 `FONTS/hans.ttf` | **全新安装**，刷入后开箱即用                     |
| `..._template.zip`   | `FONTS/` 为空目录               | **更新模块**，自动继承旧模块字体，包体积更小      |

> 若用 `_template` 版全新安装，需自行在 `FONTS/` 放入简体字体 `hans.ttf`，否则安装会失败。

### 安装依赖

按你的 Root 管理器完成下表配置。三行都需要满足：

| 依赖            | KernelSU 及分支                                                                              | Magisk 及分支                              |
| --------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **元模块**      | 若管理器支持元模块则**必须**安装，否则模块无法挂载。参见[什么是元模块](https://kernelsu.org/zh_CN/guide/metamodule.html)。已测试：[mountify](https://github.com/backslashxx/mountify/releases) | 不适用                                     |
| **Zygisk**      | 安装独立提供者：[Zygisk Next](https://github.com/Dr-TSNG/ZygiskNext/releases) 或 [ReZygisk](https://github.com/PerformanC/ReZygisk/releases) | 在设置中启用内置 Zygisk                    |
| **WebUI 支持**  | 管理器自带                                                                                    | 需外置 App：[WebUI X Portable](https://github.com/MMRLApp/WebUI-X-Portable) 或 [KsuWebUI Standalone](https://github.com/5ec1cff/KsuWebUIStandalone) |

补充说明：

- **Zygisk 只能启用一个**：Magisk 内置 Zygisk 与独立提供者不可同时启用。使用 ReZygisk 等独立实现时，请关闭 Magisk 内置 Zygisk。
- **Zygisk Next 用户**：需在其 WebUI 中把「排除列表策略」改为**仅还原挂载**。
- **管理器配置**：本模块已内置字体预加载，可以不必关闭「默认卸载模块」以及「卸载模块（内核级）」，**但仍建议关闭**——关闭后模块才能尽可能全场景覆盖。若选择不关闭，可用 App Profile 单独为某个应用关闭「卸载模块」并重启该应用。

> **不再需要 Fontloader**：从 Android 12 起字体改为 App 启动时按需加载，被「卸载模块」的 App 会因找不到字体而异常。Fontloader 这类模块的作用就是提前把字体读进缓存，**本模块已内置该能力**。若你此前装过 Fontloader，刷入时会自动为其添加 `disable` 文件停用（不影响其数据，删除该文件即可恢复）。

## 使用

### 更换字体

1. 打开 Root 管理器的 WebUI，进入 FontMM，切到「配置」页
2. 在槽位中选择字体，然后点「应用字体」，重启设备生效

各槽位说明：

| 槽位            | 是否必选 | 未选择时               |
| --------------- | -------- | ---------------------- |
| **中文简体**    | **必选** | 无法应用               |
| **中文繁体**    | 可选     | 自动使用简体           |
| **英文 & 数字** | 可选     | 自动使用简体           |
| **等宽字体**    | 可选     | 不覆盖系统等宽字体     |
| **Emoji 表情**  | 可选     | 使用系统默认 Emoji     |

> **关于「英文 & 数字」槽位**：若所选字体本身自带中文字形（例如某些中文字体的英文版、或包含 CJK 的西文字体），应用时会**自动裁剪成纯拉丁子集**。系统字体配置里西文排在中文之前，不裁剪的话它自带的汉字会盖掉你选的中文字体，表现为"中文没换干净"。裁剪只影响西文槽位，中文字体不做处理，且会完整保留可变字体特性（字重轴不受影响）。

### 字重覆写（高级）

所选字体为**可变字体**时，若其 wght 轴范围与实际字重等级不符，可在「高级配置」中覆写映射：

| 模式             | 说明                                         |
| ---------------- | -------------------------------------------- |
| **不处理**       | 默认，超出范围的字重由系统处理               |
| **裁切粗细等级** | 删除范围外的字重条目                         |
| **平均分配字重** | 保留 9 档完整粗细，400 不变，两端平均插值     |
| **自定义映射**   | 自行定义 1-1000 字重的映射关系                |

### 手动放置字体

也可以不经 WebUI，直接把字体放进 `/data/adb/modules/FontMM/FONTS/`：

| 文件名      | 用途             |
| ----------- | ---------------- |
| `hans.ttf`  | 中文简体（必选） |
| `hant.ttf`  | 中文繁体         |
| `en.ttf`    | 英文与数字       |
| `mono.ttf`  | 等宽字体         |
| `emoji.ttf` | Emoji 表情       |

之后执行 `sh /data/adb/modules/FontMM/apply.sh` 并重启设备。回退逻辑与 WebUI 一致。

### 校验模块完整性

校验模块内脚本与二进制是否被篡改或损坏：

```sh
sh /data/adb/modules/FontMM/tools/verify-sha256.sh
```

GitHub Release 的 zip 附件旁均提供 `.sha256` 文件，可用 `sha256sum -c` 验证下载完整性。

## 常见问题

**Q：装完模块后字体没变？**

A：确认系统是 ColorOS 16+ 并已完成[安装依赖](#安装依赖)，然后重启设备。

**Q：更新模块会丢失我设置好的字体吗？**

A：不会。检测到已安装的 FontMM 时会进入更新模式，从旧模块的 `FONTS/` 继承字体。

**Q：首页显示「字体预热器未生效」怎么办？**

A：说明没检测到可用的 Zygisk 环境。被「卸载模块」的应用可能字体异常，请按[安装依赖](#安装依赖)配置 Zygisk。

**Q：需要额外安装 Fontloader 吗？**

A：不需要，本模块已内置字体预加载。

**Q：选了英文字体，为什么它的中文部分没生效？**

A：这是有意为之。西文字体若自带汉字，会盖掉你选的中文字体（系统配置里西文排在中文前面），因此应用时会自动裁掉其 CJK 部分，只保留拉丁字符。

**Q：我用了自带中文的英文字体，担心字重变少？**

A：不会。裁剪会完整保留可变字体的字重轴，字重覆写不受影响。

## 致谢

- 字体映射与配置文件参考 ColorOS 16 系统字体体系
- 补充字库与 `fonts.xml` fallback 结构参考 [MakeFontsGreatAgain](https://github.com/Numbersf/MakeFontsGreatAgain)
- WebUI 基于 [Material Web](https://github.com/material-components/material-web)（Material Design 3）与 [kernelsu](https://www.npmjs.com/package/kernelsu) 构建

## 许可

[GNU General Public License v3.0](./LICENSE)

本模块内置的 Zygisk 字体预加载部分（`native/`）参考了 [FontLoader](https://github.com/JingMatrix/FontLoader) 的实现思路，
其上游 Zygisk Next 以 GPL-3.0 发布，故本项目整体采用 GPL-3.0。
`native/src/zygisk.hpp` 为 [topjohnwu](https://github.com/topjohnwu/zygisk-module-sample) 的宽松许可（MIT 式）头文件，可自由内联。

---

开发相关内容（构建、打包、技术细节）见 [DEVELOPMENT.md](./DEVELOPMENT.md)。
