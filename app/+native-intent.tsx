import { parseReturnUrl } from '../src/repositories/appleWebSignInRepository';

// アプリに渡されたURLを、expo-router に渡す前に直す。
// AndroidのAppleログイン（Web経由）は、Custom Tab のあと、`singfolio://auth/apple?code=…&state=…` でアプリへ戻る。
// このURLは、サインインの処理（`appleWebSignInRepository`。Linking を直接受け取る）が使うもので、画面ではない。
// 渡すと、expo-router が「画面が見つかりません」へ遷移するので、遷移させない（`null` は、今の画面のまま。起動時の
// URLなら、先頭の画面から始まる）。ほかのURLは、そのまま渡す。判定は、サインインの処理と同じ `parseReturnUrl`。
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  return parseReturnUrl(path) === null ? path : null;
}
