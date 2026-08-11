# v136 全着順再評価監査

2026-08-10の外れ方検証を反映。

- FIRST成立後、1着本人以外の全選手をSECONDへ再投入し独立再評価
- 1-2着成立後、残り全選手をTHIRDへ再投入し独立再評価
- SECOND_REEVALUATION_COVERAGE_MISS
- THIRD_REEVALUATION_COVERAGE_MISS
- 別線の番手・三番手を3着候補集合から削らない mixed-line coverage audit
- 同ラインのLEADER_HOLD / BANTE_SASHIを頭折り返しの同一主シナリオとして接続
- priorityの自然tierは保持しつつ sameScenarioMainSibling でMAINシナリオ支持へ接続
- 中央ルール監査はdecisionRatioの存在確認ではなく実coverage auditを参照

終端生成段階で「同ライン自然収束を優先」しても「別線後位を候補から削る」ことを禁止する。
