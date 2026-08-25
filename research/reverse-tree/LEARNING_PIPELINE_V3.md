チャリ猫 学習パイプライン v3

これで「学習ロジック」だけでなく、結果保存データ→学習までを一本化。

対象:
- JSON / JSONL の結果保存データを再帰的に読み込む
- VERIFIED済み結果だけ学習
- 未予想レースも resultLearning の対象
- 予想済みレースは predictionErrorLearning も実行
- research/learning/learning-latest.json に集計を出力

環境変数:
CHARI_NEKO_LEARNING_INPUT
CHARI_NEKO_LEARNING_OUTPUT

実行:
node research/reverse-tree/engine/run-learning.mjs

注意:
これは「定期実行サービス」そのものではない。
既存の結果取得・保存処理から、このrunnerを定期実行すれば自動学習になる。
本番予想パラメータへの自動反映はしない。
