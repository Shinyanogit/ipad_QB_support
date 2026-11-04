# Safari (iPad) Setup

## 前提
- macOS + Xcode が必要（Safari Web Extension はiOSアプリとしてビルド）
- iPadはiOS/iPadOS 17 以降を推奨
- 実機に入れる場合はiPad側で「開発者モード」を有効化
- Xcode > Settings > Accounts でApple IDにサインインしておく

## 1) 拡張のビルド
```
npm run build:ext
```

## 2) Safari用の拡張ディレクトリを準備
```
./scripts/prepare-safari-extension.sh
```
`/safari/extension` にSafari用の `manifest.json` を用意します。

## 3) Safari Web Extension に変換
```
xcrun safari-web-extension-converter safari/extension
```
変換ウィザードで以下を選択/入力してください。
- 出力先: `safari/SafariWebExtension`（任意）
- Bundle ID: 任意（例: `com.example.qb-support`）
- プラットフォーム: iOS を有効化

※ 変換コマンドは処理が終わるとそのまま終了します。Xcodeが自動で開かない場合は、生成された `.xcodeproj` を手動で開いてください。

## 4) Xcodeで実機インストール
1. 生成された `safari/SafariWebExtension/*.xcodeproj` を開く
2. Signing & Capabilities でTeamを設定
3. **iOS App** ターゲットと **iOS Extension** ターゲットの Bundle Identifier を確認
   - App: `com.example.qb-support`
   - Extension: `com.example.qb-support.extension` のように **AppのIDで始まる値**にする
4. iPadを接続し、iOSアプリターゲットをビルド/実行

## 5) iPad側で拡張を有効化
- 設定 > Safari > 拡張機能 > 生成したアプリ をON
- 「すべてのWebサイトで許可」をON
- `https://qb.medilink-study.com/` を開いて動作確認

## トラブルシュート
- `Embedded binary's bundle identifier is not prefixed...`
  - ExtensionのBundle IDがAppのIDで始まっていません。AppとExtension両方を修正してください。
- XcodeにiPadが表示されない
  - ケーブル接続（データ通信対応）/ 端末のロック解除 / 「このコンピュータを信頼」を確認
  - Xcode > Window > Devices and Simulators で認識されるか確認
  - 無線接続は、ケーブル接続でペアリング後に「Connect via network」を有効化（同一Wi‑Fi必須）
- iPadで「信頼されていないデベロッパ」と表示される
  - 設定 > 一般 > VPNとデバイス管理 から開発者を信頼
- ログイン時にポップアップがブロックされる
  - Safariの制限でブロックされる場合があります。ログインURLを新規タブで開くか、対象サイトのポップアップ許可を検討してください。

## Safari用ビルドの扱い
- `safari/extension` は `./scripts/prepare-safari-extension.sh` で毎回上書きされる生成物
- Safari専用の修正を入れる場合は、`extension/` に反映してから生成するか、生成後に `safari/extension` を編集してください
- デバッグログは設定の `debugEnabled` がONのときのみ出力されます

## Airでのビルドと配備（2026-11-03）
mini の Xcode には Apple のアカウントが無く、Xcode の自動署名では作れないので、iPad 版は MacBook Air で作る。2026-11-04 からは mini で入れられる（下の「mini から iPad へ入れる」）。
1. mini で `npm run build:ext` → `./scripts/prepare-safari-extension.sh`
2. `rsync -a --delete --exclude .git --exclude node_modules --exclude backend --exclude '参考にしたいページ' --exclude build --exclude '.env*' --exclude build_only.command ./ air-ts:qbsupport-ipad/`
3. `ssh air-ts 'open ~/qbsupport-ipad/build_only.command'`（GUIセッションで xcodebuild を走らせる。署名に login keychain が要るため SSH から直接は走らせない）。ログは Air の `~/qbsupport-ipad-build.log`、最後に `build exit=0`
4. `ssh air-ts` で `xcrun devicectl device install app --device 70544873-D9E6-5A89-862C-903CB8E32674 "build/DerivedData/Build/Products/Debug-iphoneos/QB Support.app"`。初回は Connection reset で失敗しがちなので再試行する

