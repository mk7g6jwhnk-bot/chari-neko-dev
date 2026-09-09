# Behavior state shadow evaluation report

## Decision

`DATA_NOT_ENOUGH`

The causal structure is promising enough to implement as an isolated shadow, but there is no valid outcome-comparison cohort with independently observed `LEAD_PRESSURE`, `ENERGY_STATE`, and `BANTE_RESPONSE`. The model therefore remains neutral and cannot demonstrate benefit.

## Data audit

Local rider DB audit:

| Metric | Count |
|---|---:|
| riders | 2,420 |
| existing `behaviorLayer` | 0 |
| existing `conditionalPerformanceLayer` | 0 |
| riders with rolling starts/back-count proxy | 2,378 |
| riders with top-two winning-method proxy | 2,244 |
| riders with direct tracking observation | 0 |
| riders with video-tagged source | 0 |

Read-only natural-seal audit at 2026-09-10 08:xx JST:

| Metric | Count |
|---|---:|
| `SCENARIO_PROVENANCE_V1` races | 83 |
| sealed participant rows | 601 |
| rows with behavior layer | 0 |
| rows with conditional-performance layer | 0 |
| confirmed results | 0 |

No historical record was mutated or backfilled.

## Pre-result distribution audit

Because all three required realized states are unknown, the new model returns multiplier 1 for every branch. Current and shadow distributions are therefore identical by design.

| Metric | Current Research | New State Model |
|---|---:|---:|
| scenario diversity mean | 2.795 | 2.795 |
| `LEADER_HOLD` mass | 12.13% | 12.13% |
| `BANTE_SASHI` mass | 20.03% | 20.03% |
| `MAKURI_SUCCESS` mass | 37.25% | 37.25% |
| `LEAD_BATTLE` mass | 29.56% | 29.56% |
| `LINE_SEPARATION` mass | 1.03% | 1.03% |
| initiative rider = first-candidate Top1 | N/A | N/A |

Initiative-rider identity was not present in the compact V1 seal payload for these records, so that correlation is not reconstructed or guessed.

## Outcome comparison

| Metric | Current Research | New State Model |
|---|---:|---:|
| exact mean rank | N/A | N/A |
| first mean rank | N/A | N/A |
| pair mean rank | N/A | N/A |
| third mean rank | N/A | N/A |
| Top10 / Top20 / Top30 | N/A | N/A |
| First Top1 / Top3 | N/A | N/A |
| Pair Top3 / Top5 | N/A | N/A |
| tail degradation | N/A | N/A |

Comparable outcome sample is 0. Reporting equal ranks from neutral multipliers would falsely imply validation, so the comparator marks such races non-comparable.

## Implementation

- `conditional-rider-performance-schema.mjs`: separate ability, behavior, and conditional-performance layers with evidence validation and strict UNKNOWN handling.
- `behavior-state-shadow.mjs`: feature extraction, independent state acceptance, conditional branch transition, terminal shadow reweighting, audit output, 403-502 guard, read-only streaming directory evaluator.
- `tests/behavior-state-shadow.mjs`: proxy/verified boundaries, zero-evidence rejection, UNKNOWN neutrality, conditional leader degradation, bante/makuri alternatives, source immutability, and final-test exclusion.

## Safety

- production prediction changed: NO
- production purchase changed: NO
- production UI changed: NO
- Research baseline changed: NO
- productionWriteAllowed: false
- autoPromotion: false
- historical seal/result/raw mutation: 0
- 403-502 evaluation/tuning use: NO
- result-derived state fill: NO
- UNKNOWN imputation: NO
- production deploy: NO

Selected regression results:

- behavior-state shadow: PASS
- research state-engine MVP: PASS
- node probability/convergence bridge: PASS
- scenario identity v3 shadow: PASS
- `keirin-parent-state-node-engine` and `keirin-node-condition-probability` currently fail because existing terminals have no `nodeTrace`; neither test nor its production modules are imported or changed by this research-only commit.

## Next collection gate

Do not create or promote a learned candidate yet. Collect at least 300 prospectively sealed races with independent action tags, including at least 60 observations for each critical rare state and 50 denominator events per conditional cell. Keep the state/transition code frozen while that cohort accumulates, and evaluate only after split assignment is sealed. Detailed required tags and source standards are in `behavior-state-model-design.md`.
