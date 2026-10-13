#!/usr/bin/env python3
"""撮影用の架空のアーティスト名が、実在していないことを、Apple の検索 API で確かめる。

使い方: python3 check_names.py [en|ja]   （省略すると両方）

`seed.py` の曲のアーティストと、`ADD_SONG` のアーティストを、`entity=musicArtist` で検索する
（English は米国ストア、日本語は日本ストア）。名前が同じ（空白・大文字小文字・全角半角を除いて）
アーティストが見つかったら、その名前を出して、終了コード 1 で終わる。部分一致（名前を含む・名前に
含まれる）は、参考として出す（実在の別のアーティストの名前の一部のことがある）。

検索 API は、続けて呼ぶと 429 を返すので、5秒あけ、429 のときは待って、やり直す。
外へ送るのは、この名前だけ。
"""
import json
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

from seed import ADD_SONG, SONGS

COUNTRY = {'en': 'US', 'ja': 'JP'}


def norm(text: str) -> str:
    return unicodedata.normalize('NFKC', text).lower().replace(' ', '').replace('　', '')


def search(term: str, country: str) -> list[dict]:
    query = urllib.parse.urlencode({'term': term, 'country': country, 'entity': 'musicArtist', 'limit': 10})
    for attempt in range(4):
        try:
            with urllib.request.urlopen('https://itunes.apple.com/search?' + query, timeout=20) as response:
                return json.load(response)['results']
        except urllib.error.HTTPError as error:
            if error.code != 429:
                raise
            time.sleep(20 * (attempt + 1))
    raise RuntimeError('rate limited')


def main() -> int:
    languages = sys.argv[1:] or ['en', 'ja']
    found = False
    for language in languages:
        artists = sorted({song[1] for song in SONGS[language]} | {ADD_SONG[language]['artist']})
        for name in artists:
            results = search(name, COUNTRY[language])
            exact = [r['artistName'] for r in results if norm(r['artistName']) == norm(name)]
            near = [r['artistName'] for r in results if norm(r['artistName']) != norm(name)
                    and (norm(name) in norm(r['artistName']) or norm(r['artistName']) in norm(name))]
            status = 'EXISTS' if exact else 'ok'
            found = found or bool(exact)
            print(f'{language} {status:6} {name}' + (f'  exact={exact[:2]}' if exact else '') + (f'  near={near[:2]}' if near else ''), flush=True)
            time.sleep(5)
    return 1 if found else 0


if __name__ == '__main__':
    sys.exit(main())