落とし穴: Xcode プロジェクト `QB Support/` は `.gitignore` 対象で、git に入っていない。2026-11-03 に次の2点を直した（mini の作業コピーと Air の写しのみ）。
- `Shared (App)/IAPConfig.swift` と `SubscriptionManager.swift` が project に未登録で `cannot find 'SubscriptionManager' in scope`。両 App ターゲットの Sources に登録した
- `SubscriptionManager.swift` が `Transaction.jwsRepresentation` を参照してビルド不可。JWS は `VerificationResult` 側にあるので、`.verified` を取り出す箇所から `jws` を受け渡す形にした

2026-11-04 にもう1点直した（mini の作業コピーのみ。Air の写しへは次の配備の rsync で入る）。
- 症状: アプリを開くと「QB Support Plus／商品情報を取得中…／復元に失敗しました。」と購入・復元ボタンだけになり、先に進めないように見える
- 原因: `IAPConfig.productId` がテンプレートの `<<<PRODUCT_ID>>>` のままで、App Store Connect 側にも商品が無い。`Product.products` は何も返さず、商品名の欄は成功時にしか書き換わらないので「取得中」のまま残る。一時的な取得失敗ではなく毎回起きる。「復元に失敗しました。」は復元ボタンを押して `AppStore.sync()` が失敗した表示
- 影響: 拡張機能は課金状態を見ていない（`SafariWebExtensionHandler` はテンプレートの echo だけ、`src/` に課金判定は無い）。購入しなくても Safari で使える。先に進めないように見えたのは、`ViewController` が「設定で有効にしてください」の `Main.html` を隠していたため
- 修正: `SubscriptionManager.isConfigured`（商品IDが空かプレースホルダなら false）の間は StoreKit を呼ばず「購入はまだできません（準備中）」を出し、購入・復元ボタンを隠す。商品取得に失敗した時は商品名の欄に失敗を出す。iOS の画面には、機能拡張のオンにし方と「購入しなくても使えます」を常に出す
- 検証: mini で `xcodebuild -project "QB Support/QB Support.xcodeproj" -scheme "QB Support (iOS)" -sdk iphoneos -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build` が成功。iPad シミュレータで案内文が出てボタンが消えることを確認。共有の Swift は macOS 版にも入るので macOS scheme もビルドした。macOS 版は project の `MACOSX_DEPLOYMENT_TARGET` が 10.14 のままで今の Xcode（12.0 以上）では元から通らず、コマンドラインで `MACOSX_DEPLOYMENT_TARGET=12.0` を渡すと成功する（project は未変更）
- 課金を本当に使う時: App Store Connect にアプリ（`com.shinyyama.qb-support`）とサブスク商品を登録し（有料アプリ契約が有効で、商品は最低でも Ready to Submit）、その ID を `IAPConfig.productId` と backend の `APPLE_SUBSCRIPTION_PRODUCT_ID` に入れる。Air から devicectl で入れた開発署名のアプリは sandbox を見るので、商品が出るかは TestFlight か sandbox アカウントで確かめる。`.storekit` 設定ファイルは Xcode から実行した時だけ効き、devicectl で入れたアプリには効かない

