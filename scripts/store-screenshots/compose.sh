#!/bin/zsh
set -euo pipefail

# ストア用スクリーンショットに、見出し・補足・背景を合成する。
# 構図: 上に見出し・補足、その下に、角丸の撮影画像（影つき）。撮影画像は下へはみ出させて切る。
#
# 入力: assets/store-screenshots/raw/{en,ja}/NN-name.png ... iOSシミュレータの撮影画像
#         （iPhone 18 Pro の 1206×2622）。App Store 用。
#       assets/store-screenshots/raw-android/{en,ja}/NN-name.png ... Androidエミュレータの
#         撮影画像（1080×2424）。Google Play 用。
#       どちらも `seed.py` の仮名のデータで撮る。画像の大きさは、`magick identify` で読む。
# 出力: assets/store-screenshots/ios/{en,ja}/ ... 1320×2868（App Store Connect の
#         「Dynamic Island (large)」。小さい端末の大きさへは自動で縮小される）
#       assets/store-screenshots/play/{en,ja}/ ... 1080×1920（Google Play。長辺が短辺の
#         2倍以内。9:16）
# 画像の下部は、iOS はタブバーが全部見える大きさに縮めて、下端を少しはみ出させる。Play は縦が
# 足りないので、はみ出させて切るが、切り口が要素の途中に当たらないよう、余白の帯に合わせて
# 画像の大きさを少し変える（find_cut.py）。
# 色・書体はブランド（CLAUDE.md「ブランド」「フォント」）。書体は assets/fonts/ の同梱のもの。
# 見出しは、枠に収まらないとき、文字の大きさを自動で下げる（全スライドで同じ大きさにそろえる）。
asset_dir="${0:A:h}/../../assets/store-screenshots"
asset_dir="${asset_dir:A}"
font_dir="${0:A:h}/../../assets/fonts"
font_dir="${font_dir:A}"
raw_dir_ios="$asset_dir/raw"
raw_dir_android="$asset_dir/raw-android"
script_dir="${0:A:h}"

# 一時ファイルは、専用のディレクトリに作り、終わったら（途中で止まっても）消す。
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

font_en_bold="$font_dir/Inter-Bold.ttf"
font_en_reg="$font_dir/Inter-Regular.ttf"
font_ja_bold="$font_dir/NotoSansJP-Bold.ttf"
font_ja_reg="$font_dir/NotoSansJP-Regular.ttf"

# colors.ts のブランドの色。紫の面の上の文字は濃い色にする（紫は白の上で約3.4:1）。
# bg_lavender は、Purple を白に約18%混ぜた淡い色（ブランド表にない派生色）。白に近い中立色は、
# 白いストアのページで画像の縁が消えるので、背景にしない（Mint・Lavender は色味があり、縁が見える）。
bg_mint='#C9FCED'
bg_lavender='#EEE5FF'
bg_purple='#9C70FE'
headline_color='#17171A'
# 補足の色は、ブランドの Text Secondary（#71717A）より濃い。Mint の上で 4.29:1（AA の 4.5 未満）、
# Lavender の上で 3.98:1 になるため。#52525B なら、どちらも 6:1 以上。
subhead_color='#52525B'
subhead_on_purple='#17171A'

# 文字の大きさ・余白は、幅1320のときの値。キャンバスの幅に比例させる。
base_w=1320

# 文字列の描画幅（px）。
text_width() {
  local font="$1" size="$2" text="$3"
  magick -font "$font" -pointsize "$size" label:"$text" -format '%w' info:
}

# 枠に収まる最大の文字の大きさ（上限 $2）。複数行のときは、一番長い行で見る。
fit_size() {
  local font="$1" max_size="$2" max_width="$3" text="$4"
  local size="$max_size" widest=0 line w
  while (( size > 20 )); do
    widest=0
    for line in "${(@f)text}"; do
      w=$(text_width "$font" "$size" "$line")
      (( w > widest )) && widest=$w
    done
    (( widest <= max_width )) && break
    size=$(( size - 2 ))
  done
  print -r -- "$size"
}

