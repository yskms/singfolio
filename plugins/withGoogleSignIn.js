const { withInfoPlist, withPodfile, withStringsXml, AndroidConfig } = require('expo/config-plugins');

// modules/singfolio-google-signin が使う、Google のクライアント ID の設定。
// ios/ と android/ は `expo prebuild` の生成物なので、手で直さずここで注入する。
//   - iOS: Info.plist に GIDClientID（iOS クライアント）・GIDServerClientID（Web クライアント。
//     ID トークンの aud になる）と、反転したクライアント ID の URL scheme を足す。
//     Podfile には、GoogleUtilities・RecaptchaInterop の modular headers を足す（下の説明）。
//   - Android: 文字列リソース singfolio_google_web_client_id（Web クライアント。ID トークンの aud）
//     を足す。Android クライアントはコードに現れない（パッケージ名と署名の SHA-1 で、Google 側が照合する）。
// クライアント ID は秘密情報ではない（アプリに埋め込まれる）。Web クライアントの client_secret は使わない。

const CLIENT_ID_PATTERN = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

function checkClientId(name, value) {
  if (typeof value !== 'string' || !CLIENT_ID_PATTERN.test(value)) {
    throw new Error(
      `withGoogleSignIn: ${name} が「<数字>-<英数字>.apps.googleusercontent.com」の形ではありません: ${JSON.stringify(value)}`
    );
  }
}

module.exports = function withGoogleSignIn(config, { iosClientId, webClientId } = {}) {
  checkClientId('iosClientId', iosClientId);
  checkClientId('webClientId', webClientId);

  // com.googleusercontent.apps.<数字>-<英数字>
  const reversedIosClientId = iosClientId.split('.').reverse().join('.');

  config = withInfoPlist(config, (config) => {
    const plist = config.modResults;
    plist.GIDClientID = iosClientId;
    plist.GIDServerClientID = webClientId;
    const urlTypes = plist.CFBundleURLTypes ?? [];
    const exists = urlTypes.some((type) => (type.CFBundleURLSchemes ?? []).includes(reversedIosClientId));
    if (!exists) {
      urlTypes.push({ CFBundleURLSchemes: [reversedIosClientId] });
    }
    plist.CFBundleURLTypes = urlTypes;
    return config;
  });

  // GoogleSignIn（9.2.0・10.1.0 とも）は Swift の Pod（AppCheckCore）に依存し、AppCheckCore が GoogleUtilities と
  // RecaptchaInterop を Swift から import する。この2つは module map を持たないので、modular headers を
  // 指定しないと `pod install` が失敗する（10.1.0 でも、外して失敗することを確認済み）。
  // `use_modular_headers!` の全体指定は、他の Pod に波及するので使わない。
  config = withPodfile(config, (config) => {
    const marker = '# withGoogleSignIn: modular headers';
    if (!config.modResults.contents.includes(marker)) {
      const anchor = '  use_expo_modules!\n';
      if (!config.modResults.contents.includes(anchor)) {
        throw new Error(
          'withGoogleSignIn: Podfile に `use_expo_modules!` が見つかりません。Expoのテンプレートが変わった可能性があるため、plugins/withGoogleSignIn.js を確認してください。'
        );
      }
      config.modResults.contents = config.modResults.contents.replace(
        anchor,
        `${anchor}  ${marker}\n  pod 'GoogleUtilities', :modular_headers => true\n  pod 'RecaptchaInterop', :modular_headers => true\n`
      );
    }
    return config;
  });

  config = withStringsXml(config, (config) => {
    config.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: 'singfolio_google_web_client_id', translatable: 'false' }, _: webClientId }],
      config.modResults
    );
    return config;
  });

  return config;
};
