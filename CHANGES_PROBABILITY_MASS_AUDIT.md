# v125 確率質量監査

終端確率・段階確率を校正指標へ使う前に、確率質量を明示監査。

- terminalMassTotal を保存
- 1.0から±0.02超なら INVALID_TOTAL_MASS
- 無効/負の終端確率も異常
- stage calibrationにMASS_VERIFIED / MASS_INVALID / MASS_PARTLY_UNVERIFIEDを追加
- FIRST family probabilityの1.0へのsilent clampを廃止
- calibrationSamplesはraw probabilityを保持し probabilityValid を記録
- Brier / LogLossは診断値のまま。質量異常があれば校正済み確率とは扱わない