## mini から iPad へ入れる（2026-11-04 から使える）
Air もケーブルも使わずに、QB Support と UW Support を mini で署名して iPad に入れるための `scripts/mini_install.py`。
- 署名: mini の Xcode に Apple ID は無いが、USMLE_qbank_web の `app/scripts/mini_signing.py` がチームの App Store Connect API キー（U7JT3699P2）で作った開発証明書（チーム 8WSQBQX6C5、2027-10-09 まで）が鍵束 `~/Library/Keychains/qbank-build.keychain-db` にある。これを使い回し、バンドルIDごとに `mini <バンドルID>` という開発プロファイルを API で作る。手動署名で `PROVISIONING_PROFILE_SPECIFIER=mini $(PRODUCT_BUNDLE_IDENTIFIER)` を渡すので、アプリと機能拡張がそれぞれのプロファイルを使う
- 同じチームとバンドルIDなので、Air で入れたアプリの上書きになり、App Group のデータは残る
- 使い方（PyJWT のある `/opt/anaconda3/bin/python3`）: `scripts/mini_install.py status`（読むだけ）、`setup`（足りないプロファイルを作って mini に置く）、`link [qb|uw]`（ビルドしてリンクで配る。省略で両方）、`install [qb|uw]`（ビルドして devicectl で入れる）。`build`／`link`／`install` は、mini にプロファイルが無ければ先に `setup` を走らせる
- **普段は `link`**（ケーブルも同じ Wi-Fi も要らない）: 署名したアプリを IPA にまとめ、https://mini.taild5aa65.ts.net:19795/ で tailnet 内だけに配る（Funnel は使わない。UW Support には Gemini キーが入っている）。本人は iPad の Safari でそのページを開き、各ボタンを押して「インストール」を押すだけ。両方の IPA が取られたら配信を止め、`tailscale serve` の設定も消す。iPad の Tailscale はオンにしておく
- UW Support は `../../USMLE_support/safari/gemini_api_key.txt`（gitignore）の Gemini キーを埋め込む。2026-11-04 に Air から mini へ置いた
- `install` は devicectl を使うので、iPad が mini と同じネットワーク（マルチキャストが通るもの）にいるか、ケーブルでつながっている時だけ。施設の Wi-Fi はマルチキャストを止めることが多く、2026-11-04 の Air の Wi-Fi（10.100.x.x/16）でも Bonjour の探索に自分以外が何も見えず、Wi-Fi 越しには見つけられなかった。mini は iPad とペアリング済み
- 2026-11-04 の準備: 本人が最新の Program License Agreement に同意した（それまで API は `403 PLA_NOT_ACCEPTED`）。`setup` で QB Support の App ID 2つ（`com.shinyyama.qb-support` と `.extension`）を登録し、4つのプロファイルを作った（2027-11-04 まで）。QB Support は Air でチーム共通のワイルドカードのプロファイル（`8WSQBQX6C5.*`）で署名されていたので、明示の App ID が無かった。`setup` は未登録のバンドルIDを自分で登録する。プロファイルが切れる前に `setup` をやり直す
- 同意の後の確かめ方: `setup` の後の `status` で、UW Support の2つのプロファイルの application-groups に `group.com.shinyyama.uwsupport` が出ること（QB Support は空でよい）。空なら開発者サイトで `com.shinyyama.uwsupport` と `.extension` の App ID に App Groups を付け、その2つのプロファイルを消して `setup` をやり直す。最初は entitlements の無い `install qb` で全体の流れを確かめる
- 無効になった同名のプロファイルが残っていると、`setup` が同じ名前で作り直し、xcodebuild が名前の重複で迷う。先に開発者サイトで古い方を消す
- 確認済み（2026-11-04）: mini で両アプリを署名してビルドでき、`codesign --verify --deep --strict` が通る。アプリと機能拡張がそれぞれ `mini <バンドルID>` で署名され、UW Support の2つには App Group が入る。`link` のページ、設定ファイル、tailnet 越しの取得、両方送りきった後の自動停止、中断時の `tailscale serve` の後片付けも確認した。リンクから iPad に入れるところは、本人が押した時に確かめる
- `link` の完了判定は IPA を最後まで送りきった回数で数える。動作確認で自分から IPA を取ると、iPad が取る前に数えられてしまうので、ページか設定ファイルだけを取って確かめる

## QB のページで拡張機能が何も出さない時（2026-11-04）
- 症状: iPad の Safari で QB の問題ページを開いても、UW Support の白いタブ（右端の真ん中）も、白い丸のコピーボタン（右下）も、左上の設定ボタンも出ない。機能拡張の管理画面では両方オン
- 原因（消去法で確定。実機では未観察）: 両方の拡張機能が qb.medilink-study.com のサイト別の許可を得ておらず、スクリプトがページに入っていない。Safari は新しいサイトを既定で「確認」にし、許可されるまで注入しない。許可を求める表示はアドレスバーのメニューの中にしか出ないので気づきにくい
  - UW Support の白いタブは、スクリプトが入れば問題の読み取りやアプリの状態に関係なく必ず出る（`chat_dock.js` の `mount()`）
  - WebKit 26.6（iPadOS 26.6 と同じ系統）で、QB の問題ページのキャプチャに両方の Safari 版を入れると、タブ、両方のコピー、設定ボタンがすべて出てエラーは0（`scripts/webkit_qb_check.py`）
  - 同じ時間帯（18:03〜18:28）に、同じ iPad の UW Support が UWorld では動いていた（helper の tailnet-audit に iPad からの `/uw-capture`）
  - QB のサイトに CSP は無い（ヘッダーにも HTML にも無い）。スタイルが止められて見えない説は消えた
  - 2つの別々の拡張機能に共通するのは Safari のサイト別の許可だけで、どちらも QB は新しいサイト（QB Support は 11-03 に初めて入れた、UW Support は 1.6.32 で QB を足した）
