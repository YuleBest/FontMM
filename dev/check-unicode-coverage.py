#!/usr/bin/env python3
"""check-unicode-coverage.py — 本地模拟 Android 字体 fallback 链, 统计 Unicode 区块覆盖率.

原理: 按 fonts.xml 中 family 的声明顺序构成 fallback 链, 逐字形检查覆盖;
      用 fontTools 读取各字体 cmap, 对照 Unicode Blocks.txt 统计每个区块的覆盖率.

用法:
  python3 dev/check-unicode-coverage.py                        # 全部区块 (自动获取 Blocks.txt 缓存到 dev/)
  python3 dev/check-unicode-coverage.py --blocks-file Blocks.txt
  python3 dev/check-unicode-coverage.py Hebrew "Archaic"       # 只测匹配的区块名 (子串)
"""
import argparse
import os
import urllib.request
import xml.etree.ElementTree as ET

from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS_DIR = os.path.join(ROOT, 'src', 'system', 'fonts')
FONTS_XML = os.path.join(ROOT, 'src', 'system', 'etc', 'fonts.xml')
BLOCKS_URL = 'https://www.unicode.org/Public/draft/ucd/Blocks.txt'


def load_chain(xml_path):
    """按 fonts.xml 声明顺序提取 fallback 链 (全部 font 文件名, 去重)."""
    root = ET.parse(xml_path).getroot()
    chain, seen = [], set()
    for family in root.iter('family'):
        for font in family.iter('font'):
            name = (font.text or '').strip()
            if name and name not in seen:
                seen.add(name)
                chain.append(name)
    return chain


def load_cmaps(fonts_dir, chain):
    cmaps, missing = {}, []
    for name in chain:
        path = os.path.join(fonts_dir, name)
        if not os.path.exists(path):
            missing.append(name)
            continue
        try:
            cmaps[name] = TTFont(path, lazy=True).getBestCmap()
        except Exception as exc:  # 解析失败 (如特殊字体) 跳过
            missing.append(f'{name} ({exc})')
    return cmaps, missing


def load_blocks(path):
    blocks = []
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith('#') or '..' not in line:
                continue
            rng, name = line.split(';')
            start, end = (int(x, 16) for x in rng.strip().split('..'))
            blocks.append((name.strip(), start, end))
    return blocks


def fetch_blocks(dest):
    print(f'[i] 获取 Blocks.txt: {BLOCKS_URL}')
    urllib.request.urlretrieve(BLOCKS_URL, dest)
    return dest


def main():
    ap = argparse.ArgumentParser(description='本地 Unicode 覆盖测试 (模拟 fonts.xml fallback 链)')
    ap.add_argument('blocks', nargs='*', help='只测试匹配的区块名 (子串, 如 Hebrew)')
    ap.add_argument('--blocks-file', help='本地 Blocks.txt 路径 (默认自动下载缓存到 dev/Blocks.txt)')
    args = ap.parse_args()

    chain = load_chain(FONTS_XML)
    print(f'[i] fallback 链: {len(chain)} 个字体 ({FONTS_XML})')
    cmaps, missing = load_cmaps(FONTS_DIR, chain)
    if missing:
        print(f'[!] 缺失/无法解析的字体: {missing}')
    if not cmaps:
        print('[!] 无可用字体, 退出', file=os.sys.stderr)
        return 1

    # 合并全部 cmap 为并集, 快速判字形
    union = set()
    for cm in cmaps.values():
        union.update(cm)
    print(f'[i] 可用字体 {len(cmaps)} 个, 字形码位并集 {len(union):,}')

    blocks_file = args.blocks_file
    if not blocks_file:
        blocks_file = os.path.join(ROOT, 'dev', 'Blocks.txt')
        if not os.path.exists(blocks_file):
            fetch_blocks(blocks_file)
    blocks = load_blocks(blocks_file)
    if args.blocks:
        blocks = [b for b in blocks if any(k.lower() in b[0].lower() for k in args.blocks)]

    print(f'\n{"Block":<42}{"Covered":>9}{"Total":>8}{"Pct":>9}  Status')
    print('-' * 76)
    failed = []
    for name, start, end in blocks:
        total = end - start + 1
        covered = sum(1 for cp in range(start, end + 1) if cp in union)
        pct = covered / total * 100 if total else 0
        status = 'PASS' if covered == total else ('FAIL' if pct < 95 else '')
        if status == 'FAIL':
            failed.append(name)
        print(f'{name:<42}{covered:>9}{total:>8}{pct:>8.2f}%  {status}')

    print(f'\n[=] 共 {len(blocks)} 个区块, FAIL (<95%): {len(failed)} 个')
    for name in failed:
        print(f'    - {name}')
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
