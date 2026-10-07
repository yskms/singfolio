#!/usr/bin/env python3
"""アイコン原画から、Android用アイコンとスプラッシュの画像を生成する。

    python3 scripts/generate-icons.py      # 要 Pillow（pip install pillow）

入力  assets/icon.png（1024x1024、透過なし。iOS・ストア用のアイコンで、これが原画）
出力  assets/ 配下（app.json から参照される。手で編集せず、このスクリプトで再生成する）

  play-store-icon-512.png        Google Playのストア掲載用（原画を512x512へ縮小しただけ）
  favicon.png                    公開Web用のfavicon（原画を48x48へ縮小しただけ。app.jsonからは参照しない）
  android-icon-foreground.png    アダプティブアイコンの前景（シンボルのみ、透過）
  android-icon-monochrome.png    テーマアイコン用（シンボルの形のみ。色はAndroidが付けるので黒でよい）
  splash-icon.png                スプラッシュ用（シンボルのみ、透過）
  splash-icon-dark.png           ダークのスプラッシュ用（同上。色は原画の背景色＝Mint。
                                 ブランド資料のDarkアイコン（黒地にMintのシンボル）に合わせる）

Androidの背景は画像ではなく単色（app.json の android.adaptiveIcon.backgroundColor）。
その値は原画の背景色で、実行時に表示する。
"""

import math
import sys
from pathlib import Path
from statistics import median

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets"
SOURCE = OUT / "icon.png"
CANVAS = 1024
PLAY_STORE_ICON = 512
FAVICON = 48

# アダプティブアイコンは108dpのキャンバスのうち、直径66dpの円の内側だけが
# どのランチャーのマスクでも欠けずに見える。
ANDROID_SAFE_RATIO = 66 / 108
# Android 12以降のスプラッシュは、アイコンを円形にマスクする（240dpのうち直径160dpの円）。
SPLASH_SAFE_RATIO = 160 / 240


# 原画の色を取る位置（原画のレイアウトに依存する。原画を描き直したら見直すこと）。
BG_SAMPLE_BOX = (0, 0, 80, 80)  # 左上の背景
FG_SAMPLE_BOX = (212, 637, 343, 719)  # 左下の音符の頭
MAX_SAMPLE_SPREAD = 16  # 単色のはずの範囲内で許容する、中央値からの最大のずれ
MIN_BG_FG_DISTANCE = 60  # 背景色とシンボル色の最小距離（RGB空間）


def sample_color(img: Image.Image, box: tuple[int, int, int, int], label: str) -> tuple[int, int, int]:
    """box内の中央値を返す。boxが単色でなければ、位置が原画と合っていないとみなして止める。"""
    x0, y0, x1, y1 = box
    px = [img.getpixel((x, y)) for x in range(x0, x1, 3) for y in range(y0, y1, 3)]
    color = tuple(int(median(p[i] for p in px)) for i in range(3))
    spread = max(abs(p[i] - color[i]) for p in px for i in range(3))
    if spread > MAX_SAMPLE_SPREAD:
        sys.exit(f"{label}のサンプル範囲 {box} が単色ではありません（ずれ {spread}）。原画のレイアウトに合わせて見直してください。")
    return color


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
    if src.size != (CANVAS, CANVAS):
        sys.exit(f"原画は {CANVAS}x{CANVAS} である必要があります: {src.size}")

    # 原画の背景色と、シンボル（左下の音符の頭）の色
    bg = sample_color(src, BG_SAMPLE_BOX, "背景色")
    fg = sample_color(src, FG_SAMPLE_BOX, "シンボル色")
    if math.dist(bg, fg) < MIN_BG_FG_DISTANCE:
        sys.exit(f"背景色 {bg} とシンボル色 {fg} が近すぎます。サンプル位置を見直してください。")
    alpha = extract_alpha(src, bg, fg)
    center, radius = symbol_geometry(alpha)

    OUT.mkdir(exist_ok=True)
    src.resize((PLAY_STORE_ICON, PLAY_STORE_ICON), Image.LANCZOS).save(OUT / "play-store-icon-512.png")
    src.resize((FAVICON, FAVICON), Image.LANCZOS).save(OUT / "favicon.png")
    place_symbol(alpha, center, radius, fg, ANDROID_SAFE_RATIO).save(
        OUT / "android-icon-foreground.png"
    )
    place_symbol(alpha, center, radius, (0, 0, 0), ANDROID_SAFE_RATIO).save(
        OUT / "android-icon-monochrome.png"
    )
    place_symbol(alpha, center, radius, fg, SPLASH_SAFE_RATIO).save(OUT / "splash-icon.png")
    place_symbol(alpha, center, radius, bg, SPLASH_SAFE_RATIO).save(OUT / "splash-icon-dark.png")

    hex_ = lambda c: "#%02X%02X%02X" % c
    print(f"原画の背景色: {hex_(bg)}（android.adaptiveIcon.backgroundColor に設定する）")
    print(f"原画のシンボル色: {hex_(fg)}（splash の前景色の参考）")
    print(f"シンボルのbbox中心: {center}、最遠距離: {radius:.1f}px（原画 {src.width}px 基準）")


if __name__ == "__main__":
    main()
