// fontsXml.ts — 字重覆写 UI 辅助 (生成逻辑已迁移至 Go 程序 fontmm-wght)
// 仅保留 UI 渲染滑块默认值所需的函数

export const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

/** 平均分配: 计算 weight w 对应的 axis wght 值 (400 固定, 两端线性插值, 向下取整) */
export function averagedAxis(min: number, max: number, w: number): number {
  if (w === 400) return 400;
  if (w < 400) return Math.floor(min + ((400 - min) * (w - 100)) / 300);
  return Math.floor(400 + ((max - 400) * (w - 400)) / 500);
}
