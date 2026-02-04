import os
import sys
import argparse
from fontTools.ttLib import TTCollection

def get_font_name(font):
    """从字体元数据中提取可读名称"""
    name = ""
    # 优先寻找英文全名 (nameID 4, platformID 3)
    for record in font['name'].names:
        if record.nameID == 4:
            try:
                name = record.toUnicode().replace(" ", "_")
                if record.platformID == 3: # Windows 平台 ID 比较稳
                    break
            except:
                continue
    return name if name else "unknown_font"

def main():
    parser = argparse.ArgumentParser(description="TTC 字体提取工具 - 由于乐 Yule 维护")
    parser.add_argument("input", help="输入的 .ttc 文件路径")
    parser.add_argument("-o", "--output", help="输出目录 (默认为当前目录下的 extracted_fonts)")
    
    args = parser.parse_args()
    
    input_file = args.input
    output_base = args.output if args.output else os.path.join(os.getcwd(), "extracted_fonts")

    if not os.path.isfile(input_file):
        print(f"[-] 错误: 找不到输入文件 '{input_file}'")
        return

    if not os.path.exists(output_base):
        os.makedirs(output_base)
        print(f"[*] 已创建输出目录: {output_base}")

    print("="*50)
    print(f"[*] 正在读取集合: {os.path.basename(input_file)}")
    
    try:
        collection = TTCollection(input_file)
        total = len(collection)
        print(f"[*] 发现子字体总数: {total}")
        print("="*50)

        for i, font in enumerate(collection):
            font_name = get_font_name(font)
            file_name = f"{font_name}.ttf"
            output_path = os.path.join(output_base, file_name)
            
            # 处理重名问题
            counter = 1
            while os.path.exists(output_path):
                output_path = os.path.join(output_base, f"{font_name}_{counter}.ttf")
                counter += 1

            print(f"[{i+1}/{total}] 正在导出: {os.path.basename(output_path)} ...", end="\r")
            font.save(output_path)
            
        print(f"\n" + "="*50)
        print(f"[+] 提取完成！所有文件保存在: {output_base}")

    except Exception as e:
        print(f"\n[-] 发生致命错误: {e}")

if __name__ == "__main__":
    main()
