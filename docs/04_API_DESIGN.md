# API Design

## Core Types
- `QuestionInfo`
  - `id`: string | null
  - `progressText`: string | null
  - `pageRef`: string | null
  - `optionCount`: number | null
  - `tags`: string[]
  - `updatedAt`: number (epoch ms)

- `QuestionSnapshot`
  - `id`: string | null
  - `url`: string
  - `questionText`: string | null
  - `imageUrls`: string[]
  - `optionTexts`: string[]
  - `progressText`: string | null
  - `pageRef`: string | null
  - `tags`: string[]
  - `updatedAt`: number

- `Settings`
  - `enabled`: boolean
  - `shortcutsEnabled`: boolean
  - `debugEnabled`: boolean
  - `searchVisible`: boolean
  - `noteVisible`: boolean
  - `navPrevKey`: string
  - `navNextKey`: string
  - `revealKey`: string
  - `optionKeys`: string[]
  - `position`: "top-left" | "top-right" | "bottom-left" | "bottom-right"
  - `shortcut`: string (例: `Alt+Q`)
  - `chatOpen`: boolean
  - `chatDock`: "left" | "right"
  - `chatApiKey`: string
  - `chatApiKeyEnabled`: boolean
  - `chatModel`: string
  - `chatTemplates`: { enabled/label/shortcut/prompt }[]
  - `chatTemplateCount`: number
  - `commonPrompt`: string
  - `hintConstraintPrompt`: string
  - `explanationLevel`: "highschool" | "med-junior" | "med-senior"
  - `explanationPrompts`: Record<explanationLevel, string>
  - `themePreference`: "system" | "light" | "dark"
  - `pageAccentEnabled`: boolean

## Backend Endpoints
- `GET /health`
  - 常に `200 { ok: true }`
- `GET /auth/start`
  - Google OAuth URL と state を返却
- `GET /auth/session?state=...`
  - OAuth完了後のセッション情報を取得
- `GET /auth/callback`
  - Google OAuth リダイレクト先
- `GET /auth/me`
  - セッション検証（`Authorization: Bearer <token>`）
- `GET /me/entitlement`
  - 課金状態（free/plus）と残回数（hour/day）を取得
- `GET /settings`
  - リモート設定取得（要認証）
- `POST /settings`
  - リモート設定保存（要認証）
- `POST /iap/apple/transaction`
  - StoreKit 2 の `signedTransactionInfo` を送信して検証（要認証）
- `POST /chat`
  - OpenAI `chat/completions` へのプロキシ（要認証）
  - backend利用時は 100 req/hour & 日次制限（free 50 / plus 500）
- `POST /chat/stream`
  - OpenAI `responses` のストリーミング（要認証）
  - backend利用時は 100 req/hour & 日次制限（free 50 / plus 500）

## Core Functions
- `extractQuestionInfo(doc: Document, url: string): QuestionInfo | null`
  - DOMから問題情報を抽出
- `extractQuestionSnapshot(doc: Document, url: string): QuestionSnapshot | null`
  - 問題文/選択肢のスナップショットを生成
- `normalizeSettings(input?: Partial<Settings>): Settings`
  - 設定のデフォルト補完
- `normalizeShortcut(input?: string): string`
  - ショートカット文字列を正規化
- `shortcutFromEvent(event: KeyboardEvent): string`
  - キー入力からショートカット文字列を生成
- `isShortcutMatch(event: KeyboardEvent, shortcut: string): boolean`
  - 入力と設定ショートカットの一致判定

## Message Types
- `QB_ACTION`
  - top → iframe: ナビ/選択肢/解答操作
- `QB_QUESTION_REQUEST`
  - top → iframe: 問題スナップショット要求
- `QB_QUESTION_SNAPSHOT`
  - iframe → top: 問題スナップショット返却
- `QB_CHAT_REQUEST`
  - content → background: OpenAI API呼び出し
- `QB_CHAT_STREAM_REQUEST`
  - content → background: OpenAI Responses API (SSE) 呼び出し
- `QB_CHAT_STREAM_DELTA`
  - background → content: ストリーミング差分
- `QB_CHAT_STREAM_DONE`
  - background → content: 完了通知（usage/response_id含む）
- `QB_CHAT_STREAM_ERROR`
  - background → content: ストリーミング失敗
