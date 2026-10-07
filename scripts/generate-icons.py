#!/usr/bin/env python3
"""アイコン原画から、アプリ用のアイコン・スプラッシュ画像を生成する。

    python3 scripts/generate-icons.py      # 要 Pillow（pip install pillow）

入力  docs/singfolio ミント背景のアイコン.png（1254x1254、透過なし）
出力  assets/ 配下（app.json から参照される。手で編集せず、このスクリプトで再生成する）

  icon.png                       iOS・ストア用。原画を1024x1024へ縮小しただけ（透過なし）
  android-icon-foreground.png    アダプティブアイコンの前景（シンボルのみ、透過）
  android-icon-monochrome.png    テーマアイコン用（シンボルの輪郭のみ、単色）
  splash-icon.png                スプラッシュ用（シンボルのみ、透過）

Androidの背景は画像ではなく単色（app.json の android.adaptiveIcon.backgroundColor）。
その値は原画の背景色で、実行時に表示する。
"""

import math
import sys
from pathlib import Path
from statistics import median

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "docs" / "singfolio ミント背景のアイコン.png"
OUT = ROOT / "assets"
CANVAS = 1024

# アダプティブアイコンは108dpのキャンバスのうち、直径66dpの円の内側だけが
# どのランチャーのマスクでも欠けずに見える。
ANDROID_SAFE_RATIO = 66 / 108
# Android 12以降のスプラッシュは、アイコンを円形にマスクする（240dpのうち直径160dpの円）。
SPLASH_SAFE_RATIO = 160 / 240


def sample_median(img: Image.Image, box: tuple[int, int, int, int]) -> tuple[int, int, int]:
    x0, y0, x1, y1 = box
    px = [img.getpixel((x, y)) for x in range(x0, x1, 3) for y in range(y0, y1, 3)]
    return tuple(int(median(p[i] for p in px)) for i in range(3))


def extract_alpha(img: Image.Image, bg: tuple, fg: tuple) -> Image.Image:
    """背景色→シンボル色の線形補間とみなして、各画素のシンボル被覆率(0..1)を求める。"""
    d = [f - b for f, b in zip(fg, bg)]
    norm = sum(v * v for v in d)
    raw = img.tobytes()  # RGBRGB...
    out = bytearray(img.width * img.height)
    for i in range(len(out)):
        r, g, b = raw[3 * i : 3 * i + 3]
        t = ((r - bg[0]) * d[0] + (g - bg[1]) * d[1] + (b - bg[2]) * d[2]) / norm
        # 背景の微小なノイズは0に落とす
        out[i] = 0 if t < 0.03 else min(255, round(t * 255))
    return Image.frombytes("L", img.size, bytes(out))


def symbol_geometry(alpha: Image.Image) -> tuple[tuple[float, float], float]:
    """シンボルのbbox中心と、その中心から最も遠いシンボル画素までの距離を返す。"""
    w, h = alpha.size
    solid = alpha.point(lambda a: 255 if a >= 128 else 0)
    x0, y0, x1, y1 = solid.getbbox()
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    px = solid.load()
    radius = max(
        math.hypot(x - cx, y - cy)
        for y in range(y0, y1)
        for x in range(x0, x1)
        if px[x, y]
    )
    return (cx, cy), radius


def place_symbol(
    alpha: Image.Image,
    center: tuple[float, float],
    radius: float,
    color: tuple[int, int, int],
    safe_ratio: float,
) -> Image.Image:
    """シンボル全体が、キャンバス中央の直径 CANVAS*safe_ratio の円に収まるよう縮小して配置する。"""
    scale = (CANVAS * safe_ratio / 2) / radius
    size = round(alpha.width * scale)
    scaled = alpha.resize((size, size), Image.LANCZOS)
    ox = round(CANVAS / 2 - center[0] * scale)
    oy = round(CANVAS / 2 - center[1] * scale)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), color + (0,))
    canvas.paste(Image.new("RGBA", scaled.size, color + (255,)), (ox, oy), scaled)
    return canvas


def main() -> None:
    src = Image.open(SOURCE).convert("RGB")
    if src.width != src.height:
        sys.exit(f"原画が正方形ではありません: {src.size}")

    # 原画の背景色と、シンボル（左下の音符の頭）の色
    bg = sample_median(src, (0, 0, 100, 100))
    fg = sample_median(src, (260, 780, 420, 880))
    alpha = extract_alpha(src, bg, fg)
    center, radius = symbol_geometry(alpha)

    OUT.mkdir(exist_ok=True)
    src.resize((CANVAS, CANVAS), Image.LANCZOS).save(OUT / "icon.png")
    place_symbol(alpha, center, radius, fg, ANDROID_SAFE_RATIO).save(
        OUT / "android-icon-foreground.png"
    )
    place_symbol(alpha, center, radius, (0, 0, 0), ANDROID_SAFE_RATIO).save(
        OUT / "android-icon-monochrome.png"
    )
    place_symbol(alpha, center, radius, fg, SPLASH_SAFE_RATIO).save(OUT / "splash-icon.png")

    hex_ = lambda c: "#%02X%02X%02X" % c
    print(f"原画の背景色: {hex_(bg)}（android.adaptiveIcon.backgroundColor に設定する）")
    print(f"原画のシンボル色: {hex_(fg)}（splash の前景色の参考）")
    print(f"シンボルのbbox中心: {center}、最遠距離: {radius:.1f}px（原画 {src.width}px 基準）")


if __name__ == "__main__":
    main()
