#!/usr/bin/env python3
"""ストア用スクリーンショットを撮るための、仮名のデータを、シミュレータ・エミュレータのDBへ入れる。

使い方: python3 seed.py <en|ja> <DBのパス> [light|dark] [on|off]

第4引数は候補（Suggestions）の設定。Add Song の撮影では、入力した曲名が Apple へ送られないよう off にする。

- アプリを止めてから実行する（実行のあと、アプリを起動し直す）。
- 曲・タグ・設定を、全部入れ替える（撮影用の端末専用。実際のデータがあるDBに使わない）。
- 曲名・アーティスト名は、すべて架空。審査で第三者の素材（5.2.1）を指摘されないため、実在の
  アーティストを使わない。足すときは、`check_names.py` で、同じ名前のアーティストが居ないことを
  確かめる（架空のつもりの名前が、実在した例が多い）。曲名は、短い一般的な語の組み合わせなので、
  実在の曲と偶然一致してもよい（保護されず、架空のアーティストと組み合わせて出るため）。
- `updated_at` は実行時刻からの経過で決める。Practice の「Last updated」の日付は、撮った日で変わる
  ので、English・日本語の6枚は、同じ日に撮る。
- Add Song の画面は、DBでは作れないので、撮影のとき、`ADD_SONG` の値を、手で入力する（保存はしない）。
"""
import sqlite3
import sys
import time
import uuid

# (曲名, アーティスト, ステータス, キー, 非公開メモ, タグ, 更新から経過した時間)
SONGS = {
    'en': [
        ('Glass Afternoon', 'North of Elm', 'ready', -2, 'Keep the second verse soft. Breathe before the bridge.', ['Acoustic', 'Ballad'], 2),
        ('Paper Summer', 'Wren Aldous', 'ready', 2, '', ['Up-tempo'], 5),
        ('Slow Harbor', 'Wren Aldous', 'ready', 0, '', ['Ballad'], 9),
        ('Golden Hour Radio', 'Sable and Sparrow', 'ready', 3, '', ['Duet', 'Up-tempo'], 20),
        ('Lighthouse Waltz', 'Kit Ravenne', 'ready', -1, '', ['Acoustic'], 30),
        ('Where the River Bends', 'Odessa Linnet', 'ready', -3, '', ['Ballad'], 44),
        ("Tomorrow's Postcard", 'Odessa Linnet', 'ready', 0, '', [], 52),
        ('Salt and Honey', 'Maribel Tarn', 'ready', 1, '', ['Acoustic'], 70),
        ('Tell the Morning', 'The Quiet Almanac', 'ready', 0, '', ['Ballad'], 90),
        ('Brave Little Engine', 'Fenna Calloway', 'ready', 2, '', ['Up-tempo'], 110),
        ('Winter Window', 'Ansel Brightwater', 'ready', -2, '', ['Ballad', 'Duet'], 130),
        ('Come Back Slowly', 'North of Elm', 'ready', 0, '', ['Duet'], 150),
        ('Neon Lullaby', 'Thistle and Rook', 'practice', 2, 'The chorus sits high. Warm up first.', ['High notes'], 3),
        ('Feather Weight', 'Corin Ashdale', 'practice', -1, '', ['High notes'], 26),
        ('Long Way to Lisbon', 'Mara Quellin', 'practice', 0, '', ['Up-tempo'], 75),
        ('Hold the Light', 'Lowtide Parade', 'practice', 1, '', ['Duet'], 140),
        ('Midnight Carousel', 'Dorian Pell', 'want', 0, '', [], 60),
        ('Sunday Orchard', 'Fenna Calloway', 'want', 0, '', [], 100),
        ('Little Paper Boats', 'Wren Aldous', 'want', 0, '', [], 160),
    ],
    'ja': [
        ('窓辺のコーヒー', '月ノ原ミオ', 'ready', -2, '2番はやさしく。ブリッジの前で息を吸う。', ['弾き語り', 'バラード'], 2),
        ('春のたより', 'ひなた通り', 'ready', 2, '', ['アップテンポ'], 5),
        ('ひとつ分の距離', '凪野ソラ', 'ready', 0, '', ['バラード'], 9),
        ('ブルーモーメント', '藍色サーカス', 'ready', 3, '', ['デュエット', 'アップテンポ'], 20),
        ('帰り道のうた', 'シロツメ', 'ready', -1, '', ['弾き語り'], 30),
        ('海へ続く坂道', '凪野ソラ', 'ready', -3, '', ['バラード'], 44),
        ('夜更けのプレイリスト', '朝凪ラジオ', 'ready', 0, '', [], 52),
        ('灯りの向こうへ', '灯火の庭', 'ready', 1, '', ['弾き語り'], 70),
        ('風が教えてくれた', 'ひなた通り', 'ready', 0, '', ['バラード'], 90),
        ('ロータリー・ソング', '夜明けのロータリー', 'ready', 2, '', ['アップテンポ'], 110),
        ('小さな約束', '雨宿りレコード', 'ready', -2, '', ['バラード', 'デュエット'], 130),
        ('朝焼けのバスターミナル', '三日月ホテル', 'ready', 0, '', ['デュエット'], 150),
        ('ネオン・ララバイ', 'コハクの森', 'practice', 2, 'サビが高い。先に声を温める。', ['高音'], 3),
        ('羽根のように', '夕凪トランジスタ', 'practice', -1, '', ['高音'], 26),
        ('リスボンまで', '白い栞', 'practice', 0, '', ['アップテンポ'], 75),
        ('光をつかまえて', '小春日和ミュージアム', 'practice', 1, '', ['デュエット'], 140),
        ('真夜中のメリーゴーランド', '月ノ原ミオ', 'want', 0, '', [], 60),
        ('日曜日の果樹園', '朝凪ラジオ', 'want', 0, '', [], 100),
        ('紙の小舟', '灯火の庭', 'want', 0, '', [], 160),
    ],
}


