# Safari (iPad) Setup

## 前提
- macOS + Xcode が必要（Safari Web Extension はiOSアプリとしてビルド）
- iPadはiOS/iPadOS 17 以降を推奨
- 実機に入れる場合はiPad側で「開発者モード」を有効化
- Xcode > Settings > Accounts でApple IDにサインインしておく

## 1) 拡張のビルド
```
npm run build:ext
```

## 2) Safari用の拡張ディレクトリを準備
```
./scripts/prepare-safari-extension.sh
```
`/safari/extension` にSafari用の `manifest.json` を用意します。

## 3) Safari Web Extension に変換
```
xcrun safari-web-extension-converter safari/extension
```
変換ウィザードで以下を選択/入力してください。
- 出力先: `safari/SafariWebExtension`（任意）
- Bundle ID: 任意（例: `com.example.qb-support`）
- プラットフォーム: iOS を有効化

※ 変換コマンドは処理が終わるとそのまま終了します。Xcodeが自動で開かない場合は、生成された `.xcodeproj` を手動で開いてください。

## 4) Xcodeで実機インストール
1. 生成された `safari/SafariWebExtension/*.xcodeproj` を開く
2. Signing & Capabilities でTeamを設定
3. **iOS App** ターゲットと **iOS Extension** ターゲットの Bundle Identifier を確認
   - App: `com.example.qb-support`
   - Extension: `com.example.qb-support.extension` のように **AppのIDで始まる値**にする
4. iPadを接続し、iOSアプリターゲットをビルド/実行

## 5) iPad側で拡張を有効化
- 設定 > Safari > 拡張機能 > 生成したアプリ をON
- 「すべてのWebサイトで許可」をON
- `https://qb.medilink-study.com/` を開いて動作確認

## トラブルシュート
- `Embedded binary's bundle identifier is not prefixed...`
  - ExtensionのBundle IDがAppのIDで始まっていません。AppとExtension両方を修正してください。
- XcodeにiPadが表示されない
  - ケーブル接続（データ通信対応）/ 端末のロック解除 / 「このコンピュータを信頼」を確認
  - Xcode > Window > Devices and Simulators で認識されるか確認
  - 無線接続は、ケーブル接続でペアリング後に「Connect via network」を有効化（同一Wi‑Fi必須）
- iPadで「信頼されていないデベロッパ」と表示される
  - 設定 > 一般 > VPNとデバイス管理 から開発者を信頼
- ログイン時にポップアップがブロックされる
  - Safariの制限でブロックされる場合があります。ログインURLを新規タブで開くか、対象サイトのポップアップ許可を検討してください。

## Safari用ビルドの扱い
- `safari/extension` は `./scripts/prepare-safari-extension.sh` で毎回上書きされる生成物
- Safari専用の修正を入れる場合は、`extension/` に反映してから生成するか、生成後に `safari/extension` を編集してください
- デバッグログは設定の `debugEnabled` がONのときのみ出力されます

## 更新時
- 変更後は `npm run build:ext` → `./scripts/prepare-safari-extension.sh`
- 生成済みのXcodeプロジェクトにファイルを上書きするか、再変換してください
