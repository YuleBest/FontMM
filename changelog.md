# Changelog

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
