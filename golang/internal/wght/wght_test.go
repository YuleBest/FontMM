package wght

import (
	"fmt"
	"strings"
	"testing"
)

// 平均分配公式 (MiSansVF 150-700, 与用户示例一致)
func TestAveragedAxis(t *testing.T) {
	want := map[int]int{100: 150, 200: 233, 300: 316, 400: 400, 500: 460, 600: 520, 700: 580, 800: 640, 900: 700}
	for w, v := range want {
		if got := AveragedAxis(150, 700, w); got != v {
			t.Errorf("AveragedAxis(150,700,%d) = %d, want %d", w, got, v)
		}
	}
}

func extractAttrs(family string) ([]int, []int) {
	var ws, axes []int
	for _, line := range strings.Split(family, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "<font weight=") {
			var w int
			if _, err := fmt.Sscanf(line, "<font weight=\"%d\"", &w); err == nil {
				ws = append(ws, w)
			}
		}
		if strings.Contains(line, `<axis tag="wght" stylevalue="`) {
			var v int
			if _, err := fmt.Sscanf(line, "<axis tag=\"wght\" stylevalue=\"%d\"", &v); err == nil {
				axes = append(axes, v)
			}
		}
	}
	return ws, axes
}

func TestGenerateFamilyTrim(t *testing.T) {
	family := GenerateFamily(150, 700, 1, nil)
	ws, axes := extractAttrs(family)
	want := []int{200, 300, 400, 500, 600, 700}
	if len(ws) != len(want) {
		t.Fatalf("裁切 weight = %v, want %v", ws, want)
	}
	for i := range want {
		if ws[i] != want[i] || axes[i] != want[i] {
			t.Errorf("裁切第 %d 项 weight=%d axis=%d, want %d/%d", i, ws[i], axes[i], want[i], want[i])
		}
	}
}

func TestGenerateFamilyAvg(t *testing.T) {
	family := GenerateFamily(150, 700, 2, nil)
	ws, axes := extractAttrs(family)
	wantW := []int{100, 200, 300, 400, 500, 600, 700, 800, 900}
	wantA := []int{150, 233, 316, 400, 460, 520, 580, 640, 700}
	if len(ws) != 9 {
		t.Fatalf("平均 weight = %v", ws)
	}
	for i := range wantW {
		if ws[i] != wantW[i] || axes[i] != wantA[i] {
			t.Errorf("平均第 %d 项 weight=%d axis=%d, want %d/%d", i, ws[i], axes[i], wantW[i], wantA[i])
		}
	}
}

func TestGenerateFamilyCustom(t *testing.T) {
	m := map[int]int{150: 180, 250: 300, 400: 400, 700: 650}
	family := GenerateFamily(150, 700, 3, m)
	ws, axes := extractAttrs(family)
	wantW := []int{150, 250, 400, 700}
	wantA := []int{180, 300, 400, 650}
	for i := range wantW {
		if ws[i] != wantW[i] || axes[i] != wantA[i] {
			t.Errorf("自定义第 %d 项 weight=%d axis=%d, want %d/%d", i, ws[i], axes[i], wantW[i], wantA[i])
		}
	}
}

func TestApplyWghtMode(t *testing.T) {
	xml := "<?xml version=\"1.0\"?>\n<familyset>\n    <!-- #ifdef OPLUS_FEATURE_FONT_FLIP -->\n" +
		"    <family name=\"sans-serif\">\n        <font weight=\"100\" style=\"normal\">SysFont-Regular.ttf\n" +
		"            <axis tag=\"wght\" stylevalue=\"100\" />\n        </font>\n    </family>\n" +
		"    <!-- #endif -->\n</familyset>\n"
	replaced := ApplyWghtMode(xml, 2, 150, 700, nil)
	if !strings.Contains(replaced, "OPLUS_FEATURE_FONT_FLIP") {
		t.Error("覆写后 #ifdef 注释丢失")
	}
	if !strings.Contains(replaced, `stylevalue="233"`) {
		t.Error("覆写后缺少平均分配值 233")
	}
	if strings.Count(replaced, "<family name=\"sans-serif\">") != 1 {
		t.Error("sans-serif family 数量异常")
	}
	// mode 0 原样
	if ApplyWghtMode(xml, 0, 150, 700, nil) != xml {
		t.Error("mode=0 应原样返回")
	}
}

// 段内有嵌套 family (如 sans-serif-black) 时, 必须配对正确的 </family>,
// 不能把嵌套段的闭合当成外层闭合导致尾部丢失 (曾导致无法开机)
func TestApplyWghtModeNestedFamily(t *testing.T) {
	xml := "<?xml version=\"1.0\"?>\n<familyset>\n" +
		"    <!-- #ifdef OPLUS_FEATURE_FONT_FLIP -->\n" +
		"    <family name=\"sans-serif\">\n" +
		"        <family name=\"sans-serif-black\">\n" +
		"            <font weight=\"900\" style=\"normal\">Black.ttf\n" +
		"                <axis tag=\"wght\" stylevalue=\"900\" />\n" +
		"            </font>\n" +
		"        </family>\n" +
		"        <font weight=\"100\" style=\"normal\">SysFont-Regular.ttf\n" +
		"            <axis tag=\"wght\" stylevalue=\"100\" />\n" +
		"        </font>\n" +
		"    </family>\n" +
		"    <!-- #endif -->\n" +
		"    <family name=\"sans-serif-medium\">\n" +
		"        <font weight=\"500\" style=\"normal\">Medium.ttf\n" +
		"            <axis tag=\"wght\" stylevalue=\"500\" />\n" +
		"        </font>\n" +
		"    </family>\n" +
		"</familyset>\n"
	replaced := ApplyWghtMode(xml, 2, 150, 700, nil)
	// 后续的 sans-serif-medium 段必须完整保留 (嵌套闭合误配会导致其被切掉)
	if !strings.Contains(replaced, `<family name="sans-serif-medium">`) {
		t.Fatal("覆写后丢失了 sans-serif-medium 段")
	}
	if strings.Contains(replaced, `<family name="sans-serif-black">`) {
		t.Error("sans-serif-black 嵌套段未随段替换被移除")
	}
	// 闭合标签数量应与开始标签数量一致 (结构完整)
	open := strings.Count(replaced, "<family ")
	closeN := strings.Count(replaced, "</family>")
	if open != closeN {
		t.Errorf("family 标签不平衡: open=%d close=%d\n%s", open, closeN, replaced)
	}
	if !strings.HasSuffix(replaced, "</familyset>\n") {
		t.Errorf("文件末尾被破坏:\n%s", replaced)
	}
}

// 段首不应被重复缩进 (原行缩进 + 生成段自带缩进)
func TestApplyWghtModeNoDoubleIndent(t *testing.T) {
	xml := "<familyset>\n" +
		"    <family name=\"sans-serif\">\n" +
		"        <font weight=\"100\" style=\"normal\">SysFont-Regular.ttf\n" +
		"            <axis tag=\"wght\" stylevalue=\"100\" />\n" +
		"        </font>\n" +
		"    </family>\n" +
		"</familyset>\n"
	replaced := ApplyWghtMode(xml, 1, 100, 900, nil)
	if strings.Contains(replaced, "        <family name=\"sans-serif\">") {
		t.Errorf("段首出现重复缩进 (8 空格):\n%s", replaced)
	}
	if !strings.Contains(replaced, "    <family name=\"sans-serif\">") {
		t.Errorf("段首应为 4 空格缩进:\n%s", replaced)
	}
}
