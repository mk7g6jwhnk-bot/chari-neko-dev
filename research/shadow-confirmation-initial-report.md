# SHADOW CONFIRMATION FROM 234

- verdict: SHADOW_CONFIRMATION_STARTED
- exploration: 233R (hypothesis formation only)
- confirmation: 44R / 20260921-62-1 から
- target review: 300R
- protected final used: 0

## Readiness
- PAIR_DIRECTION: SHADOW_READY
- ELIGIBILITY: SHADOW_READY
- CLIFF: SHADOW_READY
- THIRD_CONDITIONAL: SHADOW_READY

## Fixed variants
| theme | variant | rule | R | hit | ROI | survival | avg / p90 tickets | status |
|---|---|---|---:|---:|---:|---:|---:|---|
| PAIR_DIRECTION | BASELINE | {"id":"BASELINE","blendWeight":0} | 44 | 3 | 23.5% | 1 | 3.66 / 6 | BASELINE |
| PAIR_DIRECTION | PAIR_WEAK | {"id":"PAIR_WEAK","blendWeight":0.1} | 44 | 4 | 37.2% | 1 | 3.66 / 6 | NEUTRAL |
| PAIR_DIRECTION | PAIR_MEDIUM | {"id":"PAIR_MEDIUM","blendWeight":0.2} | 44 | 4 | 37.2% | 1 | 3.66 / 6 | NEUTRAL |
| PAIR_DIRECTION | PAIR_STRONG | {"id":"PAIR_STRONG","blendWeight":0.3} | 44 | 6 | 48.9% | 1 | 3.66 / 6 | PROMISING |
| ELIGIBILITY | BASELINE | {"id":"BASELINE","budgetRatio":1} | 44 | 3 | 23.5% | 1 | 3.66 / 6 | BASELINE |
| ELIGIBILITY | ELIGIBILITY_RELAX_WEAK | {"id":"ELIGIBILITY_RELAX_WEAK","budgetRatio":1.1} | 44 | 3 | 23.5% | 1 | 3.66 / 6 | NEUTRAL |
| ELIGIBILITY | ELIGIBILITY_RELAX_MEDIUM | {"id":"ELIGIBILITY_RELAX_MEDIUM","budgetRatio":1.2} | 44 | 4 | 30.9% | 1 | 4.48 / 8 | WEAK |
| CLIFF | BASELINE | {"id":"BASELINE","method":"PRODUCTION_SAVED"} | 44 | 3 | 23.5% | 1 | 3.66 / 6 | BASELINE |
| CLIFF | CLIFF_MAX_GAP | {"id":"CLIFF_MAX_GAP","method":"MAX_ADJACENT_GAP"} | 44 | 2 | 12.1% | 1 | 3.34 / 10 | WEAK |
| CLIFF | CLIFF_GAP_SEPARATION | {"id":"CLIFF_GAP_SEPARATION","method":"GAP_PLUS_LOWER_GROUP_SEPARATION"} | 44 | 2 | 11.6% | 1 | 3.50 / 10 | WEAK |
| CLIFF | CLIFF_PLATEAU_SLOPE | {"id":"CLIFF_PLATEAU_SLOPE","method":"PLATEAU_END_PLUS_SLOPE_CHANGE"} | 44 | 3 | 39.2% | 1 | 1.91 / 4 | NEUTRAL |
| THIRD_CONDITIONAL | BASELINE | {"id":"BASELINE","blendWeight":0} | 44 | 3 | 23.5% | 1 | 3.66 / 6 | BASELINE |
| THIRD_CONDITIONAL | THIRD_WEAK | {"id":"THIRD_WEAK","blendWeight":0.1} | 44 | 4 | 37.2% | 1 | 3.66 / 6 | NEUTRAL |
| THIRD_CONDITIONAL | THIRD_MEDIUM | {"id":"THIRD_MEDIUM","blendWeight":0.2} | 44 | 4 | 37.2% | 1 | 3.66 / 6 | NEUTRAL |
| THIRD_CONDITIONAL | THIRD_STRONG | {"id":"THIRD_STRONG","blendWeight":0.3} | 44 | 4 | 37.2% | 1 | 3.66 / 6 | NEUTRAL |

## Integrity
- source rows / exclusions: 44 / 0
- prediction / purchase / result mismatch: 0 / 0 / 0
- checkpoint hash before / after equal: YES
- production prediction / purchase / recommendation / THICK changed: NO
- production cliff implemented: NO
- historical mutation: 0
- protected final used: 0
- result leakage: 0
- auto tuning / auto promotion: 0
