# TODO Plan

## Done
- MVPスケルトン作成（MV3 + content script）
- 問題情報抽出（問題ID/進捗/選択肢数/掲載頁/タグ）
- 注入UI（表示/位置/ショートカット設定）
- キーボード操作（次/前移動、選択肢トグル、送信→解答確認）
- SPA/DOM更新追従（MutationObserver + URL監視）
- フレーム委譲（top → iframe の postMessage）
- ChatGPTバーの追加（APIキー保存/トグル/ドラッグ切替）
- Safari向け互換レイヤ（`webext`）
- Chatストリーミング表示（Responses API）
- Markdown表示/コピー/トークン消費表示
- テンプレート送信（ショートカット/編集UI）
- Backend OAuthとFirestore設定同期
- バックエンド経由のOpenAI呼び出し（認証済みユーザー向け）
- テーマ（ライト/ダーク/システム）とページ配色切替
- 新 `/quiz?question_id=...` UIのトップ文書DOM検出
- 新UIの `A`〜`G` / `S` / 左右キー操作と旧設定の自動移行
- 新UIのTailwind utility class向けダークモード
- 問題と解説のコピー（2026-11-03、0.1.24）: `Y`キー（設定の「ショートカット」で変更可）と右下の丸いボタンで、問題文と選択肢（解答前はヒント依頼文つき）、解答後は正解・自分の解答（違う時のみ）・解説全文をコピー。抽出と文面は `src/core/qbCopy.ts`。UW Support（`../../USMLE_support/qb_adapter.js` + `chat_core.js` の `fullText`）と一字一句同じ文面になるよう移植し、`tests/copy_text.test.mjs`（`npm test`）と UW Support 側のテストが同じ期待文面を持つ。miniのChromeのQB実画面で、本拡張の抽出コードを注入した出力とUW Supportのコピーが一致（7,168字）することを確認。UW Supportと同居する時は、キーはUW Supportが先に処理し、本拡張のボタンはUW Supportのコピーボタンが見えている間は出さない（0.1.25）
- [x] 解答前のコピーを分かりやすく（2026-11-04 夜、0.1.26 と UW Support 1.6.35）: 本人の要望「問題の段階でもコピーしたい」。解答前のコピーはもともとできたが、UW Support のボタンは問題画像の取り込みを待ってから出ていたので、画像のある問題で解答前に出ないことがあった。UW Support はページの読み取り結果でボタンを出すようにし、両方のボタンの名前を解答前は「問題をコピー Y」、解答後は「問題と解説をコピー Y」にした。キーは既存の `Y` のまま、両方のアプリ画面と docs に書いた。詳細と判別テストは `07_SAFARI_SETUP.md`
- iPadへの初インストール（2026-11-03、0.1.23）: MacBook Air の `~/qbsupport-ipad` で `build_only.command` をGUIセッションから開いてビルドし、`xcrun devicectl device install app` で入れた。手順は `07_SAFARI_SETUP.md` の「Airでのビルドと配備」
- アプリ画面の「商品情報を取得中…」止まり（2026-11-04 報告。iPad の QB Support は 11-03 17:26 JST に入れた 0.1.23。報告にあったビルド 20261103061110 は UW Support 1.6.32 の番号）: 商品IDが未設定のプレースホルダで毎回起きる表示の不具合で、拡張機能の動作は止めていない。未設定の間は購入・復元を隠し、機能拡張のオンにし方を常に出すよう直した（Xcode プロジェクトは git 外。詳細は `07_SAFARI_SETUP.md` の落とし穴）
- トップ文書優先・明示iframe限定のアクション配送と二重クリック解消
- 新UI左ナビのinline白背景をダークテーマで明示上書き
- `S` を保存設定に依存しない解答エイリアスとして追加
- QB Chatを `CHAT_ENABLED = false` で一時停止（実装は保持）
- IME時の `KeyS` 物理コード認識と、トップ文書内ナビ/解答のDOM直接click
- 解説HTMLの見出し（「主要所見」「KEYWORD」等）をダークテーマで明色化
- 解説HTML内の明るい独自背景に白文字が継承される問題を、中立色の明背景surface自体の黒系化＋文字・表罫線の白系化で修正
- 黄緑色のQBヘッダーでダークテーマの白文字が継承される問題を修正し、メニュー文字・アイコンをブランド濃紺へ固定（v0.1.8）
- ノート非表示時に基準値本文まで消えるセレクタ競合を修正
- UW-supportを踏襲した解説末尾の振り返り欄と自動保存UI
- 問題UUID単位の振り返り・問題メタデータ・`Vital_Step2CK` PDF指定の保存
- 問題切替時flush、非同期UUID再確認、保存処理の直列化
- 振り返り欄への画像添付（paste/async Clipboard API・ファイル選択・drop、PNG正規化、SHA-256重複排除、キャレット位置挿入、再訪復元、拡大プレビュー、明示エラー）
- 振り返り画像を問題単位の `storage.local` 別キーへ保存し、Chrome版へ `unlimitedStorage` を追加（v0.1.9）
- ClipboardEventに画像Fileがなくrich HTMLの`<img>`だけがあるpasteを直接File化し、通常pasteの誤遮断を解消（v0.1.10）
- 振り返り欄のmarkdown書式対応（v0.1.11）: 太字/斜体/下線/取り消し線を `**` `*` `<u>` `~~` として
  保存・復元し、Cmd/Ctrl+B・I・U で書式適用→自動保存。`- ` 等のブロック記法はテキストのまま保持
  （ノートPDF/Obsidian側でmarkdownとして描画）。UW-support 1.6.1 にも同実装
