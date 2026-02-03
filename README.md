# FontMM

![](https://image.yule.ink/hero.png)

FontMM 是一个用于在 Android 设备上一键生成 Magisk 字体模块的工具集

**目前已适配系统：**

- ColorOS 16

## 使用方法

### 如何打包字体模块

1. 在 Release 下载最新版本

2. 将下载到的压缩包进行解压，请确保所有文件均被解压

3. 自定义 `module.prop`（可选）

4. 在 `ttf/` 里面放入你的字体

- `ch.ttf`  --  中文（简体）
- `tc.ttf`  --  中文（繁体）
- `en.ttf`  --  英文和数字

你也可以只放入一个 `ch.ttf`
这样的话，中文（繁体）和英数都会使用 `ch.ttf`

3. 使用 Root 权限运行 `开始打包.sh`

### 如何便捷地更换字体

1. 把新字体放入 `/data/adb/modules/[你的模块ID]/ttf`，规则与上述一致

2. 运行 Action（点击 Root 管理器里本模块的「执行」按钮）

3. 确认更换字体，重启即可生效