- 直し方（本人が拡張機能ごとに1回）: 設定 > アプリ > Safari > 機能拡張 > QB Support と UW_SUPPORT のそれぞれで、`qb.medilink-study.com`（または「その他の Web サイト」）を「許可」にする。または QB のページでアドレスバーのメニューから各拡張機能を「常に許可」。その後ページを再読み込み
- 後で実機で確かめる印: `html[data-qb-support-injected="true"]` と `#qb-support-marker`（QB Support が設定の読み込み前に付ける）、`#uw-support-chat`（UW Support のドックの土台）。Web インスペクタで見られる
- astra の調査（gpt-6-astra high、読み取り専用）も同じ順位だった。astra の修正案3つは、本人の指示で下の守りの修正と一緒に入れた（UW Support の API 呼び出し形式の2つは、同じコードが iPad の UWorld で動いているので実機の原因ではない）

### 判別テストと守りの修正（2026-11-04 夜、QB Support 0.1.25 と UW Support 1.6.34）
`scripts/webkit_qb_check.py` に、保存ページ（118E36、旧 UI）で状況を作り分けて両方の Safari 版を入れるシナリオを足した（使い方はスクリプト冒頭）。mini の WebKit 26.6 で、修正前のビルドと修正後のビルドを同じ条件で比べた。CSP 違反は全シナリオで0。

| シナリオ | 修正前（UW 1.6.33、QB 0.1.24） | 修正後（UW 1.6.34、QB 0.1.25） |
|-|-|-|
| both（Safari と同じ API、両方を注入） | タブと UW のコピー | 同じ |
| uw-only / qb-only | UW はタブとコピー / QB はコピー | 同じ |
| none（サイトの許可が無い時と同じ） | 何も出ない | 何も出ない（コードでは直せない） |
| browser-only（`browser` だけある） | UW は content.js の参照エラーで止まりタブなし。QB のコピーだけ | タブと UW のコピー |
| promise-only（コールバックを呼ばない API） | UW のドックが設定の読み込みで止まりタブなし。QB のコピーだけ | タブと UW のコピー |
| stalled-storage（storage が答えない） | **両方とも止まり何も出ない**（判別テストで出た新しい候補） | 4秒でタブと UW のコピー。QB は3秒で既定値のまま起動し、UW のコピーが出たら引っ込む（同じ位置で重なるのは0.5秒以内） |
| hide-uw（UW の土台はあるが見えない） | 何も見えない（QB は土台があるだけで自分のコピーを出さない） | QB のコピーが出る |
| no-choices（選択肢が読めない） | タブだけ | 同じ。ページの作りが違う時はタブだけ残るので見分けられる |
| no-css / root-transform | 全部出る | 同じ |
| qb-panel-closed（QB の設定パネルを閉じて保存） | **QB のコピーが出ない**（新しい候補。注入はされている） | QB のコピーが出る |

入れた修正:
- QB Support 0.1.25（この repo）
  - コピーボタンは、UW Support のコピーボタンが本当に画面に見えている時だけ隠す（astra 案3）。UW のドックは body の外の shadow root にあり監視に掛からないので、500ms のタイマーで「見えているか」が変わった時だけ再評価する（`innerText` を毎回読まない）
  - コピーボタンを `settings.enabled` から切り離した。これは設定パネルが開いているかの値で（閉じると `false` で保存される）、パネルを一度閉じるとコピーボタンが出なくなっていた
  - 設定の読み込みに3秒の上限。超えたら既定値で起動し、読み込みが答えたら反映する