- 振り返り欄の太字・斜体・下線・取り消し線をMarkdownとして保存・復元し、Cmd/Ctrl+B/I/Uを自動保存へ接続（v0.1.11）
- MM医師国試模試の復習ページに共通振り返り欄を追加（v0.1.14）
  - 実ロード元 `ipad拡張機能/QB_support/extension` のChrome/Safari manifestへ `moshi.medilink-study.com` を追加
  - 第N回・`question_id`・`A-1` を抽出し、QBと衝突しない保存IDを生成
  - 問題ナビ直前へ既存の画像・Markdown・自動保存対応パネルを注入
  - QB+模試の合計を保持できるようレコード上限を1000件へ拡張
  - 模試専用のページ識別属性でCSSを限定し、ダークテーマ時の解説・解答履歴を暗色背景と明色文字へ統一
  - `A`〜`G`、`S`、左右矢印を模試の選択肢・解答確認（リトライを含む）・前後問題へ接続し、`.yourAnswer` の配色も修正
  - 2026-08-24 Chrome実画面で、振り返り欄、問題・解説・解答履歴のダーク配色、ショートカット一式を確認済み
- MM模試のSPA問題切替でURLの`question_id`が固定のため前問の振り返りが残る問題を修正（v0.1.15）
  - 表示番号`A-46`等を保存IDに採用し、問題切替で旧パネルをflushして新問の保存データへ切替
  - v0.1.14のURLベース旧レコードは問題コード一致時だけ本文・画像を新IDへ非破壊コピー
  - 表示番号の正規化テスト、TypeScript型検査、Chrome bundle生成、構文検査を通過
- A-14の旧振り返りがv0.1.15で表示対象から外れた問題を修正（v0.1.16）
  - MM模試だけで旧URL ID・表示番号・試験回の一致を復旧根拠に追加
  - 空の新レコードは内容のある旧レコードを妨げず、内容のある新レコードは上書きしない
  - 旧キーは削除せず、通常QBの保存経路は変更しない
- 振り返り欄のNotion的なインライン書式操作を修正（v0.1.17）
  - MM模試側CSSで`<b>`の太字が打ち消されていた問題を、編集欄内の明示書式で修正
  - B/I/U/S書式バーと`Cmd/Ctrl+Shift+S`の取り消し線を追加
  - 選択範囲の適用・解除、自動保存、問題往復後のMarkdown復元を実画面確認する
- A-14旧振り返りがE-45/E-46等へ誤配属される回帰を修正（v0.1.18）
  - URLの`question_id`は問題番号ではないと確定し、旧URLキーからの一般的な自動移行を全面停止する
  - 既に復旧・ユーザー確認済みのA-14だけを確定所有先として保護する
  - 元問題以外へ既に複製された旧レコード同一本文・旧画像マーカーは削除せず表示抑止する
  - 通常QBの保存・読み込み経路は変更しない
