# Overview

MedicMedia QBの問題演習ページに学習支援UIを注入する拡張。ChromeとSafari Web Extension（iOS/iPadOS）で共通コードベースを維持し、iPad上でも動作することを前提に設計する。

## 主な機能
- 設定パネル（ショートカット/表示/テーマ/プロンプト/テンプレート）
- 問題情報の抽出と表示（ID/進捗/選択肢数/タグ/掲載頁/画像）
- 右ドック型チャット（ストリーミング/Markdown表示/コピー/履歴）
- テンプレート送信（0-5件/ショートカット対応）
- Backend OAuth（Googleログイン）とFirestore設定同期
- バックエンド経由のOpenAI呼び出し（APIキー未設定でも利用可）
- SPA/iframe/動的DOMに耐える再注入と更新

## 対象サイト
- `https://qb.medilink-study.com/*` (トップ)
- `https://input.medilink-study.com/*` (iframe)

## 現在のマイルストーン
- QBページでコンテンツスクリプトが確実に注入される
- 右側ドックのチャットバーが開閉・リサイズできる（本文は押し出し）
- 問題文＋選択肢＋添付画像を自動で取り込んで質問応答できる
- モデル切替/説明レベル/共通プロンプトを設定から調整できる
- APIキー未設定でもバックエンド経由で `gpt-5-mini` / `gpt-4.1` が使える
