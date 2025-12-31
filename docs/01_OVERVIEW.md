# Overview

MedicMedia QBの問題演習ページに学習支援UIを注入する拡張。ChromeとSafari Web Extension（iOS/iPadOS）で共通コードベースを維持し、iPad上でも動作することを前提に設計する。

## 主な機能
- 設定パネル（表示/ショートカット/サイドバー表示）
- 問題情報の抽出と表示（ID/進捗/選択肢数/タグ/掲載頁）
- ChatGPTバーの挿入（APIキーはユーザーが設定）
- SPA/iframe/動的DOMに耐える再注入と更新

## 対象サイト
- `https://qb.medilink-study.com/*` (トップ)
- `https://input.medilink-study.com/*` (iframe)

## 現在のマイルストーン
- QBページでコンテンツスクリプトが確実に注入される
- 右側トグルのチャットバーが開閉できる
- 問題文＋選択肢を自動で取り込んで質問応答できる
