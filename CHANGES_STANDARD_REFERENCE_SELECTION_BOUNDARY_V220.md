# v220 Standard / Reference Selection Boundary

- Prediction engine boundary from v219 is unchanged.
- Purchase engine now exposes `standardPurchasePlan` and `referencePurchasePlan` separately.
- `purchasePlan` remains only as a backward-compatible aggregate output.
- New saved snapshots store standard purchases in `betSelections` and references in `referenceBetSelections`.
- `standardBetCount` and `referenceBetCount` are persisted separately.
- Legacy saved snapshots are normalized on read by moving `category=REFERENCE` rows out of standard selections.
- REFERENCE rows are excluded from purchase funding, standard bet counts, composite odds, and purchased hit/miss matching.
- UI summary shows `標準買い目 N点` and, when present, `参考買い目 M点` separately.
- Reference rows show `参考・資金配分対象外`.
- Storage compaction preserves reference selections separately.
- Dedicated regression confirms a matching REFERENCE order is still a standard purchase miss.

Version: `KEIRIN-0.17.1-standard-reference-selection-boundary`
