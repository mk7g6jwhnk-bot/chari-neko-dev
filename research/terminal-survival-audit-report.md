# 正解terminal生存・脱落監査

Verdict: `TERMINAL_SURVIVAL_AUDIT_READY_WITH_LIMITS`

既存の `PREDICTION_DISTANCE_DIAGNOSIS_V1` が保存するprediction terminal、purchase decision trace、purchase seal、確定結果を読み取り専用で再利用した。meaningful・purchase candidateの定義、MAIN/COVER/THICK分類、予想・購入ロジックは変更していない。

## 最新daily（2026-09-20、37R）

- GENERATED: 37/37（100.0%）
- MEANINGFUL: 15/37（40.5%）
- PURCHASE_CANDIDATE: 15/37（40.5%）
- FINAL_PURCHASE / exact hit: 3/37（8.1%）
- drop stage: meaningful 22 / purchase candidate 0 / final purchase 6 / purchase ineligible 6 / exact hit 3 / unknown 0
- primary drop reason: pair direction or rank 20 / third conditional 2 / terminal relative rank 0 / cliff boundary 0 / purchase compression 6 / purchase ineligible 6 / unknown 0
- 最終買い目rider coverage: 37RすべてUNKNOWN（旧日次artifactに最終ticket集合が保存されていないため）

旧日次summaryではpurchase ineligibleが10Rだが、race単位のdiagnosisに直接保存されているのは6Rである。残る4Rのrace keyは推測せず、部分復元の制約として保持する。

## 累積（187R）

- 完全復元: 100R
- 部分復元: 37R
- trace不足で復元不能: 50R
- GENERATED / MEANINGFUL / PURCHASE_CANDIDATE / FINAL_PURCHASE: 137 / 57 / 57 / 10
- drop stage: meaningful 77 / purchase candidate 0 / final purchase 22 / purchase ineligible 28 / exact hit 10 / unknown 50
- primary drop reason: pair direction or rank 63 / third conditional 14 / terminal relative rank 0 / cliff boundary 0 / purchase compression 22 / purchase ineligible 28 / unknown 50
- final rider coverage P3 / P2 / P1 / P0 / UNKNOWN: 28 / 37 / 12 / 23 / 87
- exact pair final / reverse pair final / reverse only: 17 / 17 / 11
- trio meaningful / purchase-derived trio hit / trifecta miss + trio hit: 51 / 16 / 9

## 統合と安全性

- daily outputへ `terminal-survival.json`、CSV列、Markdown要約を追加
- checkpointには今後の累積summaryのみを追加し、既存checkpointは変更しない
- public statusはrace key、hash、個票を含まないcompact summaryだけを公開
- Validation Statusに折り畳み表示を追加し、内部候補Pと最終買い目coverageを明示的に分離
- 390px viewport: horizontal overflow 0、JavaScript error 0
- dry-run: 一時directoryで出力成功、checkpoint更新0
- protected final使用0、result-aware regeneration 0、historical mutation 0
- prediction/purchase/recommendation/THICK/ticket cap/threshold/weight/cliff変更0

制約は、50Rに保存traceがなく全項目UNKNOWNであることと、旧日次37Rに最終ticket集合がなくfinal rider coverageを復元できないことである。今後の日次では原sourceから全項目を保存する。