make_slide() {
  local input="$1" output="$2" canvas_w="$3" canvas_h="$4" headline="$5" subhead="$6" bg="$7" \
    font_bold="$8" font_reg="$9" sub_color="${10}" store="${11}" headline_size="${12}" subhead_size="${13}"
  local unit_num=$canvas_w unit_den=$base_w
  local margin=$(( 90 * unit_num / unit_den ))
  local top=$(( 130 * unit_num / unit_den ))
  local gap=$(( 56 * unit_num / unit_den ))
  local below=$(( 90 * unit_num / unit_den ))
  local shot_w=$(( canvas_w * 906 / 1000 ))
  local corner=$(( 42 * unit_num / unit_den ))

  # 見出しの高さは、描画して測る（行間を含む）。
  local headline_h
  headline_h=$(magick -font "$font_bold" -pointsize "$headline_size" -interline-spacing 14 label:"$headline" -format '%h' info:)
  local subhead_y=$(( top + headline_h + gap ))
  local subhead_h
  subhead_h=$(magick -font "$font_reg" -pointsize "$subhead_size" label:"$subhead" -format '%h' info:)
  local shot_y=$(( subhead_y + subhead_h + below ))

  local in_w in_h
  in_w=$(magick identify -format '%w' "$input")
  in_h=$(magick identify -format '%h' "$input")

  if [[ "$store" == ios ]]; then
    # タブバーが全部見えるよう、下端に少しはみ出す大きさに縮める（アイコンが半端に切れて見えるのを避ける）。
    local fitted=$(( (canvas_h - shot_y + 36 * unit_num / unit_den) * in_w / in_h ))
    (( fitted < shot_w )) && shot_w=$fitted
  else
    # Play は、キャンバスの下端が、余白の帯に当たるよう、画像の大きさを少し変える
    # （大きすぎる・小さすぎる変更になるときは、そのまま切る）。
    # 影を合成した画像は、影の分だけ上に 32px 広がっている（-shadow 30x25+0+18 の余白。上 32・左右 50）ので、
    # スマホの上端は shot_y より 32px 下になる。
    local room=$(( canvas_h - shot_y - 32 ))
    local visible=$(( room * in_w / shot_w )) cut
    cut=$(python3 "$script_dir/find_cut.py" "$input" "$visible")
    if [[ -n "$cut" ]]; then
      local aligned=$(( room * in_w / cut ))
      (( aligned >= canvas_w * 80 / 100 && aligned <= canvas_w * 95 / 100 )) && shot_w=$aligned
    fi
  fi

  local base="$tmp_dir/base.png" rounded="$tmp_dir/rounded.png" shadowed="$tmp_dir/shadowed.png"

  magick -size ${canvas_w}x${canvas_h} xc:"$bg" \
    -font "$font_bold" -fill "$headline_color" -pointsize "$headline_size" -gravity north \
    -interline-spacing 14 -annotate +0+${top} "$headline" \
    -font "$font_reg" -fill "$sub_color" -pointsize "$subhead_size" -gravity north \
    -annotate +0+${subhead_y} "$subhead" \
    "$base"

  magick "$input" -resize ${shot_w}x \
    \( +clone -alpha extract -draw "fill black polygon 0,0 0,$corner $corner,0 fill white circle $corner,$corner $corner,0" \
       \( +clone -flip \) -compose Multiply -composite \
       \( +clone -flop \) -compose Multiply -composite \
    \) -alpha off -compose CopyOpacity -composite \
    "$rounded"

  magick "$rounded" \( +clone -background black -shadow 30x25+0+18 \) +swap \
    -background none -layers merge +repage \
    "$shadowed"

  magick "$base" "$shadowed" -gravity north -geometry +0+${shot_y} -compose over -composite \
    -crop ${canvas_w}x${canvas_h}+0+0 +repage \
    -strip -colorspace sRGB -alpha off -depth 8 \
    "$output"

}

