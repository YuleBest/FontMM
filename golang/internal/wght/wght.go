// Package wght 提供字体配置 XML 的字重范围覆写逻辑
package wght

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// 标准 9 档字重
var Weights = []int{100, 200, 300, 400, 500, 600, 700, 800, 900}

// axisStyle 描述家族内 <font> 条目的轴配置风格
type axisStyle int

const (
	// axisFull: sans-serif 全轴 (ital/wdth/wght)
	axisFull axisStyle = iota
	// axisWghtOnly: sys-sans-en / zh-* 仅 wght 轴
	axisWghtOnly
)

// familySpec 描述一个需要覆写字重的家族及其条目格式
type familySpec struct {
	openTag       string // 家族起始标签 (用于定位与生成)
	fontFile      string // 家族引用的字体文件
	postScript    string // postScriptName 属性 (无则为空)
	serifFallback bool   // 是否包含 fallbackFor="serif" 的 400 条目 (zh-Hans/zh-Hant)
	axis          axisStyle
}

// 所有生效家族: 英文 (sans-serif / sys-sans-en) 与中文 (zh-Hans / zh-Hant) 都要覆盖,
// 否则中文或英文单独使用时字重映射不生效 (issue #7)
var FamilySpecs = []familySpec{
	{openTag: `<family name="sans-serif">`, fontFile: "SysFont-Regular.ttf", axis: axisFull},
	{openTag: `<family name="sys-sans-en">`, fontFile: "SysSans-En-Regular.ttf", postScript: "OPlusSansEn", axis: axisWghtOnly},
	{openTag: `<family lang="zh-Hans">`, fontFile: "SysSans-Hans-Regular.ttf", postScript: "OPPO_Sans_4.0_SC", serifFallback: true, axis: axisWghtOnly},
	{openTag: `<family lang="zh-Hant,zh-Bopo">`, fontFile: "SysSans-Hant-Regular.ttf", postScript: "OPPO_Sans_4.0_TC", serifFallback: true, axis: axisWghtOnly},
}

// 主配置文件名 (唯一源)
const SourceXMLRel = "system/etc/fonts.xml"

