package wght

import (
	"fmt"
	"os"
	"path/filepath"
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

// 所有生效家族 (sans-serif / sys-sans-en / zh-Hans / zh-Hant) 都应被覆写,
// 保证中英文都有正确的字重映射 (issue #7)
func TestApplyWghtModeAllFamilies(t *testing.T) {
	xml := "<?xml version=\"1.0\"?>\n<familyset version=\"23\">\n" +
		"    <family name=\"sans-serif\">\n        <font weight=\"100\" style=\"normal\">SysFont-Regular.ttf\n" +
		"            <axis tag=\"wght\" stylevalue=\"100\" />\n        </font>\n    </family>\n" +
		"    <family name=\"sys-sans-en\">\n        <font weight=\"100\" style=\"normal\" postScriptName=\"OPlusSansEn\">SysSans-En-Regular.ttf\n" +
		"            <axis tag=\"wght\" stylevalue=\"100\"/>\n        </font>\n    </family>\n" +
		"    <family lang=\"zh-Hans\">\n        <font weight=\"100\" style=\"normal\" postScriptName=\"OPPO_Sans_4.0_SC\">SysSans-Hans-Regular.ttf\n" +
		"            <axis tag=\"wght\" stylevalue=\"100\"/>\n        </font>\n        <font weight=\"400\" style=\"normal\" fallbackFor=\"serif\"\n" +
		"            postScriptName=\"OPPO_Sans_4.0_SC\">SysSans-Hans-Regular.ttf\n        </font>\n    </family>\n" +
		"    <family lang=\"zh-Hant,zh-Bopo\">\n        <font weight=\"100\" style=\"normal\" postScriptName=\"OPPO_Sans_4.0_TC\">SysSans-Hant-Regular.ttf\n" +
		"            <axis tag=\"wght\" stylevalue=\"100\"/>\n        </font>\n    </family>\n" +
		"</familyset>\n"
	replaced := ApplyWghtMode(xml, 2, 150, 700, nil)
	for _, tag := range []string{
		`<family name="sans-serif">`,
		`<family name="sys-sans-en">`,
		`<family lang="zh-Hans">`,
		`<family lang="zh-Hant,zh-Bopo">`,
	} {
		if strings.Count(replaced, tag) != 1 {
			t.Errorf("覆写后应保留且只出现一次 %s", tag)
		}
	}
	// zh-Hans 家族应保留 serif fallback 条目
	if !strings.Contains(replaced, `fallbackFor="serif"`) {
		t.Error("zh-Hans 家族丢失 fallbackFor=\"serif\" 条目")
	}
	// 各家族字号都应含平均分配后的 200 -> 233
	if strings.Count(replaced, `stylevalue="233"`) != 4 {
		t.Errorf("各家族应有 4 处 233 轴值, 实际 %d", strings.Count(replaced, `stylevalue="233"`))
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

// ApplyToDir 只覆写主配置 fonts.xml, sync 时复制到各派生配置 (issue #7)
func TestApplyToDirSync(t *testing.T) {
	dir := t.TempDir()
	mkfile := func(rel, content string) {
		p := dir + "/" + rel
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	base := "<familyset>\n" +
		"    <family name=\"sans-serif\">\n" +
		"        <font weight=\"100\" style=\"normal\">SysFont-Regular.ttf\n" +
		"            <axis tag=\"wght\" stylevalue=\"100\" />\n" +
		"        </font>\n" +
		"    </family>\n" +
		"</familyset>\n"
	mkfile(SourceXMLRel, base)
	// 派生配置预置旧内容, 验证被覆盖
	for _, rel := range DerivedXMLRel {
		mkfile(rel, "<familyset>\n</familyset>\n")
	}

	changed, err := ApplyToDir(dir, 2, 150, 700, nil, true, false)
	if err != nil {
		t.Fatalf("ApplyToDir: %v", err)
	}
	// 1 份主配置 + 5 份派生 = 6
	if changed != 1+len(DerivedXMLRel) {
		t.Fatalf("changed = %d, want %d", changed, 1+len(DerivedXMLRel))
	}
	src, err := os.ReadFile(dir + "/" + SourceXMLRel)
	if err != nil {
		t.Fatal(err)
	}
	for _, rel := range DerivedXMLRel {
		data, err := os.ReadFile(dir + "/" + rel)
		if err != nil {
			t.Fatalf("派生配置缺失 %s: %v", rel, err)
		}
		if string(data) != string(src) {
			t.Errorf("派生配置 %s 与 fonts.xml 不一致", rel)
		}
	}
	if !strings.Contains(string(src), `stylevalue="233"`) {
		t.Error("覆写后应含平均分配值 233")
	}
}

// mode 0 + sync: 不改内容, 仅把 fonts.xml 复制到派生配置 (customize.sh 用)
func TestApplyToDirSyncMode0(t *testing.T) {
	dir := t.TempDir()
	base := "<familyset>\n</familyset>\n"
	if err := os.MkdirAll(dir+"/system/etc", 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(dir+"/"+SourceXMLRel, []byte(base), 0o644); err != nil {
		t.Fatal(err)
	}
	changed, err := ApplyToDir(dir, 0, 100, 900, nil, true, false)
	if err != nil {
		t.Fatalf("ApplyToDir: %v", err)
	}
	if changed != len(DerivedXMLRel) {
		t.Fatalf("mode0+sync changed = %d, want %d", changed, len(DerivedXMLRel))
	}
	for _, rel := range DerivedXMLRel {
		data, err := os.ReadFile(dir + "/" + rel)
		if err != nil {
			t.Fatalf("派生配置缺失 %s: %v", rel, err)
		}
		if string(data) != base {
			t.Errorf("派生配置 %s 内容不一致", rel)
		}
	}
}

// ---------- 固定行距字距的度量载体 (issue #17) ----------

// 四个生效家族各带一个条目, 用于验证载体插入位置与数量
const metricsSampleXML = `<familyset version="23">
    <family name="sans-serif">
        <font weight="400" style="normal">SysFont-Regular.ttf
            <axis tag="wght" stylevalue="400" />
        </font>
    </family>
    <family name="sys-sans-en">
        <font weight="400" style="normal"  postScriptName="OPlusSansEn" >SysSans-En-Regular.ttf
            <axis tag="wght" stylevalue="400"/>
        </font>
    </family>
    <family lang="zh-Hans">
        <font weight="400" style="normal" fallbackFor="serif"
            postScriptName="OPPO_Sans_4.0_SC">SysSans-Hans-Regular.ttf
        </font>
    </family>
    <family lang="zh-Hant,zh-Bopo">
        <font weight="400" style="normal">SysSans-Hant-Regular.ttf
        </font>
    </family>
</familyset>
`

// 开启: 每个家族首位都有全 9 档字重的载体条目, 且排在原条目之前
func TestApplyMetricsInsert(t *testing.T) {
	on := ApplyMetrics(metricsSampleXML, true)
	if got := strings.Count(on, MetricsFontFile); got != 9*len(FamilySpecs) {
		t.Fatalf("载体条目数 = %d, want %d", got, 9*len(FamilySpecs))
	}
	// 逐个家族检查: 载体必须出现在家族内第一个原条目之前
	for _, spec := range FamilySpecs {
		famStart := strings.Index(on, spec.openTag)
		if famStart < 0 {
			t.Fatalf("找不到家族 %s", spec.openTag)
		}
		famEnd := strings.Index(on[famStart:], "</family>")
		block := on[famStart : famStart+famEnd]
		firstCarrier := strings.Index(block, MetricsFontFile)
		firstOriginal := strings.Index(block, spec.fontFile)
		if firstCarrier < 0 || firstOriginal < 0 || firstCarrier > firstOriginal {
			t.Errorf("%s: 载体未排在家族首位 (carrier=%d original=%d)", spec.openTag, firstCarrier, firstOriginal)
		}
		for _, w := range Weights {
			if !strings.Contains(block, fmt.Sprintf(`<font weight="%d" style="normal">%s</font>`, w, MetricsFontFile)) {
				t.Errorf("%s: 缺少字重 %d 的载体条目", spec.openTag, w)
			}
		}
	}
	// 结构完整性
	if open, closeN := strings.Count(on, "<family "), strings.Count(on, "</family>"); open != closeN {
		t.Errorf("family 标签不平衡: open=%d close=%d", open, closeN)
	}
}

// 关闭: 恢复到与原始 XML 逐字节一致 (先移除再插入, 不留残余)
func TestApplyMetricsRemoveRestores(t *testing.T) {
	on := ApplyMetrics(metricsSampleXML, true)
	off := ApplyMetrics(on, false)
	if off != metricsSampleXML {
		t.Errorf("关闭后未还原原 XML:\n%s", off)
	}
}

// 幂等: 重复开启结果一致; 原 XML 无标记时关闭也不改动
func TestApplyMetricsIdempotent(t *testing.T) {
	once := ApplyMetrics(metricsSampleXML, true)
	twice := ApplyMetrics(once, true)
	if once != twice {
		t.Errorf("重复开启结果不一致")
	}
	if off := ApplyMetrics(metricsSampleXML, false); off != metricsSampleXML {
		t.Errorf("未开启过的 XML 在关闭时被改动")
	}
}

// 家族缺失时不应报错, 也不应改动其余内容
func TestApplyMetricsMissingFamily(t *testing.T) {
	xml := "<familyset>\n    <family name=\"serif\">\n    </family>\n</familyset>\n"
	if got := ApplyMetrics(xml, true); got != xml {
		t.Errorf("无生效家族时被改动:\n%s", got)
	}
}

// 与字重覆写叠加: 两者互不破坏
func TestApplyMetricsWithWghtMode(t *testing.T) {
	wghtDone := ApplyWghtMode(metricsSampleXML, 1, 300, 700, nil)
	both := ApplyMetrics(wghtDone, true)
	if !strings.Contains(both, MetricsFontFile) {
		t.Fatal("叠加后丢失载体条目")
	}
	// 关闭载体后应回到字重覆写的结果
	if got := ApplyMetrics(both, false); got != wghtDone {
		t.Errorf("关闭载体后未回到字重覆写结果:\n%s", got)
	}
}

// -metrics auto: 读 FONTS/metrics.txt, 内容为 "1" 才开启
func TestResolveMetrics(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "FONTS"), 0o755); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		mode, file string
		want       bool
	}{
		{"on", "", true},
		{"off", "1", false},
		{"auto", "", false},   // 文件不存在
		{"auto", "0", false},  // 显式关闭
		{"auto", "1", true},   // 开启
		{"auto", "1\n", true}, // 容忍行尾换行
	}
	for _, c := range cases {
		p := filepath.Join(dir, "FONTS", "metrics.txt")
		if c.file == "" {
			_ = os.Remove(p)
		} else if err := os.WriteFile(p, []byte(c.file), 0o644); err != nil {
			t.Fatal(err)
		}
		if got := ResolveMetrics(dir, c.mode); got != c.want {
			t.Errorf("ResolveMetrics(mode=%q, file=%q) = %v, want %v", c.mode, c.file, got, c.want)
		}
	}
}

// 载体文件缺失时不插入条目 (避免 fonts.xml 引用不存在的字体)
func TestApplyToDirMetricsWithoutFile(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(dir+"/system/etc", 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(dir+"/"+SourceXMLRel, []byte(metricsSampleXML), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := ApplyToDir(dir, 0, 100, 900, nil, false, true); err != nil {
		t.Fatalf("ApplyToDir: %v", err)
	}
	data, err := os.ReadFile(dir + "/" + SourceXMLRel)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), MetricsFontFile) {
		t.Error("载体文件缺失时仍写入了条目")
	}
}

// 载体文件存在时写入条目
func TestApplyToDirMetricsWithFile(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(dir+"/system/fonts", 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(dir+"/system/etc", 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(dir+"/system/fonts/"+MetricsFontFile, []byte("stub"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(dir+"/"+SourceXMLRel, []byte(metricsSampleXML), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := ApplyToDir(dir, 0, 100, 900, nil, false, true); err != nil {
		t.Fatalf("ApplyToDir: %v", err)
	}
	data, _ := os.ReadFile(dir + "/" + SourceXMLRel)
	if !strings.Contains(string(data), MetricsFontFile) {
		t.Error("载体文件存在时未写入条目")
	}
}
