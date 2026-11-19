// `username`（公開URL `singfolio.app/<username>` の名前）の、入力の確認と表示。Nodeのテストからも実行する純粋な関数。
//
// 規則は Worker（`worker/src/username.ts` の `USERNAME_PATTERN`）と同じ値を**別に持つ**（コードは共有しない。
// `username.test.ts` が一致を確かめる）。予約語・取られている名前は、サーバーだけが知っている（`username-unavailable`）。
// ここで確かめるのは、形だけ（送る前に、明らかに合わないものを止める）。

/** 小文字の英数字と `_` の3〜20字。 */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

/** 公開ページの置き場（ホスト名。スキームは付けない）。 */
export const PUBLIC_HOST = 'singfolio.app';

/**
 * 入力欄の値を、送る形にする（前後の空白を落とし、小文字にする）。サーバーは大文字を断るので、小文字にするのは
 * アプリの役目（`publishService.claimUsername` もこれを通す）。
 */
export function normalizeUsernameInput(input: string): string {
  return input.trim().toLowerCase();
}

/** 形が規則に合うか。`normalizeUsernameInput` を通したあとの値に使う。 */
export function isValidUsername(normalized: string): boolean {
  return USERNAME_PATTERN.test(normalized);
}

/** 公開ページのアドレスの表示（`singfolio.app/karaoke_fan`）。 */
export function publicAddress(username: string): string {
  return `${PUBLIC_HOST}/${username}`;
}
