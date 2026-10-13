#!/bin/zsh
set -euo pipefail

# ストア用スクリーンショットに、見出し・補足・背景を合成する。
# 構図は solo-plus-us の store-screenshots/ios/build.sh と同じ（見出し・補足・角丸の撮影画像・影）。
#
# 入力: assets/store-screenshots/raw/{en,ja}/NN-name.png（iOSシミュレータの撮影画像。
#       iPhone 18 Pro の 1206×2622。`seed.py` の仮名のデータで撮る）
# 出力: assets/store-screenshots/ios/{en,ja}/ ... 1320×2868（App Store Connect の
#         「Dynamic Island (large)」。小さい端末の大きさへは自動で縮小される）
#       assets/store-screenshots/play/{en,ja}/ ... 1080×1920（Google Play。長辺が短辺の
#         2倍以内、9:16）。iPhone で撮った画像を、Android にも使う。
# 撮影画像は横幅を保って縮小し、はみ出た下部はキャンバスの外へ切り捨てる。
# 色・書体はブランド（CLAUDE.md「ブランド」「フォント」）。書体は assets/fonts/ の同梱のもの。
# 見出しは、枠に収まらないとき、文字の大きさを自動で下げる。
asset_dir="${0:A:h}/../../assets/store-screenshots"
asset_dir="${asset_dir:A}"
font_dir="${0:A:h}/../../assets/fonts"
font_dir="${font_dir:A}"
raw_dir="$asset_dir/raw"

font_en_bold="$font_dir/Inter-Bold.ttf"
font_en_reg="$font_dir/Inter-Regular.ttf"
font_ja_bold="$font_dir/NotoSansJP-Bold.ttf"
font_ja_reg="$font_dir/NotoSansJP-Regular.ttf"

# colors.ts のブランドの色。紫の面の上の文字は濃い色にする（紫は白の上で約3.4:1）。
bg_mint='#C9FCED'
bg_purple='#9C70FE'
headline_color='#17171A'
subhead_color='#71717A'
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
    font_bold="$8" font_reg="$9" sub_color="${10}" fit="${11}" headline_size="${12}" subhead_size="${13}"
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

  # iOS（fit が 1）は、タブバーが全部見えるよう、下端に少しはみ出す大きさに縮める（アイコンが半端に
  # 切れて見えるのを避ける）。Play（9:16）は縦が足りないので、構図どおり下をはみ出させる。
  if [[ "$fit" == 1 ]]; then
    local fitted=$(( (canvas_h - shot_y + 36 * unit_num / unit_den) * 1206 / 2622 ))
    (( fitted < shot_w )) && shot_w=$fitted
  fi

  local base="$asset_dir/.tmp-base.png" rounded="$asset_dir/.tmp-rounded.png" shadowed="$asset_dir/.tmp-shadowed.png"

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

  rm -f "$base" "$rounded" "$shadowed"
}

# 1行目: 見出し / 2行目: 補足。見出しの改行は \n。
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
    subhead[03-add]='Title, artist, key, tags, and notes.'
    headline[04-practice]='Keep practicing.'
    subhead[04-practice]='Mark a song Ready when you’ve got it.'
    headline[05-show]='Show what you can sing.'
    subhead[05-show]='No keys. No notes. Just your songs.'
    headline[06-profile]='Light or dark.'
    subhead[06-profile]='English or Japanese. Your choice.'
  else
    headline[01-songs]='歌える曲を、ひとつの場所に。'
    subhead[01-songs]='歌える・練習中・歌いたいを、まとめて管理。'
    headline[02-detail]='キーも、メモも、曲ごとに。'
    subhead[02-detail]='自分の歌い方を、そのまま残せます。'
    headline[03-add]='曲の追加は、かんたん。'
    subhead[03-add]='曲名・アーティスト・キー・タグ・メモ。'
    headline[04-practice]='練習中の曲をまとめて。'
    subhead[04-practice]='歌えるようになったら「歌える」へ。'
    headline[05-show]='歌える曲を、人に見せよう。'
    subhead[05-show]='キーも非公開メモも出ません。'
    headline[06-profile]='ライトにも、ダークにも。'
    subhead[06-profile]='日本語でも English でも使えます。'
  fi
  background=(
    [01-songs]="$bg_mint" [02-detail]="$bg_mint" [03-add]="$bg_mint"
    [04-practice]="$bg_mint" [05-show]="$bg_mint" [06-profile]="$bg_purple"
  )
}

# 引数があれば、その名前（例: 01-songs）だけ作る。
only=("$@")

for lang in en ja; do
  read_slides "$lang"
  if [[ "$lang" == en ]]; then font_bold="$font_en_bold"; font_reg="$font_en_reg"
  else font_bold="$font_ja_bold"; font_reg="$font_ja_reg"; fi

  for store in ios play; do
    if [[ "$store" == ios ]]; then canvas_w=1320 canvas_h=2868 fit=1
    else canvas_w=1080 canvas_h=1920 fit=0; fi
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
        "${headline[$name]}" "${subhead[$name]}" "${background[$name]}" "$font_bold" "$font_reg" "$sub_color" "$fit" "$h_size" "$s_size"
      print "$store/$lang/$name.png"
    done
  done
done
