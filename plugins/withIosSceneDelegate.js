const { withInfoPlist, withAppDelegate, withXcodeProject, IOSConfig } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// iOS 27 SDK（Xcode 27）でビルドしたUIKitアプリは、UISceneライフサイクルに対応して
// いないと起動直後にクラッシュする（"UIScene life cycle is required for apps built
// with this SDK"）。
//
// Expo SDK 57 の本体には、シーン対応のネイティブ実装（ExpoAppSceneDelegate、
// ExpoReactNativeFactoryProvider）が入っているが、`expo prebuild` のテンプレートは
// まだ配線していない（SDK 58 のテンプレートで配線される）。このプラグインは、
// SDK 58 のテンプレートと同じ形を、SDK 57 の生成物に当てはめるもの。
//   - Info.plist に UIApplicationSceneManifest を追加する
//   - SceneDelegate.swift（ExpoAppSceneDelegate のサブクラス）を追加する
//   - AppDelegate.swift を、window生成とReact Native起動をSceneDelegateへ任せる形に直す
//     （ExpoReactNativeFactoryProvider に適合させ、didFinishLaunching内のwindow生成と
//     startReactNative を除く。URL・Universal Linksの上書きも、SDK 58 のテンプレートに
//     合わせて除く。シーン採用後はUIKitがAppDelegate側を呼ばなくなり、
//     ExpoAppSceneDelegateがExpoAppDelegateとRCTLinkingManagerへ転送する）
//
// ios/ は `expo prebuild` の自動生成物（gitignore）なので、手で直さずここで注入する。
//
// 【SDK 58 へ上げるとき】テンプレートが同じ配線を持つので、このプラグインと
// app.json の登録を撤去する。AppDelegateは、すでにExpoReactNativeFactoryProvider
// に適合していれば何もしないが、Info.plist と SceneDelegate.swift は上書きする。

const SCENE_DELEGATE_CLASS_NAME = 'SceneDelegate';
const SCENE_DELEGATE_FILENAME = `${SCENE_DELEGATE_CLASS_NAME}.swift`;

// SDK 58 のテンプレート（expo-template-bare-minimum）と同じ内容。
const SCENE_DELEGATE_SOURCE = `// このファイルは plugins/withIosSceneDelegate.js が生成する。
// 手で編集しても \`expo prebuild\` 実行時に上書きされる。
internal import Expo

@objc(${SCENE_DELEGATE_CLASS_NAME})
class ${SCENE_DELEGATE_CLASS_NAME}: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
`;

const PROVIDER_PROTOCOL = 'ExpoReactNativeFactoryProvider';

// SDK 57 のテンプレートが生成するAppDelegate.swiftの、書き換える箇所。
// クラス宣言とwindow生成・startReactNativeの2箇所は、書き換えないとシーン対応が
// 成り立たない。テンプレートが変わって一致しなくなった場合は、黙って壊れた
// AppDelegateを作らず、prebuildの時点で失敗させる。
// URL・Universal Linksの上書きは、撤去できなくても動くため、一致したときだけ撤去する
// （LINKING_OVERRIDES の説明を参照）。
const CLASS_DECLARATION = 'class AppDelegate: ExpoAppDelegate {';
const CLASS_DECLARATION_PATCHED = `class AppDelegate: ExpoAppDelegate, ${PROVIDER_PROTOCOL} {`;

const WINDOW_AND_START_REACT_NATIVE = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
`;
const WINDOW_AND_START_REACT_NATIVE_PATCHED = `    // The window is created and React Native is started by \`SceneDelegate\` under the
    // scene-based life cycle (required by the iOS 27 SDK).
`;

// SDK 57 のテンプレートが持つ、URL・Universal Linksの上書き。シーン採用後は
// UIKitから呼ばれなくなり、代わりに ExpoAppSceneDelegate（SceneEventForwarder）が
// ExpoAppDelegateへ転送する。転送側は、残った上書きが RCTLinkingManager を呼んだことを
// 検知して二重に通知しないため、撤去できなくても動作は変わらない。
const LINKING_OVERRIDES = `

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }`;

function replaceOrThrow(contents, search, replacement, description) {
  if (!contents.includes(search)) {
    throw new Error(
      `withIosSceneDelegate: AppDelegate.swift内に${description}が見つかりませんでした。` +
        'Expoのテンプレートが変わった可能性があるため plugins/withIosSceneDelegate.js を確認してください。'
    );
  }
  return contents.replace(search, replacement);
}

function patchAppDelegate(contents) {
  // すでにシーン対応済み（prebuildの再実行、または公式テンプレートが対応済み）。
  if (contents.includes(PROVIDER_PROTOCOL)) {
    return contents;
  }
  let patched = contents;
  patched = replaceOrThrow(patched, CLASS_DECLARATION, CLASS_DECLARATION_PATCHED, 'AppDelegateのクラス宣言');
  patched = replaceOrThrow(
    patched,
    WINDOW_AND_START_REACT_NATIVE,
    WINDOW_AND_START_REACT_NATIVE_PATCHED,
    'window生成とstartReactNativeの呼び出し'
  );
  return patched.replace(LINKING_OVERRIDES, '');
}

function withIosSceneManifest(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: `$(PRODUCT_MODULE_NAME).${SCENE_DELEGATE_CLASS_NAME}`,
          },
        ],
      },
    };
    return config;
  });
}

function withIosSceneAppDelegate(config) {
  return withAppDelegate(config, (config) => {
    config.modResults.contents = patchAppDelegate(config.modResults.contents);
    return config;
  });
}

function withIosSceneDelegateFile(config) {
  return withXcodeProject(config, (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
    const sourceRoot = IOSConfig.Paths.getSourceRoot(projectRoot);

    fs.writeFileSync(path.join(sourceRoot, SCENE_DELEGATE_FILENAME), SCENE_DELEGATE_SOURCE);

    const filePath = `${projectName}/${SCENE_DELEGATE_FILENAME}`;
    if (!config.modResults.hasFile(filePath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: filePath,
        groupName: projectName,
        project: config.modResults,
      });
    }

    return config;
  });
}

module.exports = function withIosSceneDelegate(config) {
  config = withIosSceneManifest(config);
  config = withIosSceneAppDelegate(config);
  config = withIosSceneDelegateFile(config);
  return config;
};
