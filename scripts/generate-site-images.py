#!/usr/bin/env python3
"""紹介ページ（docs/index.html、docs/ja/index.html）で使う画像を、assets/ の原画から生成する。

    python3 scripts/generate-site-images.py      # 要 Pillow（pip install pillow）

出力  docs/images/ 配下（手で編集せず、このスクリプトで再生成する）

  logo.webp            ブランド資料の画像（assets/app-store-artwork-3840x1646.png）から、アイコン＋ワードマークだけを
                       切り出したもの（下のタグラインは含めない。ページには言語ごとの文字で置くため）。
                       背景はMint（#C9FCED）の単色で、ページのヒーローの背景と同じ色。可逆圧縮
  en-01.webp ～ ja-06.webp
                       Google Playのスクリーンショット（assets/store-screenshots/play/{en,ja}/、1080x1920）を、
                       540x960へ縮めたもの。キャプション入りの画像で、ストアの掲載と同じもの
  og.jpg               og:image・twitter:image用（assets/play-feature-graphic-1024x500.png をJPEGにしただけ。
                       docs/_config.yml は *.png を除外しているので、PNGのままでは公開されない）

アイコン類（favicon.png・app-icon.png・apple-touch-icon.png）は generate-icons.py の担当。
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
OUT = ROOT / "docs" / "images"

ARTWORK = ASSETS / "app-store-artwork-3840x1646.png"
# ワードマーク（アイコン＋"Singfolio"）の範囲。実測：内容は x 1220-2619、y 653-904、タグラインは y 909 から。
# 下端はタグラインに食い込まないよう907で止める。背景は単色なので、余白が多少付いても継ぎ目は出ない
LOGO_BOX = (1216, 649, 2624, 907)
LOGO_WIDTH = 1128  # 表示幅の約3倍（ページでは約376pxで表示する）

SHOT_SIZE = (540, 960)
SHOT_QUALITY = 88
SHOTS = ["01-songs", "02-detail", "03-add", "04-practice", "05-show", "06-settings"]

FEATURE_GRAPHIC = ASSETS / "play-feature-graphic-1024x500.png"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    art = Image.open(ARTWORK).convert("RGB")
    logo = art.crop(LOGO_BOX)
    logo = logo.resize((LOGO_WIDTH, round(LOGO_WIDTH * logo.height / logo.width)), Image.LANCZOS)
    logo.save(OUT / "logo.webp", lossless=True, method=6)

    for lang in ("en", "ja"):
        for index, name in enumerate(SHOTS, start=1):
            src = Image.open(ASSETS / "store-screenshots" / "play" / lang / f"{name}.png").convert("RGB")
            if src.size != (1080, 1920):
                raise SystemExit(f"{lang}/{name}.png が 1080x1920 ではない: {src.size}")
            src.resize(SHOT_SIZE, Image.LANCZOS).save(
                OUT / f"{lang}-{index:02d}.webp", quality=SHOT_QUALITY, method=6
            )

    Image.open(FEATURE_GRAPHIC).convert("RGB").save(OUT / "og.jpg", quality=92, optimize=True)


if __name__ == "__main__":
    main()