- UW Support 1.6.34（`USMLE_support`、branch `qb-kokushi` で未コミット。詳細は `USMLE_support/docs/TODO_PLAN.md`）
  - helper のトークン同期の `chrome.storage.onChanged` を、`chrome` が無ければ `browser` で登録する（astra 案1）
  - `chat_dock.js` は `browser` があれば Promise 形式で呼ぶ（astra 案2）。Chrome には `browser` が無いので従来どおりコールバック
  - ドックの設定の読み込みに4秒の上限。超えたら既定値でタブとコピーを出し、読み込みが答えたら反映する
  - Safari の QB と qbank のページでは、ページ側の設定の読み込みにも4秒の上限を付け、キーとコピーを先に始める。読み込み自体は止めないので、保存値の移行の書き戻しは本物の値でしか走らない
  - アプリ画面の案内に「QB でも使う場合は qb.medilink-study.com も許可、確認のままでは何も出ない」を足した（本来の原因への対策）
- 見送り: Safari 版の `build_config.js` で `chrome` が無い時に `browser` を割り当てる案。Safari には常に `chrome` があり、`safari/tests/build_test.py` は `build_config.js` を1文として読む
- 確認: QB の typecheck と `npm test`、USMLE_support の Node テスト33件すべてと `safari/tests/build_test.py`、headless Chrome の `tests/chat_dock_dom_test.html`（Chrome 側のドックが従来どおり動く）、mini での両方の署名ビルドと `codesign --verify --deep --strict`。QB アプリ本体に案内文と「準備中」の表示が入っていることもビルド成果物で確かめた
- 確かめられていないこと: 実機の Safari の API の形とサイト別の許可（WebKit では分からない）。現行の新 UI（React）の保存ページが無く、新 UI は 11-03 の mini の Chrome の実画面確認と Node テストだけ（11-04 夜は mini の Chrome の AppleEvent がタイムアウトして取れなかった）。実機で何も出ないままなら、引き続きサイト別の許可が本命

## iPad でのコピー（2026-11-04 夜、QB Support 0.1.26 と UW Support 1.6.35）
- 使い方: QB の問題ページで、右下の白い丸いコピーボタンを押すか、`Y` キーを押す。`Y` はハードウェアキーボード（Magic Keyboard など）がある時だけで、タッチはボタンを使う。両方の拡張機能を許可している時は UW Support のボタンが出て、`Y` も UW Support が先に処理する（二重にはコピーしない）。キーは UW Support では設定パネル（`P`）、QB Support では設定の「ショートカット」で変えられる
- コピーの中身: 解答前は問題文、選択肢、ヒントの依頼文（「上記について絶妙なヒントをください。今の考察は以下です。」と「・」）。解答後は問題文、選択肢、正解（自分の解答が違う時はそれも）、解説全文。両方の拡張機能で一字一句同じ
- ボタンの名前: 解答前は「問題をコピー Y」、解答後は「問題と解説をコピー Y」（それまでは解答前でも「問題と解説をコピー」と出ていた）。どちらの段階でもコピーは「問題をコピーしました」か「問題と解説をコピーしました」と表示する
- 0.1.26 と 1.6.35 で直したこと: UW Support のドックのボタンは、問題画像（最大4枚）を background 経由で取り込んだ `snapshot` が届くまで出なかった。画像のある問題では取得が遅いか止まると、解答前にボタンが出なかった。ページの読み取り結果（`qb_adapter.js` の `copyState`）で出し入れするようにした
- 判別テスト（`scripts/webkit_qb_check.py`、mini の WebKit 26.6、保存ページ 118E36 の解答前）: 画像の取得が止まる問題（`stem-image-stalled`）で、修正前は UW のボタンが出ず、修正後は「問題をコピー Y」で出る。`copy-before` でボタンと `Y` の両方が312字（問題文、選択肢、ヒントの依頼文）をコピーし、`copy-after`（答えの欄と解説を後から足す）では名前が「問題と解説をコピー Y」に変わり、両方が325字（解説の最後の文まで）をコピーした。ほかの12シナリオは前と同じ結果
- 確かめていないこと: 現行の新 UI（React）の解答前の画面での表示は実機と mini の Chrome のどちらでも見ていない。読み取りは 11-03 に mini の Chrome の新 UI の解答前の問題（115D68）で選択肢のキーが効いたことで確かめてある

## 更新時
- 変更後は `npm run build:ext` → `./scripts/prepare-safari-extension.sh`
- 生成済みのXcodeプロジェクトにファイルを上書きするか、再変換してください
