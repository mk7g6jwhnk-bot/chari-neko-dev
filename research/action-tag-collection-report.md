# Action tag collection foundation report

## Decision

`PARTIAL_READY`

The Research-only collection pipeline is implemented and passes an end-to-end synthetic new-race flow. It is safe to begin prospective collection, but it is not fully operational because the current data has no video/telemetry action feed and the pipeline is deliberately not attached to the production collector. Automatic collection can create only weak proxy candidates from the currently saved official aggregates; most realized states still require independent manual review.

## Existing-source audit

Current saved evidence provides official pre-race lines, rider rolling result aggregates, home/back counts, winning-method aggregates, sealed prediction provenance, and official finish results. It does not provide timestamped positional sequences, lead duration, effort/cadence, bante actions, switching, or line gaps.

| State group | Best current classification |
|---|---|
| `INITIATIVE` | `WEAK_PROXY` from back frequency; direct acquisition is absent |
| `CLEAN_LEAD`, `CONTESTED_LEAD`, `LONG_LEAD` | `MANUAL_REVIEW_REQUIRED` |
| `RESERVED`, `NORMAL`, `DEPLETED` | `MANUAL_REVIEW_REQUIRED`; energy remains otherwise `UNOBSERVABLE` |
| all `BANTE_RESPONSE` values | `MANUAL_REVIEW_REQUIRED` |
| line tracking | `WEAK_PROXY`; `STRONG_PROXY` only if future checkpoint telemetry exists |
| `MAKURI_SUCCESS` | winning-method aggregate is `WEAK_PROXY`; race event requires direct tag/review |
| overtaken by makuri / line collapse | `MANUAL_REVIEW_REQUIRED` |

The detailed evidence, counter-evidence, and UNKNOWN rules are in `action-tag-observation-rules.md`.

## Implemented components

- `action-tag-schema.mjs`: immutable ACTION_TAG_V1 validation, evidence hashing, timing phase, final-test exclusion, training eligibility, and controlled verification transition.
- `action-tag-collector.mjs`: non-blocking bounded buffer, duplicate guard, historical/backfill rejection, AUTO_DIRECT/AUTO_CANDIDATE/MANUAL_REVIEW separation, and bounded drain.
- `action-tag-review-queue.mjs`: bounded pending-only queue, one-operation review decisions, memory store, and append-only streaming JSONL store.
- `action-tag-coverage.mjs`: race/state/cell targets, confirmed/supported/pending/UNKNOWN counts and progress.
- `tests/action-tag-collection.mjs`: complete new-race collection and review flow.

## E2E verification

The test uses one newly offered, non-final-test race with two riders:

1. collector accepts the race and rejects a duplicate;
2. one validated direct makuri event becomes `AUTO_DIRECT/CONFIRMED`;
3. two official back-frequency observations become `AUTO_CANDIDATE` and never auto-promote;
4. twelve state/rider items enter the manual queue;
5. a reviewer resolves one pending lead-pressure tag in one operation;
6. because that review is timestamped after result observation, it is automatically marked `POST_RESULT_OBSERVATION` and training-ineligible;
7. coverage reports one action-tagged race, state counts, pending count, UNKNOWN rate, and cell progress;
8. historical/backfill and comparison record 450 are rejected before processing.

No production service or historical record was used or mutated by this E2E test.

## Collector integration assessment

The collector adapter is ready to be called asynchronously after a future race record is saved. It must not be placed on the prediction request path. Default limits are 20 buffered races and five records per drain call; the review queue has a hard capacity and JSONL reading is line-streamed. A production hook was intentionally not added because this task forbids production writes and production behavior changes.

Operational activation still needs a Research-owned destination and scheduler/job outside the production prediction critical path. Until that authorization exists, invoke the collector only in an isolated Research process.

## Coverage starting point

- action-tagged real races: 0
- confirmed major-state examples: 0
- conditional cells at 50 examples: 0
- target: 300 races
- major-state target: 60 each
- conditional-cell target: 50 each

The synthetic E2E record is a test fixture and is not counted as research evidence.

## What remains blocked

- `CONTESTED_LEAD` and `LONG_LEAD`: no timestamped positional/video evidence.
- `ENERGY_STATE`: no validated effort/cadence protocol or telemetry.
- `SUPPORT_FRONT` and `SELF_LAUNCH`: no independently reviewed bante-action feed.
- `SWITCH`, `SEPARATED`, and line collapse: no checkpoint position sequence.
- race-specific `MAKURI_SUCCESS` / overtaken-by-makuri: aggregate method data cannot identify the event.
- continuous automatic operation: no authorized Research-only live storage/scheduler hook.

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
- production deploy: NO
