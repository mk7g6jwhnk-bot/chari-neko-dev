# Manual Review V2 実装報告

- verdict: `MANUAL_REVIEW_V2_READY_WITH_LIMITS`
- manual review version: `MANUAL_REVIEW_V2` / `manualReviewVersion: 2`
- V1: `reviews/` とV1 schemaを変更せず保持。V2は `reviews-v2/` に排他的appendで保存し、自動変換しない。
- V2: 最終バック先頭、先頭交代、長く先頭を走った選手と失速、最終バック先頭選手の失速、番手と動き、ライン状態、別線の勝負圏残存、判断困難点を観測事実として保存。
- 条件分岐: Q3が「いる」の場合だけQ4、Q6が選手指定の場合だけQ7、Q9が「いる」の場合だけ複数選手選択を表示。
- ガールズ: L級/girls判定を再利用し、番手・ラインのQ6〜Q8を生成しない。V2 recordにも `mode: GIRLS` を保存。
- safety: `productionEligible: false`、`researchLane: SHADOW_ONLY`。prediction/purchaseへの接続なし。historical mutation 0。

## Priority 1 regression audit

既存6 FAILはすべて `STALE_TEST_ONLY`。現行canonical実装はbranchをtierではなく同一のhypothesis poolとして扱い、oddsを購入選別に使用しない。失敗テストが廃止済みのadaptive tier、BUYABLE_HIGH、旧ガールズlabelを期待していたため、productionコードを変えず現在の契約へ更新した。

- branch prior: stale main selection mode
- global main branches: stale branch priority
- adaptive main cluster: removed compatibility export
- buyable high odds gate: stale odds selection contract
- tier payout class: stale tier-specific payout label
- girls dynamic branches: stale girls branch IDs/labels

29テストを実行し、FAIL 0。prediction flow、purchase flow、girls、action-tag V1、Manual Review V2を含む。

## Remaining limitations

- V2回答はResearch shadow recordとして収集するだけで、action-tagやproduction重みへ変換しない。
- V2の進捗集計は未実装。既存status表示の確認済み件数はV1 coverage由来。
- UI検証はfixture/API/静的responsive検査で、実機iPhone確認は未実施。
