# Scenario identity v2 research audit

## Decision

`SCENARIO-IDENTITY-V2: REJECT`

The deterministic classifier is implemented and result-leakage tested, but the persisted historical cohort does not retain enough branch/line provenance to reconstruct a useful identity. Applying it would fragment races into many unknown-bearing combinations, so it must not be connected to purchase logic.

## Field audit

| Field | Source-time classification | Historical-seal finding | Use |
|---|---|---|---|
| `dominantBranchId` | AVAILABLE | absent in the accessible legacy terminal cohort | current comparison only when present |
| branch type/family | AVAILABLE | PARTIAL | allowed |
| `primaryLineId` / initiative family | AVAILABLE | PARTIAL | allowed |
| attack outcome | AVAILABLE | PARTIAL | allowed |
| first family | AVAILABLE | PARTIAL | allowed |
| line role | PARTIAL | PARTIAL | allowed with UNKNOWN |
| same-line relation | PARTIAL | PARTIAL | allowed with UNKNOWN |
| line persistence | PARTIAL | PARTIAL | derived only from pre-race official line structure |
| second role family | PARTIAL | PARTIAL | allowed with UNKNOWN |
| research INITIATIVE / ATTACK_OUTCOME / LINE_TRACKING / OTHER_LINE_SURVIVAL | PARTIAL | not consistently sealed | not required by v2 classifier |
| FOURTH_CORNER_POSITION | PARTIAL | research-state-derived, not observed result | excluded from v2 classifier |
| finish result / payout | RESULT_DERIVED | available only after race | prohibited from identity generation |

## Schema

The low-freedom key is:

`attack/branch type + initiative line family + first line family + first-second line-persistence relation + second role family`

The third rider and all result/payout fields are excluded. Supported branch semantics are `LEADER_HOLD`, `BANTE_SASHI`, `MAKURI_SUCCESS`, `LEAD_BATTLE`, `LINE_SEPARATION`, and `SOLO_RISE`. Missing provenance remains `UNKNOWN`; it is never guessed.

## Read-only historical evaluation

The currently accessible Railway Volume contained 58 sealed records with usable terminal ledgers, not 100. Of these, 34 had a confirmed result whose exact terminal was generated. No Volume content was changed.

| Metric | dominantBranchId grouping | SCENARIO-IDENTITY-V2 |
|---|---:|---:|
| mean scenarios/race | 1.00 | 20.93 |
| median | 1 | 23 |
| p90 | 1 | 24 |
| mean terminals/scenario | 230.28 | 11.00 |
| mean first families/scenario | 7.14 | 1.02 |
| mean pairs/scenario | 44.07 | 2.11 |
| singleton scenario rate | 0% | 0% (duplicate rows keep group size above one) |
| UNKNOWN-bearing scenario rate | 100% | 100% |

This cohort is unsuitable for a fair identity-v2 validation: the current key collapses to unresolved, while the new composite splits on incomplete fallback fields. The 2–6 meaningful-scenario guardrail is violated by two orders of magnitude.

Concentration under the candidate identity: HIGH 0, MEDIUM 0, LOW 58. The earlier HIGH-heavy distribution is therefore partly identity-sensitive, but this opposite extreme is missing-provenance fragmentation, not a genuine improvement.

Confirmed/generated 34 result-only evaluation for the rejected candidate: Top1 4 (11.8%), Top2 6 (17.6%), Top3 9 (26.5%). Results were read only after deterministic grouping and were not used to change the schema or thresholds.

## Twenty readable race checks

The scenario counts themselves demonstrate that the generated labels are not human-meaningful purchase scenarios in this cohort:

| Race | scenarios | Race | scenarios |
|---|---:|---|---:|
| 20260829-37-2 | 23 | 20260828-56-7 | 23 |
| 20260828-56-6 | 20 | 20260828-73-6 | 15 |
| 20260828-56-5 | 20 | 20260828-73-5 | 23 |
| 20260828-56-3 | 21 | 20260828-73-3 | 18 |
| 20260828-56-2 | 7 | 20260828-81-11 | 23 |
| 20260828-61-10 | 23 | 20260828-81-10 | 23 |
| 20260828-81-9 | 20 | 20260828-61-7 | 23 |
| 20260828-81-7 | 20 | 20260828-61-6 | 23 |
| 20260828-61-5 | 23 | 20260828-81-5 | 18 |
| 20260828-61-4 | 23 | 20260828-61-4 | 23 |

The repeated final race key reflects two existing lifecycle entries, not a generated or mutated record. Labels are mechanically explainable when all inputs exist, but the stored sample cannot distinguish MAIN/COVER/collapse scenarios reliably. Purchase suitability: `NOT_READY`.

## Safety and next step

- mode: `RESEARCH_ONLY`
- purchase connected: NO
- productionWriteAllowed: false
- autoPromotion: false
- result leakage: 0
- prediction/purchase/third-variant/Research ranking: unchanged

Next step is `scenario model redesign`, specifically preserving a compact pre-result scenario provenance tuple at seal time for future data. Do not backfill it from results and do not tune this identity against the 34 outcomes.
