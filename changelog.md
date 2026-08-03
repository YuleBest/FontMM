# Changelog

## Unreleased

- **补充字库**：内置 OFL-1.1 许可的 NotoSansPro / Unicode16-18 / ZUno-Number 及 Plangothic（CJK 扩展 I/J）、PlanschriftSeal（**Seal 小篆区块 11328 字符 100% 覆盖**，MIT/OFL 双许可），在 `fonts.xml` 末尾作为全局 fallback
- **单一源字体配置**：`fonts.xml` 为唯一源，开发阶段自动生成 `fonts_base.xml` / `fonts_ule.xml` / `font_fallback.xml`
- **Unicode 覆盖测试**：新增 `dev/check-unicode-coverage.py`，本地模拟 fallback 链统计各区块覆盖率

## v26.8.0-beta.1

全新 v26 架构重构：

- **WebUI 重写**（Material Design 3 + 底部导航）：字体槽位选择/应用、字体测试（字重 100–900、可变字体滑条、字号调节）、关于页、深色模式跟随系统、edge-to-edge 延伸至小白条
- **字体名称解析**：打开 WebUI 时用 opentype.js 读取 FONT/ 内字体的真实名称并显示在卡片（如 OPPO Sans 4.0）
- **双版本打包**：`_preplace`（含预置字体）与 `_template`（FONT 空目录）两版；新增 `build:only-web` 快速调试产物
- **开发工具链**：oxlint / oxfmt / type-check / shellcheck 脚本化
- 新增 MIT LICENSE
