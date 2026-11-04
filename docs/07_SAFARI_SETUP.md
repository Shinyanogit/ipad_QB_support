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
mini の Xcode には Apple のアカウントが無く、Xcode の自動署名では作れないので、iPad 版は MacBook Air で作る。mini で API キーの証明書を使って入れる道は下の「mini から iPad へ入れる」（契約への同意待ち）。
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

## mini から iPad へ入れる（2026-11-04 準備、契約への同意待ち）
Air を使わずに、QB Support と UW Support を mini で署名して入れるための `scripts/mini_install.py`。
- 署名: mini の Xcode に Apple ID は無いが、USMLE_qbank_web の `app/scripts/mini_signing.py` がチームの App Store Connect API キー（U7JT3699P2）で作った開発証明書（チーム 8WSQBQX6C5、2027-10-09 まで）が鍵束 `~/Library/Keychains/qbank-build.keychain-db` にある。これを使い回し、バンドルIDごとに `mini <バンドルID>` という開発プロファイルを API で作る。手動署名で `PROVISIONING_PROFILE_SPECIFIER=mini $(PRODUCT_BUNDLE_IDENTIFIER)` を渡すので、アプリと機能拡張がそれぞれのプロファイルを使う
- 同じチームとバンドルIDなので、Air で入れたアプリの上書きになり、App Group のデータは残る
- 使い方（PyJWT のある `/opt/anaconda3/bin/python3`）: `scripts/mini_install.py status`（読むだけ）、`setup`（足りないプロファイルを作って mini に置く。最初の1回）、`install [qb|uw]`（ビルドして入れる。省略で両方）
- UW Support は `../../USMLE_support/safari/gemini_api_key.txt`（gitignore）の Gemini キーを埋め込む。2026-11-04 に Air から mini へ置いた
- iPad はロックを外し、mini と同じネットワークに置く（devicectl は Bonjour で探すので Tailscale 越しには見えない）。mini は iPad とペアリング済み（`xcrun devicectl list devices` に「shinyのiPad」）
- 止まっている所: `setup` で App Store Connect API が `403 FORBIDDEN_ERROR.PLA_NOT_ACCEPTED` を返す。アカウント保持者が最新の Program License Agreement に同意するまで、プロファイルを作れない。同意は本人が https://developer.apple.com/account で行う。同意の後に `setup` と `install` を走らせる
- 確認済み: mini で両アプリとも署名なしのビルドは成功（UW Support は Gemini キー入り）。`build qb` はプロファイルが無いので署名で止まり、アプリと機能拡張がそれぞれ `mini com.shinyyama.qb-support` と `mini com.shinyyama.qb-support.extension` を探すことを確認した。署名と実機へのインストールは、プロファイルができるまで未確認

## 更新時
- 変更後は `npm run build:ext` → `./scripts/prepare-safari-extension.sh`
- 生成済みのXcodeプロジェクトにファイルを上書きするか、再変換してください
