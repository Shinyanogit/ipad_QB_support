# Architecture

## 構成
- `src/`
  - `core/` : DOM抽出・設定解釈などの純粋ロジック
    - `moshiDom.ts` : MM模試の問題情報抽出と振り返り欄挿入位置の検出
    - `qbCopy.ts` : コピー用の問題・選択肢・正解・解説の抽出と文面。UW Support の `qb_adapter.js` と `chat_core.js` の `fullText` から移植し、出力を一字一句そろえる
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
1. content script起動 → 設定読み込み → UI生成（`CHAT_ENABLED = false` の間はChat UI/認証/Chat handlerを初期化しない）
2. MutationObserver + URL監視で問題情報を更新
3. `core/qbDom.ts` が問題情報/本文を抽出
4. キーボード操作はトップ文書内の対象を優先し、対象がない旧UIのみ明示的な `input.medilink-study.com` iframeへ委譲
5. 新UIの `/result` は前後ナビゲーションボタンの存在で問題画面として判定する
6. 解説表示を検出すると振り返り欄を末尾へ注入し、問題UUIDで既存テキストと添付画像を復元する
7. 入力はdebounce、blur、問題切替でflushし、`storage.local` へ直列保存する
8. paste画像はClipboardEvent内Fileを優先し、Fileがないrich HTMLでは`<img src>`をdata/blob/HTTP(S)からFile化、最後にasync Clipboard APIへフォールバックする。ファイル選択/dropを含む全画像をPNGへ正規化し、SHA-256重複排除後に問題単位の画像ストアへ保存する。保存確認後のみキャレット位置へインラインノードを挿入し、本文にはwiki-linkマーカーを保存する
9. チャット送信時に問題スナップショット（画像含む）を生成
10. backgroundへ `QB_CHAT_STREAM_REQUEST` を送信 → OpenAI Responses API（SSE）/backend proxy → ストリーミング応答
11. ログインは backend `/auth/start` → Google OAuth → `/auth/callback` → `/auth/session` でセッション取得
12. 認証済みユーザーは backend `/settings` 経由で Firestore に同期
13. チャット表示はドックのみ（オーバーレイは使用しない）
14. MM模試ではQB用設定パネル・Chat・iframe委譲を初期化せず、共通のストレージ・テーマ・振り返りUIと模試専用キーボードハンドラだけを起動する
15. 模試専用ハンドラは設定済みキーを再利用し、`A`〜`G` を `.choice-cell`、左右矢印を表示中の `.btn-prev` / `.btn-next`、`S` を「解答を確認する」または「リトライ」へ直接接続する。テキスト入力中は処理しない
16. 模試の保存IDは画面の`.h3label h3`から取得した`A-1`形式の表示番号だけで `moshi:kokushi-mm{N}:{displayNumber}` を作り、URLが変わらないSPA問題切替でも問題単位で分離する。表示番号を取得できない間はパネルを生成せず、URLの`question_id`へフォールバックしない
17. ユーザー確認済みのA-14現行IDだけを旧データの確定所有先として保護する。それ以外の現行IDに、確認済みA-14本文断片、旧問題名の画像マーカー／画像ストア名、または旧レコードと同一本文が存在する場合は、過去バージョンによる誤配属として読み込み時に抑止する。保存値自体は削除しない
18. 振り返りの書式バーと`Cmd/Ctrl+B/I/U`・`Cmd/Ctrl+Shift+S`はcontenteditableの選択へインライン書式を適用し、inputイベントから既存の自動保存へ流す。本文はMarkdownへ直列化し、再表示時に書式DOMへ復元する
19. 行頭の`- `／`* `／`+ `／`1. `をリストDOMへ変換し、Tab／Shift+Tabは`li`を親項目配下／親階層へDOM移動する。`ul`／`ol`は2スペース単位のネストMarkdownへ直列化し、読込時に同じリスト階層へ復元する
20. コピーキー（既定 `Y`）と右下のボタンは、トップ文書で `qbCopy.ts` の `readCopyQuestion` と `copyText` を同期的に呼び、`navigator.clipboard.writeText` に渡す（Safari でユーザー操作の扱いが切れないよう await を挟まない）。失敗時は textarea と `execCommand('copy')`。UW Support のドック（`#uw-support-chat`）がある間はボタンを出さない。両拡張の自前UIは明示したid/classの一覧で除外し（`qb-support` 前方一致は body のクラスに当たるので使わない）、解説の文字からも振り返り欄などの自前UIの文字を差し引く

