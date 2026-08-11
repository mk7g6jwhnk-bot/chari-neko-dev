# v107 着順段階別 学習・確率校正
- 失敗を1着候補 / 2着枝 / 3着終端 / 購入採否へ分解。
- FIRST、SECOND|FIRST、THIRD|FIRST-SECONDを別々に確率校正。
- 各段階でBrier Score、Log Loss、10%刻みの予測確率と実現率を保存。
- 本番予想ロジックへの自動反映は禁止。
