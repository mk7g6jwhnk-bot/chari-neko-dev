# おすすめ選別・THICK評価基盤（read-only）

## 結論

**EVAL_DATA_INSUFFICIENT**。評価コード・漏洩防止dataset・KPI・candidate対照群・THICK/cliff診断を再現可能にした。ただし、安全にmembershipを証明できる既存データは303〜402 validationと一致する22Rだけで、50R未満である。正式おすすめ、閾値探索、THICK変更、pair-support tuningは行っていない。

## cohortとデータフロー

- `AUDIT_TRAIN_LIKE`: 今回の保存資料から安全に確定できるraceは0R。
- `HELD_OUT`: 303〜402 allowlistと一致し、確定resultを持つ22R。
- `PROTECTED_FINAL`: 0Rを読み込み・評価。403〜502は利用していない。
- membership不明の確定92Rは、protected finalとの重複を否定できないため除外。
- pre-result列は保存済みdiagnosticだけから作り、resultはラベル・払戻集計にだけ結合する。
- threshold search、weight調整、feature選定は0。

dataset schemaはraceKey、cohort、confidence、scenario concentration、purchaseability、ticket count、warning、quality、cliff、canonical MAIN/COVER/THICK、predictive/purchase support、exact hit、investment、return、高払戻flagを保持する。保存資料にoddsがない48ticketは`UNKNOWN`で、推測補完しない。

## KPI

### 信頼度別

| band | R | 購入可R | hit | hit率 | 投資 | 払戻 | ROI | 平均点数 | 最大連敗 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| HIGH | 4 | 4 | 0 | 0.0% | 1,500 | 0 | 0.0% | 3.75 | 4 |
| MEDIUM | 0 | 0 | 0 | — | 0 | 0 | — | — | 0 |
| LOW | 18 | 14 | 2 | 14.3% | 3,300 | 5,980 | 181.2% | 2.36 | 7 |

高信頼ほど良い単調性は確認できない。HIGHは4R、LOWの払戻は2件だけなので一般化禁止。

### 展開集中度別

| concentration | R | 購入可R | hit率 | ROI | 平均点数 | 購入可率 |
|---|---:|---:|---:|---:|---:|---:|
| HIGH | 15 | 15 | 6.7% | 30.2% | 2.73 | 100% |
| MEDIUM | 1 | 1 | 0.0% | 0.0% | 2.00 | 100% |
| LOW | 6 | 2 | 50.0% | 948.0% | 2.50 | 33.3% |

LOWの数値は1的中（4,740円）に支配される。信頼度と集中度は別軸で集計した。

### purchaseability別

| state | R | 実購入R | hit率 | ROI | 平均点数 |
|---|---:|---:|---:|---:|---:|
| PURCHASEABLE（警告なし） | 4 | 4 | 0.0% | 0.0% | 3.75 |
| WARNING | 14 | 14 | 14.3% | 181.2% | 2.36 |
| INELIGIBLE | 4 | 0 | — | — | — |

購入不可は投資・払戻を0とし、reference hitをpurchase hitへ混入させない。

## diagnostic groups

既存区分だけを組み合わせ、正式判定・新thresholdにはしない。記述上のbestは`LOW_TICKET_COUNT_PURCHASEABLE`だが、小標本かつ同じ2的中の再表現であり採用根拠ではない。おすすめ選別の有用性は **NO（証拠不足）** とする。

## THICK

- THICKあり: 13R / 13ticket
- THICK hit: 1ticket、hit率7.69%、投資1,300円、払戻4,740円、ROI364.62%
- MAIN THICK: 同上。COVER THICKは保存された限定datasetに0件。
- non-THICK: 35ticket、1hit、hit率2.86%、投資3,500円、払戻1,240円、ROI35.43%
- 同一評価race内でもTHICK優位に見えるが、各群1hitで増額価値は判定不能。

## cliff

- clear cliff: 13R
- THICKあり・no cliff: 0R
- THICKなし・clear cliff候補: 0R

これは現行保存境界の診断であり、cliff thresholdを変更・最適化した結果ではない。

## 将来の穴・大穴基盤

`oddsBand / predictiveSupport / purchaseSupport / highPayout / warning / confidence`を分離して保持するschemaを実装した。odds欠損は`UNKNOWN`で、高配当結果だけから穴分類しない。新しいsealed dataでoddsが保存されれば同じ集計器へ投入可能。

## 安全性

- prediction hash mismatch: 0（productionコード変更なし）
- purchase hash mismatch: 0（productionコード変更なし）
- production changed: NO
- Research meaning changed: NO
- historical mutation: 0
- protected final used: NO
- recommendation / THICK threshold changed: NO
- pair-support tuning: NO

## 成果物と次段階

- `research/recommendation-thick-evaluation.mjs`: dataset生成・KPI・candidate対照・THICK/cliff集計
- `tests/recommendation-thick-evaluation.mjs`: cohort遮断、非破壊、KPI、cliff、安全flag回帰
- 本report

50R action-tag到達後は、事前に固定した同じschema・group定義で新規50Rを追加し、欠損率とsample数を確認してからsignalの再評価へ進む。今回の22R結果からthresholdを作らない。