- E-45/E-46の実保存形でv0.1.18の同一本文照合が成立しない問題を修正（v0.1.19）
  - A-14の確認済み本文断片と旧画像ストア名も誤配属判定へ加える
  - A-14では抑止せず、他問の保存値も削除しない
- 振り返り欄のNotion的リスト編集を実装（v0.1.20）
  - `- `／`* `／`+ `／`1. `の入力を箇条書き／番号付きリストへ自動変換
  - Enter継続・空項目Enter終了、Tab／Shift+Tabによる階層化／解除
  - リスト用ツールバーボタンと、ネストMarkdownの保存・復元
  - Chrome headlessでネスト4リスト、インライン書式、記号自動変換、Tab往復、ボタン3状態を検証
- 透過された国試画像の黒文字がダークテーマで潰れる問題を修正（v0.1.21）
  - `/exam_images_kokushi/`の`p > figure > img`を白背景に固定
  - 画像領域を汎用の明色surface暗色化から除外
  - Chrome headlessで3要素のcomputed backgroundと保護判定を検証
- `#EFEFEF`解説surfaceが白文字を潰す問題を修正（v0.1.22）
  - hex表記の空白・大小文字と`rgb(239, 239, 239)`を暗色背景へ変換
  - `b`等の子要素も同じ背景・明色文字へ統一し、国試画像の白背景は維持
- Levine分類の薄灰色surfaceが既知の解説コンテナ外で暗色化されない問題を修正（v0.1.23）
  - 特定の親クラスへの依存を除去
  - コンテナ外の再現ケースをChrome headless検証へ追加

## Debug Notes
- A: `[QB_SUPPORT][inject]` が出ない → content script 未注入
- B: `[QB_SUPPORT][nav]/[submit]/[reveal]` の target が `null` → DOM取得失敗
- C: クリックログが出るが反応しない → サイト側イベント要件
- D: Chatが無応答 → APIキー未設定 or background未動作
- E: OAuthが進まない → backend `/auth/start` のURL/redirect_uri設定を確認
- F: 「デバッグを開始しました」警告 → `chrome.debugger` 使用時のChrome強制表示（非表示不可）
- G: Atlasで動く実拡張IDは `oeilmencikfjdfefobgjjphanppijmej`。path は `.../ipad拡張機能/QB_support/extension`。別の `QB_support` repo を直しても反映されない。
- H: 新UIでキー入力が無反応に見える場合は、まず Atlas の `debug.log` を `QB_SUPPORT` で tail する。`key-capture` 直後の `frame-skip` はページ判定失敗、`action-sent` 後の target null は DOM selector 失敗。
- I: 新UIでは正常時に `action-local`（`reason: target-in-top`）が出る。`action-sent` は旧 `input.medilink-study.com` iframeへ委譲した場合のみ。
- J: MM模試のキー操作は `[QB_SUPPORT][moshi-shortcut]` を確認する。`target: null` の場合は現在状態に対応する操作がない（例: A-1で左矢印）か、模試DOM変更を疑う。
- [x] `/result` でも左右ショートカットが動くよう、ナビボタンを問題画面判定に追加
- [x] `side-reference-body` をノート表示設定から分離し、基準値表を常に表示

## 振り返り → Anki（2026-08-20 バッチ4実施）
- [x] 全ブラウザマージ後の未処理振り返り約190件（＋117D47のe03）から **244枚** を生成し、
  デッキ計 **416枚**（正解位置 A:104/B:104/C:104/D:104 の完全均等、既存172枚は不変）。push・sync完了。
- 著述は **codex luna（gpt-5.6-luna, effort max）** を1コール2〜3振り返りで並列実行。
  文体見本3枚のfew-shot＋密度基準（設問100-260字・解説650字+・因果鎖5段+）＋機械ゲート
  （`judge.py` 相当）で家風を強制。ゲート244/244一発通過 → sol検証65チャンクで指摘77件 → 修正56チャンク。
- **長時間ジョブの教訓**: (1) 開始時に `caffeinate -is` でスリープ抑止（夜間スリープで7時間停止した）
  (2) codex exec は `-c mcp_servers={}` でMCPを切る（グローバルconfigのMCPロードでハングする）
  (3) ワーカーごとに CODEX_HOME を分離（状態ファイル競合でハング）(4) メモリ逼迫時は並列2まで。