// 派生配置 (与 fonts.xml 内容一致, 由 -sync 复制生成)
var DerivedXMLRel = []string{
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

// 生成 sans-serif 家族段 (mode 1/2/3), 使用标准 9 档字重
func GenerateFamily(min, max, mode int, customMap map[int]int) string {
	return generateFamily(FamilySpecs[0], Weights, min, max, mode, customMap)
}

// 生成单条 <font> 条目 (按家族风格)
func fontEntryFor(spec familySpec, weight, axisWght int) string {
	if spec.axis == axisFull {
		return fmt.Sprintf(`        <font weight="%d" style="normal">%s
            <axis tag="ital" stylevalue="0" />
            <axis tag="wdth" stylevalue="100" />
            <axis tag="wght" stylevalue="%d" />
        </font>`, weight, spec.fontFile, axisWght)
	}
	return fmt.Sprintf(`        <font weight="%d" style="normal"  postScriptName="%s" >%s
            <axis tag="wght" stylevalue="%d"/>
        </font>`, weight, spec.postScript, spec.fontFile, axisWght)
}

// 生成 zh-Hans/zh-Hant 家族的 fallbackFor="serif" 400 条目
func serifEntry(spec familySpec) string {
	return fmt.Sprintf(`        <font weight="400" style="normal" fallbackFor="serif"
            postScriptName="%s">%s
        </font>`, spec.postScript, spec.fontFile)
}

// 生成家族段 (mode 1=裁切 2=平均 3=自定义映射)
// weights 为声明字重集 (取自原家族, 保持设备 XML 一致性)
func generateFamily(spec familySpec, weights []int, min, max, mode int, customMap map[int]int) string {
	ws := weights
	if mode == 3 && len(customMap) > 0 {
		ws = make([]int, 0, len(customMap))
		for w := range customMap {
			ws = append(ws, w)
		}
		sort.Ints(ws)
	}
	var lines []string
	for _, w := range ws {
		if mode == 1 && (w < min || w > max) {
			continue
		}
		axis := w
		if mode == 2 {
			axis = AveragedAxis(min, max, w)
		} else if mode == 3 {
			if v, ok := customMap[w]; ok {
				axis = v
			} else {
				axis = AveragedAxis(min, max, w)
			}
		}
		lines = append(lines, fontEntryFor(spec, w, axis))
		if spec.serifFallback && w == 400 {
			lines = append(lines, serifEntry(spec))
		}
	}
	return "    " + spec.openTag + "\n" + strings.Join(lines, "\n") + "\n    </family>"
}

// 在完整 XML 中覆写指定家族段; 家族不存在时原样返回
func replaceFamily(xml string, spec familySpec, mode, min, max int, customMap map[int]int) string {
	start := findFamilyStart(xml, spec.openTag)
	if start < 0 {
		return xml
	}
	end := matchFamilyClose(xml, start+len(spec.openTag))
	if end < 0 {
		return xml
	}
	// 字重集选择: 裁切保留原家族声明字重 (兼容设备 XML), 平均分配固定 9 档完整粗细,
	// 自定义映射由映射文件的键决定
	weights := Weights
	if mode == 1 {
		if ex := extractWeights(xml[start:end]); len(ex) > 0 {
			weights = ex
		}
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
	return xml[:lineStart] + generateFamily(spec, weights, min, max, mode, customMap) + "\n" + xml[lineEnd:]
}

// 覆写全部生效家族 (mode 0 原样返回)
func ApplyWghtMode(xml string, mode, min, max int, customMap map[int]int) string {
	if mode == 0 {
		return xml
	}
	result := xml
	for _, spec := range FamilySpecs {
		result = replaceFamily(result, spec, mode, min, max, customMap)
	}
	return result
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

// 从紧随 <family ...> 之后的位置开始, 找到配对的 </family> (含嵌套),
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

var weightRe = regexp.MustCompile(`<font weight="(\d+)"`)

// 提取家族段内声明字重 (去重并升序), 保留设备 XML 的字重集
func extractWeights(block string) []int {
	var ws []int
	seen := map[int]bool{}
	for _, m := range weightRe.FindAllStringSubmatch(block, -1) {
		if n, err := strconv.Atoi(m[1]); err == nil && !seen[n] {
			ws = append(ws, n)
			seen[n] = true
		}
	}
	sort.Ints(ws)
	return ws
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

// ApplyToDir 覆写模块根目录下的主配置 fonts.xml; sync 为 true 时复制到各派生配置
// 返回覆写/同步的文件总数
func ApplyToDir(xmlDir string, mode, min, max int, customMap map[int]int, sync bool) (int, error) {
	src := filepath.Join(xmlDir, SourceXMLRel)
	data, err := os.ReadFile(src)
	if err != nil {
		return 0, fmt.Errorf("读取 %s 失败: %w", SourceXMLRel, err)
	}
	replaced := ApplyWghtMode(string(data), mode, min, max, customMap)
	changed := 0
	if replaced != string(data) {
		if err := os.WriteFile(src, []byte(replaced), 0o644); err != nil {
			return changed, fmt.Errorf("写入失败 %s: %w", SourceXMLRel, err)
		}
		changed++
		fmt.Printf("[✓] 已覆写: %s\n", SourceXMLRel)
	} else {
		fmt.Printf("[-] 无变化: %s\n", SourceXMLRel)
	}
	if sync {
		for _, rel := range DerivedXMLRel {
			p := filepath.Join(xmlDir, rel)
			if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
				return changed, fmt.Errorf("创建目录失败 %s: %w", filepath.Dir(p), err)
			}
			if err := os.WriteFile(p, []byte(replaced), 0o644); err != nil {
				return changed, fmt.Errorf("同步失败 %s: %w", rel, err)
			}
			changed++
			fmt.Printf("[✓] 已同步: %s\n", rel)
		}
	}
	return changed, nil
}
