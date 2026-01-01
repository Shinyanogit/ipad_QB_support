# Architecture

## 構成
- `src/`
  - `core/` : DOM抽出・設定解釈などの純粋ロジック
  - `lib/webext.ts` : `chrome`/`browser` 互換ラッパー
  - `content.ts` : UI注入・DOM監視・チャット/認証/設定同期
  - `background.ts` : CDPクリック/Chat API呼び出し/Google OAuthトークン取得
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
4. チャット送信時に問題スナップショット（画像含む）を生成
5. backgroundへ `QB_CHAT_STREAM_REQUEST` を送信 → OpenAI Responses API（SSE）/backend proxy → ストリーミング応答
6. ログインは backend `/auth/start` → Google OAuth → `/auth/callback` → `/auth/session` でセッション取得
7. 認証済みユーザーは backend `/settings` 経由で Firestore に同期
8. チャット表示はドックのみ（オーバーレイは使用しない）

## Backend（Cloud Run）
- エンドポイント: `/health`, `/auth/start`, `/auth/session`, `/auth/callback`, `/auth/me`, `/settings`, `/chat`, `/chat/stream`
- `/chat` は `chat/completions`、`/chat/stream` は `responses` を使用
- APIキー未設定ユーザーは backend の OpenAI APIキーで代理実行（モデルは `gpt-5-mini` / `gpt-4.1` のみ）

## フレーム間通信
- top → iframe: `QB_ACTION` / `QB_QUESTION_REQUEST`
- iframe → top: `QB_QUESTION_SNAPSHOT`
## ランタイムメッセージ
- content → background: `QB_CHAT_REQUEST` / `QB_CHAT_STREAM_REQUEST`
- background → content (port): `QB_CHAT_STREAM_DELTA` / `QB_CHAT_STREAM_DONE` / `QB_CHAT_STREAM_ERROR`
- content → background: `QB_AUTH_GET_TOKEN` / `QB_AUTH_REMOVE_TOKEN`

## Safari差分
- `chrome.debugger` は使用不可。CDPクリックは自動でフォールバック。
- ストレージは `storage.sync` がなければ `storage.local` を利用。
- Google認証は backend OAuth を利用（`chrome.identity` に依存しない）。
