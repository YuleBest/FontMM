// 全局路径与外部链接常量
export const FONTS_DIR = '/data/adb/modules/FontMM/FONTS';
export const WEBROOT_DIR = '/data/adb/modules/FontMM/webroot';
export const TEST_FONT_DIR = `${WEBROOT_DIR}/fonts-test`;
// 覆写字体配置: 调用模块内置 Go 程序 fontmm-wght (本地读写全部 6 个 XML, 无命令长度限制)
export const WGHT_BIN = '/data/adb/modules/FontMM/tools/fontmm-wght';

// 捐献 (支付宝/爱发电) 与开发者主页 (浏览器) 链接
export const DONATE_ALIPAY_URI =
  'alipays://platformapi/startapp?saId=10000007&qrcode=https://qr.alipay.com/2m615805eflrafv8ipc2p15';
export const ALIPAY_PKG = 'com.eg.android.AlipayGphone';
export const DONATE_IFDIAN_URL = 'https://www.ifdian.net/a/xiaoyule';
export const DEV_PROFILE_URL = 'https://github.com/YuleBest';
