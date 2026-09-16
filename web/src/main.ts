import './material';
// 各功能模块在导入时完成自身初始化 (绑定事件/加载数据)
import './slots';
import './wght';
import './metrics';
import './apply';
import './testFonts';
import './home';
import './navigation';

import { enableEdgeToEdge } from './ksu';
import { FontEditorToolDef, MiFontToolDef, ToolHost } from './tools';

// edge-to-edge: 启用安全区 insets, 内容延伸至状态栏/底部小白条区域,
// insets.css 的 --window-inset-* 变量随之生效, 底栏据此避让
enableEdgeToEdge(true);

// ---------------- 工具 ----------------
const toolHost = new ToolHost();
toolHost.register(MiFontToolDef);
toolHost.register(FontEditorToolDef);
