# Third-variant shadow comparison v1

Generated: 2026-09-09 JST

Mode: `SHADOW_PURCHASE_CANDIDATE_ONLY`

Production writes: disabled

## Rules

- `CONTROL`: sealed production standard plan, unchanged.
- `AMBIGUITY_ONE`: for purchase-eligible races only, rescue the highest-probability `THIRD_VARIANT_AMBIGUITY` row per 1-2 pair; maximum two rescues per race. A rescue is allowed only when MAIN/COVER can be inherited from an already-adopted row in the same branch or first family.
- `BOUNDARY_ONE`: identical guardrails, but only `THIRD_VARIANT_BOUNDARY` rows.
- `PAIR_TOP_ONE`: ambiguity and boundary rows together, with the same per-pair and per-race caps.

No rule reruns prediction, changes ranking, moves the natural boundary, changes purchase eligibility, or uses results when selecting a ticket.

## Production read-only sample

- Latest V2 predictions: 100 of 199 available records.
- Result-complete in latest 100: 8.
- Result-complete across all V2 records: 55.

Array fields below are documented as:

`[mean, median, p75, p90, max, 1, 2-3, 4-6, 7-10, 11+, 16+]`

| Rule | Ticket distribution | Changed races | Mean increase | p90 increase | Max increase |
|---|---|---:|---:|---:|---:|
| CONTROL | `[4.27,2,4,12,28,19,37,9,6,12,7]` | 0 | 0 | 0 | 0 |
| AMBIGUITY_ONE | `[4.81,2,4.25,14,30,12,41,9,6,15,8]` | 32 | 0.54 | 2 | 2 |
| BOUNDARY_ONE | `[4.58,2,4,14,30,19,37,9,4,14,8]` | 16 | 0.31 | 2 | 2 |
| PAIR_TOP_ONE | `[4.81,2,4.25,14,30,12,41,9,6,15,8]` | 32 | 0.54 | 2 | 2 |

No candidate adds more than two tickets to any race. `16+` rises from 7 to 8 at worst.

## All confirmed V2 results (55 races)

| Rule | Bet races | Correct third survived | Standard hits | Tickets | Investment | Return | Flat ROI |
|---|---:|---:|---:|---:|---:|---:|---:|
| CONTROL | 44 | 11 | 8 | 282 | 28,200 | 58,760 | 2.0837 |
| AMBIGUITY_ONE | 44 | 13 | 10 | 310 | 31,000 | 59,470 | 1.9184 |
| BOUNDARY_ONE | 44 | 11 | 8 | 301 | 30,100 | 58,760 | 1.9522 |
| PAIR_TOP_ONE | 44 | 13 | 10 | 310 | 31,000 | 59,470 | 1.9184 |

`AMBIGUITY_ONE` and `PAIR_TOP_ONE` improve correct-third survival by 2 races and standard hits by 2 races. Boundary-only adds tickets without a hit or survival improvement in this sample. ROI decreases because of the additional tickets, but does not collapse; ROI is supporting evidence only.

## Currently compressed races

The refreshed read found 12, rather than the earlier nine, purchase-eligible races with more than two natural-boundary candidates and one or two final tickets. Format:

`race: natural -> third -> standard (ambiguity removed / boundary removed); result`

- `20260909-48-11`: 4 -> 2 -> 2 (2 / 0); result pending
- `20260909-27-5`: 6 -> 1 -> 1 (5 / 0); result pending
- `20260909-48-10`: 3 -> 1 -> 1 (2 / 0); result pending
- `20260909-48-7`: 4 -> 2 -> 2 (2 / 0); result pending
- `20260909-21-10`: 9 -> 1 -> 1 (8 / 0); result pending
- `20260909-44-7`: 5 -> 1 -> 1 (4 / 0); result pending
- `20260909-74-3`: 3 -> 1 -> 1 (2 / 0); result pending
- `20260909-44-6`: 5 -> 2 -> 2 (3 / 0); result pending
- `20260909-21-5`: 3 -> 1 -> 1 (2 / 0); result pending
- `20260909-44-4`: 3 -> 1 -> 1 (2 / 0); result pending
- `20260908-27-4`: 3 -> 1 -> 1 (2 / 0); official `1-2-3`, rank 1, dropped by `THIRD_VARIANT_AMBIGUITY`
- `20260908-61-2`: 3 -> 1 -> 1 (2 / 0); official `1-3-2`, rank 3, lifecycle `ADOPTED`

All 12 are ambiguity-driven; none is boundary-driven. Each has room for at most two shadow rescues under the candidate cap.

## Classification

- `AMBIGUITY_ONE`: `PROMISING_BUT_MORE_DATA`
- `BOUNDARY_ONE`: `NO_BENEFIT`
- `PAIR_TOP_ONE`: `PROMISING_BUT_MORE_DATA`, but dominated by the simpler ambiguity-only rule in the observed sample.

Selected shadow candidate: `AMBIGUITY_ONE`.

Guardrails:

- correct-third survival improves: yes, 11 -> 13
- standard hits improve: yes, 8 -> 10
- median doubles: no, 2 -> 2
- p90 explosion: no, 12 -> 14
- max explosion: no, 28 -> 30
- 16+ rapid growth: no, 7 -> 8
- purchase gate changed: no
- MAIN/COVER invented without an existing class anchor: no
- flat ROI extreme deterioration: no; 2.0837 -> 1.9184

Status: `SHADOW_PURCHASE_CANDIDATE_ONLY`

`productionWriteAllowed: false`

`autoPromotion: false`
