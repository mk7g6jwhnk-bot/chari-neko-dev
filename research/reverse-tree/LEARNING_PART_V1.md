チャリ猫 学習パート v1

追加:
research/reverse-tree/engine/learning.mjs

目的:
1. 結果だけを見て後付けで予想を改変しない。
2. predictionSeal済み + VERIFIED済みのレースだけ学習対象にする。
3. 展開仮説・ノード・テンプレート・ノード列パターン単位で結果を集計する。
4. 研究統計を出すだけで、本番エンジンへ自動反映しない。

学習対象外:
- prediction sealなし
- VERIFIED/RESULT_VERIFIED以外
- 確定着順不足
- reverseTreeなし

次段階:
この学習統計を、既存の結果検証パイプラインから自動投入できるアダプタへ接続する。