# Add Song の撮影で、入力する値（保存しない）。キーは「半音を上げる」の回数、タグは既存のタグから選ぶ。
# check_names.py の対象。日本語のアーティストは、iOS では「ともしびの庭」を入力し、Android では、変換の先頭の候補
# 「灯火の庭」を選んだ（読みは同じ。「灯火の庭」は、上の SONGS にもあり、確認済み）。
ADD_SONG = {
    'en': {
        'title': 'Moonlit Ferry',
        'artist': 'Kit Ravenne',
        'key': 2,
        'tags': ['Acoustic', 'Ballad'],
        'note': 'Slow down at the bridge.',
    },
    'ja': {
        'title': '月明かりの渡し船',
        'artist': 'ともしびの庭',
        'key': 2,
        'tags': ['弾き語り', 'バラード'],
        'note': 'ゆっくりやさしく',
    },
}


def main() -> None:
    language, db_path = sys.argv[1], sys.argv[2]
    appearance = sys.argv[3] if len(sys.argv) > 3 else 'light'
    suggestions = sys.argv[4] if len(sys.argv) > 4 else 'on'
    assert language in SONGS and appearance in ('light', 'dark') and suggestions in ('on', 'off')

    now_ms = int(time.time() * 1000)
    db = sqlite3.connect(db_path)
    db.execute('PRAGMA foreign_keys = ON')
    with db:
        db.execute('DELETE FROM song_tags')
        db.execute('DELETE FROM songs')
        db.execute('DELETE FROM tags')
        db.execute('DELETE FROM settings')
        db.execute("INSERT INTO settings (key, value) VALUES ('language', ?)", (language,))
        db.execute("INSERT INTO settings (key, value) VALUES ('appearance', ?)", (appearance,))
        # 未保存は on（アプリの既定）。
        if suggestions == 'off':
            db.execute("INSERT INTO settings (key, value) VALUES ('suggestions', 'off')")

        tag_ids: dict[str, str] = {}
        for title, artist, status, key, note, tags, hours_ago in SONGS[language]:
            updated = now_ms - hours_ago * 3600 * 1000
            song_id = str(uuid.uuid4())
            db.execute(
                'INSERT INTO songs (id, title, artist, status, key_offset, private_note, created_at, updated_at)'
                ' VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                (song_id, title, artist, status, key, note, updated, updated),
            )
            for name in tags:
                if name not in tag_ids:
                    tag_ids[name] = str(uuid.uuid4())
                    db.execute('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)', (tag_ids[name], name, now_ms))
                db.execute('INSERT INTO song_tags (song_id, tag_id) VALUES (?, ?)', (song_id, tag_ids[name]))
    db.close()
    print(f'seeded {len(SONGS[language])} songs ({language}, {appearance}, suggestions {suggestions})')


if __name__ == '__main__':
    main()
