# Action-tag race review workload report

## Decision

`MANUAL_REVIEW_READY`

The manual workflow is now race-level rather than rider/tag-level. Four required story decisions and one optional other-line decision generate the major action tags without asking the reviewer to repeat the same judgment for every rider. This meets the 3–5 decisions/race target and remains entirely Research-only.

## Before / after

| KPI | Before | Race-level workflow |
|---|---:|---:|
| manual prompts per race | capped at 12 | 4 required, 5 with optional Q5 |
| E2E mean decisions/race | 12 ceiling | 4.5 |
| E2E mean tags/race | prompt-dependent | 5.0 |
| estimated clicks/race | at least 13 including submit | 5.5 including submit |
| estimated time/race | not measured | 44 seconds |
| manual share of auto+human decisions | 78.26% | 57.47% |
| prompt reduction | — | 62.50% |
| E2E UNKNOWN rate | — | 10.00% |

Timing is an operation-count estimate, not wall-clock observation: six seconds to inspect the compact evidence header, eight seconds per one-click judgment, and two seconds to submit. Evidence viewing time is not included because it varies by source. At 44 seconds the workflow is below the 60-second ideal target and well below the 90-second acceptable limit.

The new workflow reduces human prompts rather than pretending manual-only states are automatic. The earlier automatic observation rate remains 21.74%; this change does not promote proxies or impute UNKNOWN.

## Minimal story review

1. lead pressure: `CLEAN`, `CONTESTED`, `LONG_LEAD`, `UNKNOWN`;
2. initiative rider energy: `RESERVED`, `NORMAL`, `DEPLETED`, `UNKNOWN`;
3. bante response: `SUPPORT_FRONT`, `HOLD_POSITION`, `SELF_LAUNCH`, `SWITCH`, `SEPARATED`, `UNKNOWN`;
4. line state: `INTACT`, `PARTIAL_BREAK`, `COLLAPSED`, `UNKNOWN`;
5. optional other-line survival.

The initiative and bante rider are resolved once from the strongest pre-existing initiative candidate and official line structure. One answer maps to the appropriate rider/state tag. `SWITCH` is stored as `BANTE_RESPONSE=SWITCH`; `COLLAPSED` is independently stored as `LINE_STATE=COLLAPSED`. Race-wide answers are not duplicated across every participant.

## Evidence and verification

The Research view model exposes only raceKey, lineup, initiative/bante candidates, pre-race header, automatic candidate chips, required state questions, and evidence source/timestamp/link. Candidate chips are never pre-approved. The reviewer must explicitly choose a value and one of `CONFIRMED`, `STRONGLY_SUPPORTED`, `POSSIBLE`, or `UNKNOWN`.

Each review stores reviewerId, reviewedAt, original automatic candidate, final human judgment, and disagreement. A contradicted candidate can be preserved as a disagreement audit, while the original automatic tag remains immutable. The store permits a second reviewer for the same race but rejects a duplicate by the same reviewer.

## Queue and resume

Race cases are ordered by state-60 gap, conditional-cell-50 gap, model impact, proxy confidence, and then age. Same-race questions remain one case. An in-progress race checkpoint records the current question index; export/restore resumes at that question. Completed reviews and prior reviewers are retained in the checkpoint snapshot.

The workflow does not modify the existing append-only action-tag store or production storage. An operational Research process may persist the returned checkpoint using its separately authorized Research destination.

## E2E

Two non-final synthetic races were reviewed. The first used five questions, expanded to six tags, contradicted a suggested `LONG_LEAD` with reviewed `CONTESTED_LEAD`, saved an explicit `CONTRADICTED` tag, and included one explicit UNKNOWN. The second used four questions and generated four tags. Tests verified:

- queue/case creation and compact view model;
- proxy suggestion shown but not selected;
- race-level answer-to-tag expansion;
- initiative/bante rider targeting;
- verification and disagreement audit;
- same-review duplicate rejection and second-reviewer support;
- checkpoint export, restart, and resume;
- coverage update;
- final-test 403–502 rejection;
- no accuracy evaluation.

## Workload forecast

At the estimated 44 seconds/race:

- 100 races: 1.22 hours
- 300 races: 3.67 hours
- 500 races: 6.11 hours

With one tag per answered major state, 60 reviewed examples require about 60 races when the state is answerable in every race. The optional other-line cell needs about 120 races at the E2E 50% inclusion rate. Conditional line-size/bante cells depend on their natural prevalence: at 50% prevalence, a 50-example cell needs about 100 races; at 25%, about 200. ENERGY and action-intent quality still depends on actual independent review evidence, not question throughput.

## Safety

- production prediction changed: NO
- production purchase changed: NO
- production UI changed: NO
- Research baseline changed: NO
- historical mutation: 0
- 403-502 tuning use: NO
- UNKNOWN imputation: NO
- production write: 0
- automatic verification promotion: NO
- accuracy evaluation: NO
- production deploy: NO
