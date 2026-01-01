# Safari (iPad) Setup

## 前提
- macOS + Xcode が必要（Safari Web Extension はiOSアプリとしてビルド）
- iPadはiOS/iPadOS 17 以降を推奨
- 実機に入れる場合はiPad側で「開発者モード」を有効化

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

## 4) Xcodeで実機インストール
1. 生成された `safari/SafariWebExtension/*.xcodeproj` を開く
2. Signing & Capabilities でTeamを設定
3. iPadを接続し、iOSアプリターゲットをビルド/実行

## 5) iPad側で拡張を有効化
- 設定 > Safari > 拡張機能 > 生成したアプリ をON
- 「すべてのWebサイトで許可」をON
- `https://qb.medilink-study.com/` を開いて動作確認

## 更新時
- 変更後は `npm run build:ext` → `./scripts/prepare-safari-extension.sh`
- 生成済みのXcodeプロジェクトにファイルを上書きするか、再変換してください
