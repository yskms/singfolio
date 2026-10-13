#!/usr/bin/env python3
"""撮影画像の、縦に切る位置（px）を決める。compose.sh（Play 用）が使う。

使い方: python3 find_cut.py <画像> <今の大きさで見えている縦の長さ(px)>

見えている長さの付近で、横一列がほぼ一色の行（ボタンや行の隙間・余白）が続く帯を探し、その中心を
出力する。切り口が、ボタン・チップ・曲の行の途中に当たらないようにするため。見つからなければ、
何も出力しない（compose.sh は、そのまま切る）。探す範囲は、見えている長さの 93%〜115%。
"""
import subprocess
import sys

MIN_BAND = 28      # 帯の最小の高さ（px。1080幅の撮影画像のとき）。行の中の行間（15〜24px）ではなく、行やボタンの間（30px以上）に当てる
TOLERANCE = 2      # 一色とみなす、明るさ（0〜255）の最大の差。ほぼ白のボタンの背景（#F7F7F8 は白と 8 違う）を、余白と見なさない


def main() -> None:
    path, visible = sys.argv[1], float(sys.argv[2])
    width, height = map(int, subprocess.run(
        ['magick', 'identify', '-format', '%w %h', path], capture_output=True, text=True, check=True).stdout.split())
    gray = subprocess.run(
        ['magick', path, '-alpha', 'off', '-colorspace', 'Gray', '-depth', '8', 'gray:-'],
        capture_output=True, check=True).stdout
    low, high = int(visible * 0.93), min(height - 1, int(visible * 1.15))

    # 一色の行が MIN_BAND 以上続く帯を集める。
    bands, start = [], None
    for y in range(low, high + 1):
        row = gray[y * width:(y + 1) * width]
        flat = max(row) - min(row) <= TOLERANCE
        if flat and start is None:
            start = y
        if (not flat or y == high) and start is not None:
            end = y if flat else y - 1
            if end - start + 1 >= MIN_BAND:
                bands.append((start + end) // 2)
            start = None
    if bands:
        print(min(bands, key=lambda center: abs(center - visible)))


main()