- builder修正: `pg: null`（掲載頁なしの連問30枚）が `PDFCaption` にNoneのまま渡り
  `addNote: bad argument type` になるのを `c.get("pg") or ""` で解消。

## 振り返り → Anki（2026-07-22 バッチ3実施）
- [x] 未処理の振り返り65件（07-18〜07-22分）から98枚を生成し、デッキ合計 **172枚**（110問）。
  13並列で著述 → チャンク単位で別エージェントが敵対的検証 → `qb_qc.py` で機械QC。
  - **カード裏面に2欄を追加**（note type にフィールド追加、`qb_model_panes.py` で冪等適用）:
    - `ChoiceReview`（選択肢の検討）: 全選択肢を1行ずつ、不正解は「なぜ違うか」を1文。
      カード側は `why` を**選択肢テキストをキー**に持ち、A/B/C/Dのラベルはシャッフル確定後に
      ビルド側が振る（文字参照で書くとシャッフルで壊れるため）。既存74枚にも後付け済み。
    - `ReflectionRaw`（自分の振り返り・原文）: 裏面の一番最後。`qb_reflections.json` の本文を
      そのまま出し、`![[...png]]` は**書いた位置にインライン画像**として展開する。
      画像が現存しないマーカー（v0.1.9 以前に失われた添付）は壊れた画像を出さずに落とす。
  - 正解位置は `qb_freeze_positions.py` で均等化して A:43 / B:43 / C:43 / D:43。
    位置はカードJSONに凍結し、既に配信済みのバッチ1は `--keep` で保護した。
- [x] 既存バッチ1/2に対する39指摘のうち29枚を修正（10件は医学的に妥当として却下）。
  復習履歴を守るため**選択肢の個数・順序は変えず文言のみ**書き換える制約を敷き、
  `qb_apply_patches.py` が不変条件を検算してから適用する方式にした。
  適用前後で正解位置が1枚も動かないことを機械確認済み。
- [x] **同期を自動化した**。AnkiConnect の `sync` はスキーマ変更時に `Sync status 2` で止まり
  方向を選ぶ手段が無いため、自作アドオン `qb_full_sync` で `fullSync`（`direction` 必須・
  事前ローカルバックアップ）を足し、`qb_sync.py` が通常同期→フル同期へ自動エスカレーションする。
  以後この経路に手動クリックは不要。アドオンのソースは `.anki_pipeline/anki_addon/` にも複製。

## 振り返り → Anki（2026-07-18 初回バッチ実施）
- [x] 溜まっていた振り返り40件から66枚のカードを生成し、デッキ `国試::QB振り返り` へ投入・sync。
  再実行で added=0 / updated=66（ExternalIDで冪等）、正解位置は A:18 / B:10 / C:16 / D:22。
  - note type `QB Essence MCQ v1`（`USMLE Essence MCQ v1` のCSS/レイアウト継承・設問は日本語）。
  - ExternalID = `QB_[問題コード]::eNN::mcq`（例 `QB_117B29::e01::mcq`）。
  - スクリプトとカード本体は `01_USMLE/.anki_pipeline/scripts/build_batch_qb_1.py` /
    `qb_batch_1_cards.json`。仕様の正本は `01_USMLE/.anki_pipeline/README.md` の「QB系列」節。
  - PDFは66枚中41枚に `Vital_Step2CK` の該当ページを添付済み（`page_map.py` のキーワード解決、
    QB用に25トピック追加）。残り25枚は日本特有の内容でVitalに該当ページが無いため意図的に未添付。
- 今回はVault出力helperが無いため、Atlasの拡張LevelDBを直接読んで取り出した。
  拡張側にexport機能を付ければこの手順は不要になる。

## 振り返り → 単元別ノートPDF（2026-08-19 追加）
- [x] 未Anki化の振り返りを単元別（A〜Yフル区分）に並べた復習ノートを生成する流れを整備。
  実体は `01_USMLE/.anki_pipeline/scripts/qb_build_notes.py`＋`qb_note_plan.json`、
  出力は `exports/QB振り返り_<単元>.md` と結合PDF。詳細は `.anki_pipeline/README.md` の
  「QB 振り返りノート」節。
