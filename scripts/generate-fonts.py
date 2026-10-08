#!/usr/bin/env python3
"""アプリに同梱するフォントを、npmパッケージの元データから生成する。

    python3 scripts/generate-fonts.py      # 要 fonttools（pip install fonttools）

入力  node_modules/@expo-google-fonts/inter、.../noto-sans-jp（devDependencies。
      Google Fontsの静的フォント。インストール済みであること）
出力  assets/fonts/ 配下（app.json の expo-font から参照される。手で編集せず、
      このスクリプトで再生成する）

  Inter-{Regular,Bold}.ttf                 元データのまま（約2,900グリフ、1ファイル約340KB）
  NotoSansJP-{Regular,Bold}.ttf            サブセット（後述）。元データは1ファイル約5.7MB
  OFL-Inter.txt、OFL-NotoSansJP.txt        フォントのライセンス（SIL OFL。再配布に付ける必要がある）

太さは Regular(400) / Bold(700) の2つ（src/theme/fonts.ts の FONT_WEIGHTS）。サイズのため
SemiBold(600)は同梱しない（Noto Sans JPは1太さ約2.5MB。600と700は、iOSシミュレータで
ヘッダー・タブのラベルを並べて見比べても、ほとんど違いが分からなかった）。
増減するときは、ここと src/theme/fonts.ts、app.json の expo-font を同じにする
（src/theme/fonts.test.ts が食い違いを検出する）。

Noto Sans JP のサブセット
  グリフ（約17,800）のうち、次のものだけを残す（約8,300グリフ、1ファイル約2.5MB）。
  - Latin（U+0020-024F）、Latin Extended Additional（ベトナム語など）、結合用の記号
    （U+0300-036F。NFCで合成できない文字のアクセントが、OSのフォントで描かれて
    ずれないように）、一般句読点、通貨、文字のような記号（™など）、矢印、数学記号、
    その他の記号（♥♡♪など。J-POPの曲名に出やすい）、CJKの記号・かな（U+3000-30FF）、
    全角・半角形
  - Windows日本語（cp932）の文字: JIS X 0208（第1・第2水準の漢字6,355字を含む）に、
    NEC・IBM拡張（髙・﨑など、人名に使う異体字）を足したもの
  曲名・アーティスト名はユーザーが入力するため、サブセットに無い文字（JIS X 0213の
  第3・第4水準の漢字など）は出うる。その文字だけは、OSのフォントで表示される。
  （第3・第4水準まで入れると、1ファイル約4MBになる）
  フォントの名前（family / PostScript名）は元のまま。レイアウト機能（縦書き・カーニングなど）は
  サブセッタの既定のまま残す。

再現性
  fonttools のバージョンが違うと、出力のバイナリが変わりうる。生成に使ったのは 4.66.1
  （実行時に表示する）。保存時刻（head.modified）は元データのままにして、同じ版なら、
  何度作り直しても同じバイナリになる。
"""

import shutil
import sys
from pathlib import Path

import fontTools
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
PACKAGES = ROOT / "node_modules" / "@expo-google-fonts"
OUT = ROOT / "assets" / "fonts"

# (出力のスタイル名, 太さ, パッケージ内のディレクトリ名)
WEIGHTS = [("Regular", 400, "400Regular"), ("Bold", 700, "700Bold")]

# cp932に足す範囲（元のフォントに無い文字は、サブセッタが無視する）
EXTRA_RANGES = [
    (0x0020, 0x024F),  # Latin（Basic Latin、Latin-1、Latin Extended-A/B）
    (0x0300, 0x036F),  # 結合用の記号
    (0x1E00, 0x1EFF),  # Latin Extended Additional（ベトナム語など）
    (0x2000, 0x206F),  # 一般句読点
    (0x20A0, 0x20CF),  # 通貨記号（€など）
    (0x2100, 0x214F),  # 文字のような記号（™など）
    (0x2190, 0x21FF),  # 矢印
    (0x2200, 0x22FF),  # 数学記号（−など）
    (0x2600, 0x26FF),  # その他の記号（♥♡♪♫など）
    (0x3000, 0x30FF),  # CJKの記号・句読点、ひらがな、カタカナ
    (0xFF00, 0xFFEF),  # 全角・半角形（半角カナを含む）
]