# 見出し・補足の改行は、文字列の中の \n（読み込みのとき、本物の改行に直す）。
typeset -A headline subhead background
read_slides() {
  local lang="$1"
  headline=() subhead=() background=()
  if [[ "$lang" == en ]]; then
    headline[01-songs]='Every song you can sing.'
    subhead[01-songs]='Ready, Practice, Want. All in one place.'
    headline[02-detail]='Your key. Your notes.'
    subhead[02-detail]='Remember how you sing each song.'
    headline[03-add]='Add a song in seconds.'
    subhead[03-add]='Artist, title, key, tags, and notes.'
    headline[04-practice]='From Practice to Ready.'
    subhead[04-practice]='Mark a song Ready when you’ve got it.'
    headline[05-show]='Show what you can sing.'
    subhead[05-show]='No keys. No notes. Just your songs.'
    headline[06-settings]='Light or dark.'
    subhead[06-settings]='English or Japanese. Your choice.'
  else
    headline[01-songs]='歌える曲を、ひとつの場所に。'
    subhead[01-songs]='歌える・練習中・歌いたいを、まとめて管理。'
    headline[02-detail]='キーも、メモも、曲ごとに。'
    subhead[02-detail]='自分の歌い方を、そのまま残せます。'
    headline[03-add]='曲の追加は、かんたん。'
    subhead[03-add]='アーティスト・曲名・キー・タグ・メモ。'
    headline[04-practice]='練習中から、歌える曲へ。'
    subhead[04-practice]='歌えるようになったら「歌える」へ。'
    headline[05-show]='歌える曲を、人に見せよう。'
    subhead[05-show]='キーも非公開メモも出ません。'
    headline[06-settings]='ライトにも、ダークにも。'
    subhead[06-settings]='日本語でも English でも使えます。'
  fi
  background=(
    [01-songs]="$bg_mint" [02-detail]="$bg_lavender" [03-add]="$bg_mint"
    [04-practice]="$bg_lavender" [05-show]="$bg_mint" [06-settings]="$bg_purple"
  )
  # fit_size は本物の改行で行を分け、ImageMagick は \n を改行とみなす。両方で同じに見えるよう、先に直す。
  local key
  for key in ${(k)headline}; do
    headline[$key]=${headline[$key]//\\n/$'\n'}
    subhead[$key]=${subhead[$key]//\\n/$'\n'}
  done
}

# 引数があれば、その名前（例: 01-songs）だけ作る。
only=("$@")

for lang in en ja; do
  read_slides "$lang"
  if [[ "$lang" == en ]]; then font_bold="$font_en_bold"; font_reg="$font_en_reg"
  else font_bold="$font_ja_bold"; font_reg="$font_ja_reg"; fi

  for store in ios play; do
    if [[ "$store" == ios ]]; then canvas_w=1320 canvas_h=2868 raw_dir="$raw_dir_ios"
    else canvas_w=1080 canvas_h=1920 raw_dir="$raw_dir_android"; fi
    mkdir -p "$asset_dir/$store/$lang"

    # 見出し・補足の大きさは、全スライドで同じにする（一番長い文言が収まる大きさに合わせる。
    # `only` で一部だけ作るときも、同じ大きさになるよう、全スライドで測る）。
    max_text_w=$(( canvas_w - 2 * (90 * canvas_w / base_w) ))
    h_size=$(( 92 * canvas_w / base_w )) s_size=$(( 46 * canvas_w / base_w ))
    for name in "${(@ko)headline}"; do
      h_size=$(fit_size "$font_bold" "$h_size" "$max_text_w" "${headline[$name]}")
      s_size=$(fit_size "$font_reg" "$s_size" "$max_text_w" "${subhead[$name]}")
    done

    for name in "${(@ko)headline}"; do
      [[ ${#only} -gt 0 && ! " ${only[*]} " == *" $name "* ]] && continue
      input="$raw_dir/$lang/$name.png"
      [[ -f "$input" ]] || { print -u2 "skip (no raw): $input"; continue; }
      sub_color="$subhead_color"
      [[ "${background[$name]}" == "$bg_purple" ]] && sub_color="$subhead_on_purple"
      make_slide "$input" "$asset_dir/$store/$lang/$name.png" "$canvas_w" "$canvas_h" \
        "${headline[$name]}" "${subhead[$name]}" "${background[$name]}" "$font_bold" "$font_reg" "$sub_color" "$store" "$h_size" "$s_size"
      print "$store/$lang/$name.png"
    done
  done
done
