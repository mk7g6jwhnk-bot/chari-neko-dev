# Scenario-first purchase shadow v1

## Scope and safety

- Production `PURCHASE_PERFORMANCE_V2`: latest 100 records; all 199 V2 records used for the confirmed-result slice.
- Confirmed results: 55 races (44 purchase-eligible/bet races under the unchanged gate).
- Read-only Railway Console evaluation. No record, raw, seal, result, prediction, gate, natural-boundary, odds, budget, or production mutation.
- Candidate construction uses only sealed pre-result fields. Changing the attached result does not change any candidate plan (covered by test).
- Existing `AMBIGUITY_ONE` remains an independent shadow candidate. S3 only composes it without modifying it.

## Design

The current plan is terminal-first: terminal probability and lifecycle filters decide survivors before MAIN/COVER labels are observed. Consequently MAIN/COVER largely describes surviving terminals rather than first selecting coherent scenario families.

This shadow groups natural-boundary survivors by existing `dominantBranchId`, sums their pre-result terminal weights as a relative scenario mass (not a calibrated probability), selects scenario families, and only then selects terminals within each family.

- `CONTROL`: unchanged production standard plan.
- `S1`: highest-mass scenario as MAIN plus at most one alternate scenario as COVER.
- `S2`: MAIN plus at most two COVER scenarios, preferring a different first family when available.
- `S3`: S2 plus the independently defined `AMBIGUITY_ONE` rescue (max one per pair, max two per race).
- Concentration: HIGH when top1 mass >= 0.60 or top1/top2 gap >= 0.30; MEDIUM when top2 >= 0.70 or normalized entropy <= 0.72; otherwise LOW.
- HIGH retains one terminal per selected scenario; MEDIUM/LOW retain up to two. Purchase-ineligible races are never rescued.

## Production shadow observations

Concentration in the latest 100: HIGH 69, MEDIUM 6, LOW 25.

### Ticket distribution (latest 100)

| Plan | mean | median | p75 | p90 | max | 1 | 2-3 | 4-6 | 7-10 | 11-15 | 16+ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| CONTROL | 4.27 | 2 | 4 | 12 | 28 | 19 | 37 | 9 | 6 | 5 | 7 |
| S1 | 1.31 | 1 | 1 | 4 | 4 | 65 | 3 | 15 | 0 | 0 | 0 |
| S2 | 1.55 | 1 | 1 | 6 | 6 | 65 | 3 | 15 | 0 | 0 | 0 |
| S3 | 1.99 | 1 | 2 | 8 | 8 | 55 | 12 | 4 | 12 | 0 | 0 |

The remaining 17 records in each row have zero tickets because the unchanged purchase gate blocks them.

### Scenario diversity (latest 100, averages)

| Plan | scenarios | MAIN scenarios | COVER scenarios | first families | pairs |
|---|---:|---:|---:|---:|---:|
| CONTROL | 1.37 | 0.83 | 0.54 | 1.52 | 2.61 |
| S1 | 1.01 | 0.83 | 0.18 | 1.01 | 1.23 |
| S2 | 1.13 | 0.83 | 0.30 | 1.13 | 1.44 |
| S3 | 1.15 | 0.83 | 0.32 | 1.18 | 1.88 |

Although S1-S3 make MAIN/COVER labels mechanically scenario-coherent, the available scenario grouping collapses diversity instead of preserving it. The existing `dominantBranchId` is not sufficiently granular to support the intended design by itself.

### Confirmed-result comparison (all 55)

| Plan | correct generated | correct scenario selected | selected scenario but terminal dropped | exact hits | tickets | investment | return | ROI |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| CONTROL | 55 | 26 | 18 | 8 | 282 | 28,200 | 58,760 | 2.0837 |
| S1 | 55 | 22 | 17 | 5 | 78 | 7,800 | 8,910 | 1.1423 |
| S2 | 55 | 24 | 19 | 5 | 118 | 11,800 | 8,910 | 0.7551 |
| S3 | 55 | 24 | 19 | 5 | 118 | 11,800 | 8,910 | 0.7551 |

Amounts are 100-yen flat stakes. Generated correctness is unchanged by construction. S1-S3 fail the primary guardrails: correct-scenario survival and exact hits both decline. S3 adds no confirmed-slice hit over S2.

## Candidate decision

- S1: `NO_BENEFIT`
- S2: `NO_BENEFIT`
- S3: `NO_BENEFIT`
- Best overall: `CONTROL`
- Best shadow among S1-S3 on efficiency: S1, but it is not an acceptable candidate because exact hits fall from 8 to 5 and correct-scenario selection falls from 26 to 22.
- `SHADOW_SCENARIO_PURCHASE_CANDIDATE`: not saved; no proposal passes the guardrails.
- `productionWriteAllowed: false`
- `autoPromotion: false`

## Next research step

Do not tune thresholds on these 55 results. First audit whether a richer pre-result scenario identity can be derived from existing branch/initiative/attack/line-state fields, still without learning a new probability. Only then repeat the same sealed shadow evaluation on newly accumulated holdout data.
