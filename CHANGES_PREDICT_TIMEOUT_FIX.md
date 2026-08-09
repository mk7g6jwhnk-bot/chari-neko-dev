# v46 predict timeout fix

新規予想で `公式予想データ取得が時間内に完了しませんでした` が出る問題を修正。

原因は Netlify の `keirin-predict` が Railway の完全予想APIを12秒で中断していたこと。
Railway側ではChromiumによる公式R確認と公式プロフィール取得を行うため、正常処理でも12秒を超えることがある。

変更:
- upstream timeout: 12,000ms -> 50,000ms
- 自動更新の無限ループ防止はv45のまま維持
- 予想ロジック変更なし