- 今後のバッチでも「export → plan更新（単元割当＋類似概念順）→ build」を繰り返す。
- 将来: UWorld 版（`プログラミング/USMLE_support`）にも同じ流れを展開（単元区分はUW仕様）。

## Next
- [ ] `?`（Shift+/）でショートカットのチートシートを開く（2026-11-06、本人の要望）。UW Support と同じ形にそろえる。内容と条件は `../../USMLE_support/docs/TODO_PLAN.md` の中期タスク
- **保存済み振り返りのVault出力/helper API（優先度上げ・2026-08-19）**。storage.local は
  ブラウザ×プロファイル単位で孤立し、Atlas→Chrome 移行で振り返りが2箇所に分裂した
  （exporter側は全ブラウザ走査＋マージで暫定対応済み）。ブラウザ非依存の正本を helper 経由で
  Vault に書く UWorld 方式へ移行する
- **画像添付の保存バグ2種（Chrome側で実確認・2026-08-19）**:
  (1) JPEGペーストが PNG 正規化されず `.png` 名で JPEG バイト列のまま保存される
  (2) まれに imageDataUrl が空文字で保存され添付が失われる（QB_120A23 で実害）。
  v0.1.9 の保存→読み戻し検証をすり抜ける経路がある
- [x] **振り返り欄のmarkdown書式の下流反映（2026-08-20完了）**: Ankiの `ReflectionRaw` 欄も
  markdownをHTMLとして描画する（`build_batch_qb_1.py` の `markdown_block()`/`markdown_inline()`）。
  太字/斜体/下線/打消のインライン変換＋`- `/`1. ` 行の `<ul>`/`<ol>` 化。HTMLエスケープ後に
  変換するのでXSS安全。既存302件の振り返りはmd記法未使用のため出力不変（全件dry-run確認済み）。
  次回push以降、md記法で書いた振り返りはカード裏面でも書式付きで表示される。
- 日本特有の25枚（CGA7・Forrester分類・医学史・SMA症候群・採血管・経鼻胃管・ERAS等）は
  Vitalに該当ページが無い。QB2027 PDFを入手できれば `page_map.py` 相当で埋められる
- [x] 2回目以降のバッチの差分抽出は、既存 `qb_batch_*_cards.json` の ExternalID から問題コードを
  引いて差集合を取る方式で解決（バッチ3で111件中65件を特定）。専用スクリプトはまだ無い