def cp932_codepoints() -> set[int]:
    """cp932（Windows日本語）で表せる文字のコードポイント。"""
    chars = set()
    for lead in list(range(0x81, 0xA0)) + list(range(0xE0, 0xFD)):
        for trail in range(0x40, 0xFD):
            try:
                text = bytes([lead, trail]).decode("cp932")
            except UnicodeDecodeError:
                continue
            if len(text) == 1:
                chars.add(ord(text))
    return chars


def noto_codepoints() -> list[int]:
    chars = cp932_codepoints()
    for lo, hi in EXTRA_RANGES:
        chars.update(range(lo, hi + 1))
    return sorted(chars)


def subset_font(src: Path, dst: Path, codepoints: list[int]) -> None:
    options = subset.Options()
    options.hinting = False  # 元データはヒンティングを持たない（持っていても画面密度では効かない）
    options.notdef_outline = True
    font = TTFont(src, recalcTimestamp=False)  # 保存時刻を変えない（同じ入力から同じバイナリにする）
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)
    font.save(dst)


def check_subset(src: Path, dst: Path, codepoints: list[int]) -> int:
    """元データにある文字が、サブセットから欠けていないことを確かめる。残ったグリフ数を返す。"""
    before = TTFont(src).getBestCmap()
    after = TTFont(dst)
    kept = after.getBestCmap()
    missing = [c for c in codepoints if c in before and c not in kept]
    if missing:
        sys.exit(f"{dst.name}: サブセットで欠けた文字があります: {[hex(c) for c in missing[:10]]}")
    # 必ず出る文字（かな・常用漢字の代表・Latin・音符）。元データに無ければ、前提が崩れている。
    for sample in "あいうえおアイウエオ日本語歌檸檬髙﨑ABCabc0123♪♥♡™€−é\u1ea1\u0301":
        if ord(sample) not in kept:
            sys.exit(f"{dst.name}: 「{sample}」が含まれていません。元データを確認してください。")
    return len(after.getGlyphOrder())


def main() -> None:
    for package in ("inter", "noto-sans-jp"):
        if not (PACKAGES / package).is_dir():
            sys.exit(f"{PACKAGES / package} がありません。先に `npm install` してください。")
    print(f"fonttools {fontTools.version}")
    OUT.mkdir(parents=True, exist_ok=True)
    for stale in OUT.glob("*.ttf"):  # 太さを減らしたときに、古いファイルが残らないようにする
        stale.unlink()

    codepoints = noto_codepoints()
    for style, _weight, directory in WEIGHTS:
        shutil.copyfile(
            PACKAGES / "inter" / directory / f"Inter_{directory}.ttf", OUT / f"Inter-{style}.ttf"
        )
        src = PACKAGES / "noto-sans-jp" / directory / f"NotoSansJP_{directory}.ttf"
        dst = OUT / f"NotoSansJP-{style}.ttf"
        subset_font(src, dst, codepoints)
        glyphs = check_subset(src, dst, codepoints)
        print(f"{dst.name}: {glyphs}グリフ、{dst.stat().st_size / 1e6:.1f}MB（元データ {src.stat().st_size / 1e6:.1f}MB）")

    shutil.copyfile(PACKAGES / "inter" / "LICENSE_FONT", OUT / "OFL-Inter.txt")
    shutil.copyfile(PACKAGES / "noto-sans-jp" / "LICENSE_FONT", OUT / "OFL-NotoSansJP.txt")


if __name__ == "__main__":
    main()
