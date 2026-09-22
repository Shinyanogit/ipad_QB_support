# DB Schema (storage)

## `qb_support_settings_v1`
- 保存先: `storage.sync`（未対応環境は `storage.local`）
- 型: `Settings`
  - `enabled`: boolean
  - `shortcutsEnabled`: boolean
  - `debugEnabled`: boolean
  - `searchVisible`: boolean
  - `noteVisible`: boolean
  - `navPrevKey`: string
  - `navNextKey`: string
  - `revealKey`: string（既定値 `S`）
  - `optionKeys`: string[]（既定値 `A`〜`G`）
  - `position`: "top-left" | "top-right" | "bottom-left" | "bottom-right"
  - `shortcut`: string
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

## 互換移行
- 保存値が旧既定の `revealKey: "Ctrl+S"` の場合は `S` へ移行する。
- 保存値が旧既定の `optionKeys: ["A", "B", "C", "D", "E"]` の場合は `F` / `G` を追加する。
- 上記以外のカスタム割り当ては維持する。

## `qb_support_reflections_v1`
- 保存先: `storage.local`
- 型: `Record<questionId, QBReflectionRecord>`
- 上限: 1000件（QB+模試400問を保持できるよう拡張。`updatedAt` の新しい記録を優先）
- 各レコード:
  - `schemaVersion`: 1
  - `source`: `"QB_support"`
  - `questionId`: string
  - `questionCode`: string | null
  - `questionUrl`: string
  - `questionText`: string | null
  - `optionTexts`: string[]
  - `pageRef`: string | null
  - `tags`: string[]
  - `reflection`: string
  - `pdfId`: `"Vital_Step2CK"`
  - `pdfRefs`: string[]（将来のPDFページ指定用）
  - `createdAt`: ISO 8601 string
  - `updatedAt`: ISO 8601 string

### MM模試の保存ID
- `questionId`: `moshi:kokushi-mm{examNumber}:{displayNumber}`
- 例: 第1回の表示番号`A-46`は`moshi:kokushi-mm1:A-46`
- `questionCode`: `MM{examNumber}_{displayNumber}`（例: `MM1_A-1`）
- 現行ID・`questionCode`は画面表示番号だけから生成し、URLの`question_id`は旧データ検出以外には使わない
- `tags`: `moshi`, `kokushi-mm{examNumber}`
- v0.1.14の旧ID`moshi:kokushi-mm{examNumber}:{question_id}`は削除しない。ただしURLの`question_id`は問題番号ではないため、数値一致や旧`questionCode`による一般的な自動移行は行わない。ユーザー確認済みの`moshi:kokushi-mm1:A-14`を確定所有先として保持し、それ以外へ既に複製された確認済み本文断片・旧画像マーカー・旧画像ストア名・旧レコード同一本文は非破壊で表示対象から除外する

### 画像マーカー
- `reflection` は v0.1.11 から markdown 記法のサブセットを含みうる:
  `**太字**` `*斜体*` `<u>下線</u>` `~~打消~~`、行頭 `- ` / `1. `（箇条書き）。
  消費側（ノートPDF=pandoc、Obsidian、Ankiの `reflection_html()`）はこれを書式として描画する。
- v0.1.20から、箇条書き・番号付きリストは編集欄内で`ul`／`ol`として描画し、Tab階層は2スペースずつインデントしたMarkdown（例: `  - 子項目`）で保存する。既存の`- `／`1. `本文も読込時に自動でリスト表示される。
- 画像添付済みの `reflection` は、プレーンテキストに加えて
  `![[QB_[問題コード]_reflection_N.png]]` を含む。
- 既存の画像なしschema v1レコードはそのまま有効で、移行処理は不要。

## `qb_support_reflection_images_v1:<questionId>`
- 保存先: `storage.local`
- 型: `Record<imageName, QBReflectionImageRecord>`
- 本文レコードとは別キーで、問題UUIDごとに分割する。
- 各画像:
  - `schemaVersion`: 1
  - `source`: `"QB_support"`
  - `questionId`: string
  - `questionCode`: string | null
  - `imageName`: `QB_[問題コード]_reflection_N.png`（コード不明時はquestionId）
  - `mimeType`: `"image/png"`
  - `imageDataUrl`: `data:image/png;base64,...`
  - `byteLength`: number
  - `sha256`: PNGバイトのSHA-256（問題内の重複排除用）
  - `createdAt`: ISO 8601 string

## 容量・Anki解決
- Chrome manifestは `unlimitedStorage` を要求する。Safariは利用可能な`storage.local`容量内で保存し、quota超過時はUIへ失敗を表示する。
- Anki生成側は `reflection` のwiki-linkを列挙し、同じquestionIdの画像ストアから `imageName` を引いてdata URLをbase64復号する。
- 本文の1000件pruneは画像ストアと独立しており、画像データ量によって本文レコードが押し出されることはない。
