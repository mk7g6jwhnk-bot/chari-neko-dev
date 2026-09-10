# Action-tag auto-observation report

## Decision

`PARTIAL_AUTO_READY`

The Research-only observer, review prioritizer, coverage forecast, and fail-open collector adapter are implemented and pass E2E. Official race-level winning methods can directly confirm only `INITIATIVE/ACQUIRED` for an official escape winner and `ATTACK_OUTCOME/MAKURI_SUCCESS` for an official makuri winner. Structural combinations can create unverified strong candidates for initiative, long lead, and successful line tracking. Energy and bante intent remain manual because the saved sources contain no effort or action sequence.

## Source audit

The repository source contract exposes official pre-race line membership/position, rider rolling H/B, rolling top-two winning-method shares, official result winning method, official S/B markers, finish order, incidents, and existing Research states. It does not expose timestamped position sequences, lead duration, cadence/power, line gaps, blocks, switches, or bante launch timing.

The local rider DB contains 2,420 riders: 2,378 (98.26%) have rolling starts and H/B, and 2,244 (92.73%) have an observed top-two winning-method distribution. It has no race-event action sequence. The latest fixed natural-seal audit contains 83 races, but zero had a confirmed result at cutoff; consequently its directly observed action-state rate is 0%. The raw Railway export was intentionally not retained, so it was not reused or backfilled in this implementation.

| State | Best automatic class | Rule / boundary |
|---|---|---|
| `INITIATIVE` | `AUTO_DIRECT` for official escape winner; otherwise `STRONG_PROXY` | candidate needs at least two of official B marker, line head, rolling B rate, escape share |
| `CLEAN_LEAD` | `MANUAL_ONLY` | no uncontested positional sequence |
| `CONTESTED_LEAD` | `MANUAL_ONLY` | finish order cannot establish a battle |
| `LONG_LEAD` | `STRONG_PROXY` | official escape plus B marker and line-head agreement; never verified automatically |
| `RESERVED`, `NORMAL`, `DEPLETED` | `UNOBSERVABLE` / `MANUAL_ONLY` | no effort telemetry; failure is not depletion |
| `SUPPORT_FRONT`, `HOLD_POSITION`, `SELF_LAUNCH`, `SWITCH`, `SEPARATED` | `MANUAL_ONLY` | result and position alone cannot establish bante intent/action |
| `LINE_TRACKING_SUCCESS` | `STRONG_PROXY` | line structure + mark share + adjacent official finishes |
| `LINE_TRACKING_FAILURE` | `MANUAL_ONLY` | bante finish failure is insufficient |
| `MAKURI_SUCCESS` | `AUTO_DIRECT` | official winning method must explicitly be makuri |
| `MAKURI_FAILED` | `MANUAL_ONLY` | attempt is not recorded by finish order |
| overtaken-by-makuri | `MANUAL_ONLY` | official winner method does not identify the attacked leader safely |
| `LINE_COLLAPSE` | `WEAK_PROXY` at most, kept manual | separated finishes do not prove collapse |
| `OTHER_LINE_SURVIVAL` | `WEAK_PROXY` at most, kept manual | outcome does not prove the development path |

No automatic rule emits `DEPLETED`, `SELF_LAUNCH`, `SWITCH`, `LINE_TRACKING/FAILURE`, `MAKURI_FAILED`, `OVERTAKEN_BY_MAKURI`, `COLLAPSED`, or other-line survival from finish order.

## Implementation

- `action-tag-auto-observer.mjs` normalizes the existing payload variants, hashes evidence, requires independent evidence agreement, and deduplicates race/rider/state/value observations.
- `action-tag-review-priority.mjs` collapses race/rider/state duplicates, ranks high-impact and under-covered states/cells first, then caps each race.
- `action-tag-coverage-forecast.mjs` projects races needed from observed automatic rates and returns `null` for states that automatic evidence cannot fill.
- `action-tag-collector-adapter.mjs` is fail-open, asynchronous, bounded by the underlying collector, guarded by a heap ceiling, and reports errors without blocking the production caller.
- ACTION_TAG_V1 now carries optional line role/size/position, finish position, evidence count, and conditional-cell context. It adds `MAKURI_FAILED` and `OTHER_LINE_SURVIVAL` values without changing any production seal.
- The collector has a 12-item default manual cap, semantic deduplication, bounded seen-race checkpoint/restart support, and no production hook or deployment.

## Conditional-performance readiness

The added context is sufficient to aggregate future initiative 1/2/3, two-/three-rider-line survival, bante, line-tracking, and switch cells once independently observed tags exist. `finishPosition`, `linePosition`, `lineSize`, `role`, `conditionalCells`, observation phase, and verification state stay separate. A post-result tag is still training-ineligible by default, preventing reverse flow into pre-result features.

## E2E and load metrics

The allowed synthetic/non-final E2E uses three races and nine rider appearances: one official escape, one official makuri, and one pre-result-only race. It produced 10 automatic observations: 2 direct and 8 strong proxy, or 3.33 automatic tags/race and 1.11/rider. Accuracy was not evaluated.

With the default 12 manual items/race cap, the same three-race workload yields 36 manual items. Across 46 actionable/queued observations this is:

- DIRECT: 4.35%
- STRONG_PROXY: 17.39%
- WEAK_PROXY: 0% (weak evidence remains manual/UNKNOWN rather than creating low-value candidates)
- manual review: 78.26%
- automatic observation: 21.74%

The high manual share is intentional and materially lower than the uncapped 7 states × every rider expansion. In the focused restart E2E, a pre-result race generated 2 automatic candidates, admitted 4 manual items under a test cap, deferred 17, rejected a replay after restoring the checkpoint, and allowed the caller to continue under the memory guard.

## Coverage forecast

The tiny E2E rates are pipeline-capacity demonstrations, not population estimates or tuning evidence. If those rates held, 60 observations would require roughly 30 races for initiative, 180 for long-lead pressure, 90 for line tracking, and 180 for attack outcome. Example 50-cell forecasts range from 25 races for line-leader initiative to 150 for long-lead/attack cells. Independently, the 300 tagged-race gate always requires 300 prospective races (297 after the three synthetic flow records, which do not count as real Research evidence).

`ENERGY_STATE`, `BANTE_RESPONSE`, `LINE_STATE`, `OTHER_LINE_SURVIVAL`, contested/clean lead, failed makuri, and switching have no defensible automatic rate, so their automatic races-needed estimate is `N/A`; manual/video/telemetry evidence is required. The real evidence baseline remains zero because synthetic rows are not Research evidence.

## Collector connection decision

The adapter is ready to be called after a future race save from an isolated Research-owned process. It is not imported by production code and is not deployed. Enabling continuous collection still requires a separately authorized Research destination and scheduler. A collector exception, full bounded queue, or heap guard never fails the prediction collector.

## Safety

- production prediction changed: NO
- production purchase changed: NO
- production UI changed: NO
- Research baseline changed: NO
- historical mutation: 0
- 403-502 tuning use: NO
- UNKNOWN imputation: NO
- production write: 0
- AUTO_CANDIDATE auto-promotion: NO
- accuracy/rule tuning from E2E: NO
- production deploy: NO
