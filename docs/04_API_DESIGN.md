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
  - `revealKey`: string（既定値 `S`、旧既定値 `Ctrl+S` は自動移行）
  - `optionKeys`: string[]（既定値 `A`〜`G`、旧既定値 `A`〜`E` は自動拡張）
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

- `QBReflectionRecord`
  - `questionId`: string（URLの `question_id` を優先）
  - `questionCode`: string | null
  - `questionUrl`: string
  - `questionText`: string | null
  - `optionTexts`: string[]
  - `pageRef`: string | null
  - `tags`: string[]
  - `reflection`: string
  - `pdfId`: `"Vital_Step2CK"`
  - `pdfRefs`: string[]
  - `createdAt` / `updatedAt`: ISO 8601 string

- `QBReflectionImageRecord`
  - `questionId`: string
  - `questionCode`: string | null
  - `imageName`: string（`QB_[問題コード]_reflection_N.png`）
  - `mimeType`: `"image/png"`
  - `imageDataUrl`: string
  - `byteLength`: number
  - `sha256`: string
  - `createdAt`: ISO 8601 string

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
- `isQuestionDocument(doc: Document, url: string): boolean`
  - 旧 `.question-container` または新 `/quiz?question_id=...` の問題ページを判定
- `normalizeSettings(input?: Partial<Settings>): Settings`
  - 設定のデフォルト補完
- `normalizeShortcut(input?: string): string`
  - ショートカット文字列を正規化
- `shortcutFromEvent(event: KeyboardEvent): string`
  - キー入力からショートカット文字列を生成
- `isShortcutMatch(event: KeyboardEvent, shortcut: string): boolean`
  - 入力と設定ショートカットの一致判定
- `getReflectionQuestionId(url: string, fallbackId?: string | null): string`
  - URLの安定UUIDを振り返り保存キーとして抽出
- `buildReflectionRecord(input): QBReflectionRecord`
  - 問題スナップショットと振り返り本文から保存レコードを構築
- `pruneReflectionStore(store, maxEntries?): QBReflectionStore`
  - 更新日時の新しいレコードを優先して保存上限へ整理
- `getReflectionImageStorageKey(questionId): string`
  - 問題単位の画像ストアキー `qb_support_reflection_images_v1:<questionId>` を生成
- `extractMoshiReflectionData(doc, url): MoshiReflectionData | null`
  - MM模試の回・表示問題番号・旧URL問題ID・進捗・問題文・選択肢を共通振り返り形式で抽出
- `buildMoshiReflectionIdentity(examNumber, rawQuestionId, questionNumber)`
  - `A-46`等の表示番号を正規化して現行保存IDを作り、v0.1.14互換のURLベース旧IDも返す
- `getMoshiReflectionPlacement(doc)`
  - MM模試の問題ナビゲーション直前を振り返り欄挿入位置として返す

## MM模試 content script処理
- `initMoshi()`
  - `data-qb-site="moshi"` を設定し、保存設定・テーマ・DOM監視・振り返り欄・模試専用ショートカットを初期化する
- `attachMoshiShortcutHandlers()`
  - 設定済みの選択肢キー、解答キー、前後キーを模試DOMへ接続する。入力欄またはcontenteditableにフォーカス中は処理しない
- `getMoshiOptionTargets()` / `getMoshiControl(action)`
  - 表示中かつ有効な `.choice-cell`、前後ナビ、「解答を確認する」／「リトライ」を返す

## 振り返り書式操作
- `applyReflectionFormattingCommand(editor, command)`
  - contenteditableの現在選択へ太字・斜体・下線・取り消し線・箇条書き・番号付きリストを切り替え、inputイベント経由で自動保存へ接続する
- 書式バーはmousedown時の選択範囲を保持してからコマンドを適用し、`aria-pressed`で現在書式を示す
- キーボードは`Cmd/Ctrl+B/I/U`と`Cmd/Ctrl+Shift+S`を処理し、QB/MM模試側の単独キー操作へ伝播させない
- `handleReflectionListKeyDown(editor, event)`
  - 行頭Markdown記号のリスト化と、リスト項目内Tab／Shift+Tabの階層移動を処理する
- `setReflectionEditorMarkdown`／`getReflectionEditorText`
  - `ul`／`ol`／`li`と2スペース単位のネストMarkdownを双方向変換し、項目内のインライン書式・画像マーカーも維持する

## ダークテーマ画像保護
- `isProtectedContentImageSurface(element)`
  - `/exam_images_kokushi/`画像、その所属`figure`、および直上の`p`を検出し、汎用の明色surface暗色化から除外する

## Message Types
- `QB_ACTION`
  - top → 明示的な問題iframe: ナビ/選択肢/解答操作（トップ文書内に対象がない場合）
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
