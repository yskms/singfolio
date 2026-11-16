import { redirectSystemPath as redirect } from '../src/repositories/appleWebSignInRepository';

// アプリに渡されたURLを、expo-router に渡す前に直す。
// AndroidのAppleログイン（Web経由）は、Custom Tab のあと、`singfolio://auth/apple?code=…&state=…` でアプリへ戻る。
// このURLは、サインインの処理（Linking を直接受け取る）が使うもので、画面ではないので、expo-router には画面として渡さない。
// 判定と、起動時・起動中の返し方（起動時に `null` を返してはいけない理由）は、`redirectSystemPath`（src）。
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  return redirect(path, initial);
}
