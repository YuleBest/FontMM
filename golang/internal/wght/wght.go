// Package wght 提供字体配置 XML 的字重范围覆写逻辑
package wght

import (
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
)

// 标准 9 档字重
var Weights = []int{100, 200, 300, 400, 500, 600, 700, 800, 900}

// 模块内需要覆写的字体配置 XML (相对模块根)
var XMLRelPaths = []string{
	"system/etc/fonts.xml",
	"system/etc/fonts_base.xml",
	"system/etc/fonts_ule.xml",
	"system/etc/font_fallback.xml",
	"system/system_ext/etc/fonts_base.xml",
	"system/system_ext/etc/fonts_ule.xml",
}

// 平均分配: weight w 对应的 axis 值 (400 固定, 两端 floor 线性插值)
func AveragedAxis(min, max, w int) int {
	if w == 400 {
		return 400
	}
	if w < 400 {
		return min + (400-min)*(w-100)/300
	}
	return 400 + (max-400)*(w-400)/500
}

// 生成单条 <font> 条目 (缩进与现有 fonts.xml 一致)
func fontEntry(weight, axisWght int) string {
	return fmt.Sprintf(`        <font weight="%d" style="normal">SysFont-Regular.ttf
            <axis tag="ital" stylevalue="0" />
            <axis tag="wdth" stylevalue="100" />
            <axis tag="wght" stylevalue="%d" />
        </font>`, weight, axisWght)
}

// 生成 sans-serif family 段
// mode 1=裁切 (weight ∈ [min,max]) 2=平均 (全保留, axis 插值) 3=自定义映射 (1-1000 任意)
func GenerateFamily(min, max, mode int, customMap map[int]int) string {
	var lines []string
	if mode == 3 && len(customMap) > 0 {
		ws := make([]int, 0, len(customMap))
		for w := range customMap {
			ws = append(ws, w)
		}
		sort.Ints(ws)
		for _, w := range ws {
			lines = append(lines, fontEntry(w, customMap[w]))
		}
	} else {
		for _, w := range Weights {
			if mode == 1 && (w < min || w > max) {
				continue
			}
			var axis int
			if mode == 3 {
				if v, ok := customMap[w]; ok {
					axis = v
				} else {
					axis = AveragedAxis(min, max, w)
				}
			} else if mode == 2 {
				axis = AveragedAxis(min, max, w)
			} else {
				axis = w
			}
			lines = append(lines, fontEntry(w, axis))
		}
	}
	return "    <family name=\"sans-serif\">\n" + strings.Join(lines, "\n") + "\n    </family>"
}

// 在完整 XML 中替换 sans-serif family 段; 未找到或 mode 0 时原样返回
// 通过深度计数匹配对应的 </family> (防止嵌套 family 误切), 并整行替换避免段首被重复缩进
func ApplyWghtMode(xml string, mode, min, max int, customMap map[int]int) string {
	if mode == 0 {
		return xml
	}
	const startTag = `<family name="sans-serif">`
	start := findFamilyStart(xml, startTag)
	if start < 0 {
		return xml
	}
	end := matchFamilyClose(xml, start+len(startTag))
	if end < 0 {
		return xml
	}
	// 整行替换 (含行首缩进与闭合标签后的换行), 保持与原有段一致的缩进
	lineStart := start
	for lineStart > 0 && xml[lineStart-1] != '\n' {
		lineStart--
	}
	lineEnd := end
	for lineEnd < len(xml) && xml[lineEnd] != '\n' {
		lineEnd++
	}
	if lineEnd < len(xml) {
		lineEnd++ // 吃掉换行
	}
	return xml[:lineStart] + GenerateFamily(min, max, mode, customMap) + "\n" + xml[lineEnd:]
}

// 查找 startTag 的位置 (跳过 XML 注释, 避免误匹配注释内的文本)
func findFamilyStart(xml, startTag string) int {
	searchFrom := 0
	for {
		i := strings.Index(xml[searchFrom:], startTag)
		if i < 0 {
			return -1
		}
		i += searchFrom
		open := strings.LastIndex(xml[:i], "<!--")
		if open < 0 {
			return i
		}
		if rel := strings.Index(xml[open:], "-->"); rel < 0 || open+rel+3 > i {
			// 命中位置在注释内, 继续向后找
			searchFrom = i + 1
			continue
		}
		return i
	}
}

// 从紧随 <family name="sans-serif"> 之后的位置开始, 找到配对的 </family> (含嵌套),
// 返回其结束位置 (含标签); 未找到返回 -1
func matchFamilyClose(xml string, start int) int {
	depth := 1
	i := start
	for i < len(xml) {
		// 跳过注释
		if strings.HasPrefix(xml[i:], "<!--") {
			if rel := strings.Index(xml[i:], "-->"); rel >= 0 {
				i += rel + len("-->")
				continue
			}
		}
		// 找下一个 '<'
		lt := strings.IndexByte(xml[i:], '<')
		if lt < 0 {
			return -1
		}
		i += lt
		if strings.HasPrefix(xml[i:], "</family>") {
			depth--
			if depth == 0 {
				return i + len("</family>")
			}
			i += len("</family>")
			continue
		}
		if strings.HasPrefix(xml[i:], "<family") {
			gt := strings.IndexByte(xml[i:], '>')
			if gt < 0 {
				return -1
			}
			// 自闭合 <family .../> 不增加嵌套深度
			if xml[i+gt-1] != '/' {
				depth++
			}
			i += gt + 1
			continue
		}
		// 其他标签: 跳到 '>' 之后
		gt := strings.IndexByte(xml[i:], '>')
		if gt < 0 {
			return -1
		}
		i += gt + 1
	}
	return -1
}

// 读取自定义映射文件 (每行 "weight axis")
func ReadCustomMap(path string) (map[int]int, error) {
	m := map[int]int{}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) != 2 {
			continue
		}
		w, err1 := strconv.Atoi(parts[0])
		v, err2 := strconv.Atoi(parts[1])
		if err1 == nil && err2 == nil {
			m[w] = v
		}
	}
	return m, nil
}

// ApplyToDir 覆写模块根目录下的全部字体配置 XML, 返回覆写文件数
func ApplyToDir(xmlDir string, mode, min, max int, customMap map[int]int) (int, error) {
	changed := 0
	for _, rel := range XMLRelPaths {
		p := xmlDir + "/" + rel
		data, err := os.ReadFile(p)
		if err != nil {
			fmt.Fprintf(os.Stderr, "[-] 跳过 %s: %v\n", rel, err)
			continue
		}
		replaced := ApplyWghtMode(string(data), mode, min, max, customMap)
		if replaced == string(data) {
			fmt.Printf("[-] 无变化: %s\n", rel)
			continue
		}
		if err := os.WriteFile(p, []byte(replaced), 0o644); err != nil {
			return changed, fmt.Errorf("写入失败 %s: %w", rel, err)
		}
		changed++
		fmt.Printf("[✓] 已覆写: %s\n", rel)
	}
	return changed, nil
}