- iPad Safariでの実機確認: 2026-11-04 17:30 に QB Support 0.1.24 と UW Support 1.6.33 を入れた（すぐ下の [x] の行）。QB の国試問題でコピーボタンと `Y` キーが動くか、アプリ画面に案内文が出るかの確認は本人
- [x] iPadへの再配備（2026-11-04 17:30）: Air で QB Support を今日の修正込みで作り直し、UW Support 1.6.33（ビルド 20261103091516）と一緒に、Air とケーブルでつないで devicectl で入れた（どちらも1回目で成功、iPad のアプリ一覧で確認）。Air の Wi-Fi 越しには iPad を見つけられなかった（マルチキャストが止まっていた）
- iPad の QB でコピーボタンが出ない（2026-11-04 報告）: iPad の拡張がどちらもボタン追加前の版（UW Support 1.6.32、QB Support 0.1.23）のため。UW Support 1.6.33 と QB Support 0.1.24 は 11-03 に Air でビルド済みだが、インストールは iPad が見つからず（CoreDevice error 1011）失敗したまま。UW Support のドック（`#uw-support-chat`）がある間は QB Support のボタンを出さない設計なので、UW Support 1.6.33 も一緒に入れないとボタンは出ない。2026-11-04 17:30 に両方入れたので解消の見込み。本人に確認してもらう項目は FORshinya の 2026-11-04 の節
- 課金を使うなら: App Store Connect にアプリとサブスク商品を登録し、ID を `IAPConfig.productId` と backend の `APPLE_SUBSCRIPTION_PRODUCT_ID` に入れる。確認は TestFlight か sandbox アカウントで（実購入はしない）
- mini から iPad へ入れる（`scripts/mini_install.py`、手順は `07_SAFARI_SETUP.md`）: 2026-11-04 に契約への同意、App ID の登録、プロファイル4つの作成、mini での署名ビルドまで済んだ。残りは、リンクから iPad に入れるところを本人が一度押して確かめること。以後は `link` が普段の入れ方（Air もケーブルも使わない）
- Air や mini の devicectl から iPad が見えない時: 施設の Wi-Fi はマルチキャストを止めることが多く、同じ Wi-Fi でも見つからない。ケーブルを前提にしない（本人の指示）。リンク方式（`mini_install.py link`）を使う
- QB のページで両方の拡張機能が何も出さない（2026-11-04）: サイト別の許可が無いのが原因（`07_SAFARI_SETUP.md`）。本人が両方を「許可」にして再読み込みすれば直る見込み。直ったかは次に本人が QB を開いた時に分かる
- [x] 守りの改善（2026-11-04 夜、本人の指示で前倒し）: QB Support 0.1.25 と UW Support 1.6.34 に、astra 案3つと判別テストで出た2件（storage が答えないと両方止まる、QB の設定パネルを閉じるとコピーが出ない）の修正、UW Support のアプリ画面の許可の案内を入れた。判別テストの前後の表は `07_SAFARI_SETUP.md`。mini でビルドしてリンクで配った。iPad に入れるのと、両方の拡張機能で qb.medilink-study.com を「許可」にするのは本人
- [x] UW Support 1.6.32 から 1.6.35 は、astra の Chrome 監査（A17 から A17d、最後は BLOCKER 0件）を通して 2026-11-04 に USMLE_support の main へ取り込んだ（c52aaf9、同日 origin へ push）。監査で出た QB の読み取りの直しは本拡張の `qbCopy.ts` にも入れた（`07_SAFARI_SETUP.md` の「main 取り込み前の監査で直したこと」）
- [x] UW Support 1.6.36（iPad で拡張の background が数分止まっても翻訳を mini の helper へ直接頼む、ページ移動後の1回目の翻訳で前の問題のキャッシュを使う不具合と、やり直しがそのキャッシュを消す不具合の修正、Safari だけ）を、astra の監査 A21 から A21e（最後は指摘0件）を通して 2026-11-05 に USMLE_support の main へ取り込んだ（515cab9、同日 origin へ push）。QB Support は 0.1.26 のままで、同じリンクで一緒に配ったが、17:31 から 18:31 の間にどちらも取られずに止まった。2026-11-06 11:25 に開き直し、11:26 に両方の IPA が最後まで送られ、本人が両方を入れたと報告した。詳細は `USMLE_support/docs/TODO_PLAN.md` と `USMLE_support/docs/IPAD_CHAT_CONTRACTS.md` §18
- [x] コピーの末尾のヒントの依頼文を本人の指定文にした（2026-11-06、0.1.27）: 「絶妙なヒント（答えありきでなく、所見や症状から推論する視点で思考力を養う答えに迫りすぎないもの）をどうぞ。今の考察は以下です。」と改行して「・」。`src/core/qbCopy.ts` の `HINT` と UW Support の `chat_core.js` の `HINT` が同じ文字列で、`tests/copy_text.test.mjs` と UW Support の `tests/qb_adapter_test.mjs` が同じ文面を確かめる。同時に UW Support 1.6.37 で iPad の UWorld にも同じ丸いコピーボタンと `Y` が入った。2026-11-06 に main へ取り込み（079ce26、UW Support は fc9ac2e）、12:00 から mini のリンクで 1.6.37 と一緒に配布し、12:02 に iPad が両方を取った。詳細は `../../USMLE_support/docs/TODO_PLAN.md` の 2026-11-06 の項と `IPAD_CHAT_CONTRACTS.md` §19
- Xcode プロジェクト `QB Support/` を git に入れるか決める（11-03 の2件と 11-04 の1件の修正が mini の作業コピーにしか無い）
- 新UI修正後のAtlas実機確認（拡張リロード → QBタブ再読み込み → `key-capture` / `action-local` / 各targetログを確認）
- 明るい背景を持つ解説カードが黒背景・白文字・白系罫線になることをAtlas実機確認（`[QB_SUPPORT][theme] normalized light explanation surfaces` はdebug有効時のみ）
- 必要になった時点でQB Chatを再有効化し、現行API/認証経路を再検証
- チャット履歴のUX調整（質問切替時の扱い）
- OpenAIモデル選択/エラー表示の改善
- 単体テスト雛形（coreのDOM抽出）
