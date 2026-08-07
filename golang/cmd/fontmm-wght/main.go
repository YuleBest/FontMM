// fontmm-wght: 覆写模块字体配置 XML 的 sans-serif family 字重范围
// 用法: fontmm-wght -mode 0|1|2|3 [-min N] [-max N] [-map <wght-map.txt>] [-xml-dir <模块根>]
package main

import (
	"flag"
	"fmt"
	"os"

	"fontmm/internal/wght"
)

func main() {
	mode := flag.Int("mode", 0, "覆写模式: 0=不处理 1=裁切 2=平均分配 3=自定义映射")
	min := flag.Int("min", 100, "裁切/平均最小字重")
	max := flag.Int("max", 900, "裁切/平均最大字重")
	mapPath := flag.String("map", "", "自定义映射文件 (mode 3): 每行 'weight axis'")
	xmlDir := flag.String("xml-dir", "/data/adb/modules/FontMM", "模块根目录 (含 system/etc/fonts.xml)")
	flag.Parse()

	if *mode == 0 {
		fmt.Println("[-] mode 0: 不处理")
		return
	}

	var customMap map[int]int
	if *mode == 3 {
		var err error
		customMap, err = wght.ReadCustomMap(*mapPath)
		if err != nil {
			fmt.Printf("[x] 读取映射文件失败: %v\n", err)
			os.Exit(1)
		}
		if len(customMap) == 0 {
			fmt.Println("[-] 映射文件为空, 使用平均分配回退")
		}
	}

	changed, err := wght.ApplyToDir(*xmlDir, *mode, *min, *max, customMap)
	if err != nil {
		fmt.Printf("[x] %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("[✓] 完成, 共覆写 %d 个文件\n", changed)
}
