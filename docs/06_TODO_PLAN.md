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

## Debug Notes
- A: `[QB_SUPPORT][inject]` が出ない → content script 未注入
- B: `[QB_SUPPORT][nav]/[submit]/[reveal]` の target が `null` → DOM取得失敗
- C: クリックログが出るが反応しない → サイト側イベント要件
- D: Chatが無応答 → APIキー未設定 or background未動作

## Next
- iPad Safariでの動作検証（Xcodeビルドと実機確認）
- セレクタのフォールバック追加（別モード/別DOM）
- チャット履歴のUX調整（質問切替時の扱い）
- OpenAIモデル選択/エラー表示の改善
- 単体テスト雛形（coreのDOM抽出）
