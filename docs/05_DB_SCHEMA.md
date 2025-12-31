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
  - `revealKey`: string
  - `optionKeys`: string[]
  - `position`: "top-left" | "top-right" | "bottom-left" | "bottom-right"
  - `shortcut`: string
  - `chatOpen`: boolean
  - `chatDock`: "left" | "right"
  - `chatApiKey`: string
  - `chatModel`: string
  - `chatTemplates`: { enabled/label/shortcut/prompt }[]
  - `chatTemplateCount`: number
  - `commonPrompt`: string
  - `hintConstraintPrompt`: string
  - `explanationLevel`: "highschool" | "med-junior" | "med-senior"
  - `explanationPrompts`: Record<explanationLevel, string>
  - `themePreference`: "system" | "light" | "dark"
  - `pageAccentEnabled`: boolean
