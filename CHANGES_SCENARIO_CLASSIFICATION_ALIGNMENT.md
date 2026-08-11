# v157 Scenario Classification Alignment

- v156 の SECOND_PAIR_BREADTH_RECOVERY が一律 COVER 固定だった分類バグを修正。
- 復元経路ではなく、展開由来と自然収束条件で MAIN / COVER を決定。
- 主展開の直接支持 + MAIN自然基準を満たす復元終端は MAIN を維持。
- 主展開内の枝違い、または承認済み有力枝は COVER。
- SUB / risk の BUYABLE_HIGH は従来の実オッズ・妙味ゲートを維持。
- 復元監査に betClass / classificationReason を記録。
