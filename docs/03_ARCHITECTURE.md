# Architecture

## 構成
- `src/`
  - `core/` : DOM抽出・設定解釈などの純粋ロジック
  - `lib/webext.ts` : `chrome`/`browser` 互換ラッパー
  - `content.ts` : UI注入・DOM監視・チャット操作
  - `background.ts` : CDPクリック/Chat API呼び出し
- `extension/`
  - `manifest.json` : Chrome向け
  - `manifest.safari.json` : Safari向け（`debugger`権限なし）
  - `content.js` : `src/content.ts` ビルド成果物
  - `background.js` : `src/background.ts` ビルド成果物
  - `content.css` : 注入UIスタイル
  - `icons/` : 拡張アイコン

## データフロー
1. content script起動 → 設定読み込み → UI生成
2. MutationObserver + URL監視で問題情報を更新
3. `core/qbDom.ts` が問題情報/本文を抽出
4. チャット送信時に問題スナップショットを生成
5. backgroundへ `QB_CHAT_REQUEST` を送信 → OpenAI API → 応答

## フレーム間通信
- top → iframe: `QB_ACTION` / `QB_QUESTION_REQUEST`
- iframe → top: `QB_QUESTION_SNAPSHOT`

## Safari差分
- `chrome.debugger` は使用不可。CDPクリックは自動でフォールバック。
- ストレージは `storage.sync` がなければ `storage.local` を利用。
