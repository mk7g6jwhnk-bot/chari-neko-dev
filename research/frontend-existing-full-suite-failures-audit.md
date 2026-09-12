# Frontend existing full-suite failures audit

Date: 2026-09-12  
Base: `9594194`  
Verdict: `FULL_SUITE_CLEAN`

## Scope and result

The package full suite reproduced six failing files belonging to the same five previously reported failure families. After auditing production intent and history, all five were stale tests from 2026-08-09 through 2026-08-12 that predated the canonical hypothesis-pool rewrite in `65d2138` (2026-08-25). No production module, fixture data file, UI, prediction logic, purchase selection, Research path, or historical record was changed.

| Family | Test file(s) | Previous expected | Actual canonical behavior | Classification | Resolution |
|---|---|---|---|---|---|
| Branch selection mode | `tests/keirin-branch-prior-audit.mjs` | `INITIATIVE_LINE_FIRST_THEN_OUTCOME_BRANCH` | `HIERARCHICAL_NATURAL_TIERS` audit mode | E: branch specification follow-up omitted | Assert current audit contract and membership integrity |
| Global/adaptive main branch tiers | `tests/keirin-global-main-branches.mjs`, `tests/keirin-adaptive-main-cluster.mjs` | generator exports/assigns `main`, `contender`, `sub` | generator returns normalized deterministic `hypothesis` pool; purchase must not use generator tier | B/E: stale expectation and removed compatibility API | Assert hypothesis completeness, normalization and determinism |
| BUYABLE_HIGH odds gate | `tests/keirin-buyable-high-odds-gate.mjs` | odds promote a rejected sub terminal to purchased `BUYABLE_HIGH` | odds annotate payout potential but never alter selection | B: stale purchase expectation | Assert identical selection with/without odds and retained rejection reason |
| Tier-specific payout labels | `tests/keirin-tier-consistent-payout-class.mjs` | `本線高配当` / `有力展開高配当`; odds can create `BUYABLE_HIGH` | canonical label is the neutral attribute `高配当候補`; selection remains MAIN/COVER/NONE | F/B: old UI label and purchase expectation | Assert canonical attribute independently from purchase class |
| Girls dynamic branches | `tests/keirin-girls-dynamic-branches.mjs` | invent `GIRLS-LEAD-*` and makuri branches without official line evidence | retain only the evidence-safe `BATTLE` hypothesis when official lines are absent | E/C: legacy branch fixture expectation | Assert no synthetic lead/makuri branch, complete candidates and normalized mass |

All failure stacks pointed directly at the assertions/imports listed above. The production modules involved were `keirin/sports/keirin-branches.mjs`, `keirin/engine/engine-support.mjs`, and `keirin/engine/purchase.mjs`. The tests had no explicit fixture/schema version; their effective schema was the legacy pre-`65d2138` branch/purchase contract.

## Counts

- Before: 6 failing files / 5 failure families
- After: 0 failing files / 0 full-suite failures
- Production bugs in the target five families: 0
- Stale-test families: 5
- Fixture/schema-related families: 2 (adaptive branch compatibility fixture and girls legacy branch fixture)
- Updated test files: 6
- Production files changed: 0

## Regression and safety

- Frontend package full suite: PASS
- Priority 1 KPI/UI: PASS
- lifecycle view: PASS
- manual result live-path/saved-seal fallback: PASS
- prediction flow: PASS
- sealed prediction reuse/cache: PASS
- sealed result proxy/client: PASS
- terminal lifecycle audit: PASS
- result verification UI: PASS
- thick-bet UI: PASS
- prediction production hash delta: 0 (production source byte-identical)
- purchase production hash delta: 0 (production source byte-identical)
- sealed result hash mismatch: 0; sealed-result tests PASS
- Research changes: 0
- historical mutations: 0

`tests/race-lifecycle-browser-fixture.mjs` is a fixture server rather than a terminating assertion test; it started successfully and was stopped after readiness. No sleep extension or timing workaround was introduced.

## Separate out-of-suite observation

An additional test not listed in the package full suite, `tests/keirin-browser-evidence-adapter.mjs`, still fails because a nested `data` profile envelope loses `fetchedAt` when undefined top-level envelope fields are overlaid. Correcting that path would make currently neutral profile evidence affect production predictions, so it was not mixed into this stale-test-only commit. It requires a separately authorized prediction-impact audit and hash comparison. It is not one of the five target full-suite failure families and does not change the `FULL_SUITE_CLEAN` result.