## 振り返り → Anki準備
- `core/reflection.ts` が問題識別、保存レコード生成、最大件数の整理を担当する。
- 保存レコードは振り返り本文に加え、問題文、選択肢、掲載頁、タグ、問題URL、`pdfId: "Vital_Step2CK"`、将来の `pdfRefs` を保持する。
- 画像本体は `qb_support_reflection_images_v1:<questionId>` に問題単位で分離し、本文のwiki-linkマーカーで参照する。Chromeでは `unlimitedStorage` を利用し、1000件の本文レコード上限と画像容量を切り離す。
- 保存方式は拡張内完結を採用した。QBには画像保存の前提となるVault `.md` がなく、既存のUWorld helperへ依存させるとhelper停止中・別端末で添付不能になるため。保存APIの失敗とread-back不一致はUIへ明示する。
- ファイル名は `QB_[問題コード]_reflection_N.png`（問題コード取得不能時はquestionId）で、PNG data URL・SHA-256・byteLengthを画像レコードに保持する。将来のAnki生成側は本文マーカーを抽出し、対応する問題単位画像ストアからdata URLを復号して `storeMediaFile` へ渡せる。
- debounceタイマーと画像POST相当の処理チェーンはパネルclosure内に置く。本文ストアは全問題を1キーに保持するため、read-modify-writeだけは拡張全体の直列チェーンを維持して更新消失を防ぐ。
- 画像の非同期処理は保存前とインライン挿入直前にlive questionIdを再確認する。保存後に問題が切り替わった場合は、別問題のDOMへ挿入せず元問題レコードへマーカーだけを直列保存する。
- 拡張側はローカル収集までを担う。Vault出力helperとPDFページ対応は未実装。
- カード生成は拡張の外（Obsidian側パイプライン）で行う。2026-07-18に初回バッチを実施し、
  溜まっていた40件の振り返りから66枚をAnkiデッキ `国試::QB振り返り` へ投入した。
  - 取り出し: Vault出力helperがないため、Atlasの拡張LevelDB
    （`Local Extension Settings/oeilmencikfjdfefobgjjphanppijmej`）をコピーして直接読む。
  - 生成: `01_USMLE/.anki_pipeline/scripts/build_batch_qb_1.py`（カード本体は `qb_batch_1_cards.json`）。
    手順とカード仕様は `01_USMLE/.anki_pipeline/README.md` の「QB系列」節を正本とする。
  - `questionText` にQB公式解説が丸ごと入るため、カードの医学的正本はレコード内で完結する。
    抽出仕様を縮小するとカード生成が成立しなくなるので、記録項目は削らない。

## Backend（Cloud Run）
- エンドポイント: `/health`, `/auth/start`, `/auth/session`, `/auth/callback`, `/auth/me`, `/settings`, `/chat`, `/chat/stream`
- `/chat` は `chat/completions`、`/chat/stream` は `responses` を使用
- APIキー未設定ユーザーは backend の OpenAI APIキーで代理実行（モデルは `gpt-5-mini` / `gpt-4.1` のみ）

## フレーム間通信
- top → `input.medilink-study.com` iframe: `QB_ACTION` / `QB_QUESTION_REQUEST`（トップ文書内に対象がない場合のみ）
- iframe → top: `QB_QUESTION_SNAPSHOT`
- 新UIのトップ文書内ナビ・解答はReact handlerへ届くDOM clickを直接発火する。選択肢は既存CDP経路を維持する。

## ランタイムメッセージ
- content → background: `QB_CHAT_REQUEST` / `QB_CHAT_STREAM_REQUEST`
- background → content (port): `QB_CHAT_STREAM_DELTA` / `QB_CHAT_STREAM_DONE` / `QB_CHAT_STREAM_ERROR`
- content → background: `QB_AUTH_GET_TOKEN` / `QB_AUTH_REMOVE_TOKEN`

## Safari差分
- `chrome.debugger` は使用不可。CDPクリックは自動でフォールバック。
- ストレージは `storage.sync` がなければ `storage.local` を利用。
- Google認証は backend OAuth を利用（`chrome.identity` に依存しない）。

## ページテーマ
- `html[data-qb-theme]` をテーマ状態の単一ソースとする。
- 旧UIの固有クラスと、新UIルート配下のTailwind utility classを `extension/content.css` で別々に上書きする。
- インラインで付与された解答ボタン・選択状態の色は新UIのダーク上書き対象から除外する。
- 旧UIの黄緑色`.service-header`はブランド背景を維持し、メニューのアイコン・ラベルは濃紺`#1a237e`を明示してダークテーマの白文字継承を遮断する。
- ダークテーマで解説HTMLが独自の明るいインライン背景を持つ場合は、その中立色の明背景surfaceをcomputed styleから検出して黒系へ正規化し、配下の直接テキストと罫線を白系へ揃える。対象は`.html_renderer`、結果本文、`#answerSection`。特定教材・特定背景色のセレクタは使わず、意味を持つ有彩色backgroundは維持する。
- `/exam_images_kokushi/`配下の画像は透過PNG内に黒い注釈を持つため例外扱いとする。`p > figure > img`を白背景に固定し、`isProtectedContentImageSurface()`で明色surface暗色化から除外する。
- `#EFEFEF`／`rgb(239, 239, 239)`のインライン背景は教材側で文字を囲うsurfaceとして使われるため、ダークテーマでは既知の解説コンテナ配下に限定せず、ページ全体から対象要素と全子要素を`#18232d`背景・`#f8fafc`文字へ明示上書きする。国試画像の白背景セレクタは別系統として維持する。
- MM模試では `html[data-qb-theme="dark"][data-qb-site="moshi"]` 配下だけを対象に、解説 `.bg` / `.commentary` / `.accBody`、解答表示 `.yourAnswer`、履歴表を暗色化する。模試サイト固有の白背景と共通テーマの白文字が衝突しないよう、背景・文字・罫線を一組で指定する。
