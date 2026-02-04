import sys
import os
import importlib
from fontTools.ttLib import TTCollection

# 配置工具映射
TOOLS = {
    'ttx': 'fontTools.ttx',
    'subset': 'fontTools.subset',
    'merge': 'fontTools.merge',
}

def split_ttc(ttc_path, out_dir):
    if not os.path.exists(out_dir):
        os.makedirs(out_dir)
    try:
        print(f"[*] 正在读取: {ttc_path}")
        collection = TTCollection(ttc_path)
        print(f"[*] 检测到 {len(collection)} 个子字体")
        for i, font in enumerate(collection):
            # 这里的获取逻辑更稳健一点
            name_record = font['name'].getDebugName(1)
            name = name_record if name_record else f"subfont_{i}"
            safe_name = "".join([c for c in name if c.isalnum() or c in (' ', '_')]).strip()
            save_path = os.path.join(out_dir, f"{safe_name}.ttf")
            font.save(save_path)
            print(f"[+] 已保存: {save_path}")
        return True
    except Exception as e:
        print(f"[!] 拆分失败: {e}")
        return False

def main():
    # 打印当前收到的参数，方便调试（打包后如果报错能看到原因）
    # print(f"DEBUG: sys.argv = {sys.argv}") 

    if len(sys.argv) < 2:
        print("FontTool Binary Toolkit")
        print("用法: fonttool [split|ttx|subset|merge] [args...]")
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == 'split':
        if len(sys.argv) < 4:
            print("用法: fonttool split <TTC文件> <输出目录>")
            sys.exit(1)
        success = split_ttc(sys.argv[2], sys.argv[3])
        sys.exit(0 if success else 1)
    
    elif cmd in TOOLS:
        module = importlib.import_module(TOOLS[cmd])
        # 彻底重构 argv，去掉 'fonttool' 和 'ttx' 这类前缀
        sys.argv = sys.argv[1:] 
        module.main()
    
    else:
        # 如果不是内置命令，也不是映射命令，报错退出，而不是回退给 ttx
        print(f"[错误] 未知指令: {cmd}")
        print("支持: split, ttx, subset, merge")
        sys.exit(1)

if __name__ == "__main__":
    main()
