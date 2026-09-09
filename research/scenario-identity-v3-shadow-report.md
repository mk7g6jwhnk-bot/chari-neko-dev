# Scenario identity v3 shadow report

## Decision

`PROMISING_BUT_MORE_DATA`

`S0` is the only candidate that currently satisfies the low-fragmentation shape guardrail: median 3 scenarios and p90 4. It preserves the five observed branch semantics and does not split on rider number, literal line ID, role detail, or third place. However, none of the 83 naturally sealed `SCENARIO_PROVENANCE_V1` races had a confirmed result at the audit cutoff, so correct-scenario TopK and the required comparison with `dominantBranchId` cannot yet be established. Shape alone is not enough for `SCENARIO_IDENTITY_READY_FOR_SHADOW_PURCHASE`.

Audit cutoff: 2026-09-10 08:00 JST. Source: Railway production Volume, read only. The cohort grew during the audit; the fixed evaluation snapshot used below contained 83 records under `20260910`. No production record was written or mutated.

## Fixed identity candidates

All candidates consume only the persisted eight-field `SCENARIO_PROVENANCE_V1` tuple. Candidate definitions were fixed before looking for outcomes.

| Candidate | Identity | Freedom control |
|---|---|---|
| S0 | normalized `branchType` | five observed human-readable branch families only |
| S1 | S0 + relational initiative survival | `SWEEP`, `SURVIVES`, `OTHER`, `UNKNOWN`; literal line IDs excluded |
| S2 | S1 + first/second relation only for `LEAD_BATTLE`, `LINE_SEPARATION`, `OTHER_LINE_RISE` | no relation split for already-specific `LEADER_HOLD`, `BANTE_SASHI`, `MAKURI_SUCCESS` |

Supported labels are `LEADER_HOLD`, `BANTE_SASHI`, `MAKURI_SUCCESS`, `LEAD_BATTLE`, `LINE_SEPARATION`, `OTHER_LINE_RISE`, `SOLO_RISE`, and `UNKNOWN`. The audited cohort contained the first five except `OTHER_LINE_RISE`; `SOLO_RISE` and `UNKNOWN` were not observed as branch types.

The identity never uses third place, result, payout, hit, odds, purchase state, terminal number, literal line ID, or detailed first/second role. Missing input remains `UNKNOWN`.

## Read-only shadow evaluation

### Source coverage

| Metric | Value |
|---|---:|
| natural V1 seals | 83 |
| raw provenance median | 37 |
| raw provenance p75 | 42 |
| raw provenance p90 | 65 |
| raw provenance max | 72 |
| raw provenance mean | 40.52 |
| raw tuple-field UNKNOWN rate | 5.21% |
| terminal-weighted tuple-field UNKNOWN rate | 4.58% |
| confirmed-result sample | 0 |
| 403-502 final-test outcomes used | 0 |

### Candidate comparison

| Metric | S0 | S1 | S2 |
|---|---:|---:|---:|
| scenario median | 3 | 5 | 6 |
| scenario p75 | 4 | 6.5 | 7.5 |
| scenario p90 | 4 | 7 | 8 |
| scenario max | 4 | 7 | 9 |
| scenario mean | 2.80 | 4.51 | 5.22 |
| 2-6 scenarios | 71.08% | 45.78% | 28.92% |
| Top1 mass median | 64.15% | 49.52% | 49.52% |
| Top2 cumulative mass median | 95.97% | 72.50% | 72.50% |
| Top3 cumulative mass median | 100.00% | 88.41% | 88.41% |
| concentration HIGH / MEDIUM / LOW | 49 / 33 / 1 | 25 / 22 / 36 | 25 / 22 / 36 |
| branch-UNKNOWN scenario rate | 0% | 0% | 0% |
| correct scenario Top1 / Top2 / Top3 | N/A | N/A | N/A |
| correct scenario mass rank | N/A | N/A | N/A |
| current `dominantBranchId` comparison | N/A | N/A | N/A |

Exact scenario-count frequencies explain the 2-6 rates:

- S0: 1 scenario = 24R, 3 = 28R, 4 = 31R.
- S1: 1 = 24R, 5 = 25R, 6 = 13R, 7 = 21R.
- S2: 1 = 24R, 5 = 2R, 6 = 22R, 7 = 14R, 8 = 20R, 9 = 1R.

The 24 one-scenario races remain one scenario under all three candidates, so S0 did not create that collapse by discarding initiative or relation detail. It reflects a cohort whose sealed terminals expose only one branch-family identity. Conversely, S1 and S2 exceed six in many otherwise multi-scenario races without outcome evidence that those splits add value.

## Duplication and semantic review

- Same branch meaning does not fragment on `branchId` or literal initiative/first/second line IDs.
- First/second rider-number changes do not affect identity.
- Detailed `firstRole` and `secondRole` changes do not affect identity.
- Third-place changes cannot affect identity because third-place data is not read.
- `SAME_LINE_FORWARD`, `SAME_LINE_REVERSE`, and `CROSS_LINE` affect only S2 and only the three broad branch families where the relation can change the interpretation.
- UNKNOWN is never inferred. Tuple-level UNKNOWN remains reported independently even when branch family is known.

No duplicate semantic key was found by construction: every candidate key is a canonical tuple of the explicitly listed low-cardinality components.

## Mass and concentration

Each terminal contributes its sealed pre-result `normalizedWeight`, `normalizedProbability`, `probability`, `modelWeight`, or `weight` in that priority order; audited production seals provide `probability`. Mass is normalized within a race after grouping. Output per scenario contains family, normalized mass, rank, terminal count, initiative-family summary, and first/second-relation summary. No production terminal ordering is modified.

Concentration is descriptive only: HIGH when Top1 mass is at least 0.60, MEDIUM when Top2 cumulative mass is at least 0.70, otherwise LOW. These are report labels, not production thresholds and are not connected to purchase logic.

## Result evaluation boundary

Identity and mass grouping are computed before result access. Only then may a confirmed finish order locate the already-generated correct terminal. The reusable evaluator rejects result evaluation for records carrying a sequence/record/comparison/validation index from 403 through 502. At this cutoff all 83 records were unconfirmed, so no result, payout, hit, or final-test content influenced candidate selection or this decision.

S0 is therefore a provisional winner on the pre-result structural metrics only. It must be re-run unchanged after a sufficient non-final-test result cohort accumulates. No rule tuning is authorized from that future evaluation.

## Memory and payload

The CLI reads and parses one record at a time and retains only compact per-race scalar summaries; it does not retain seals or terminal arrays across races. `peakRecordBytes` is reported by the script. The shadow identity is not persisted or returned by any production API, so production prediction/purchase payload impact is 0 bytes and persistent service-memory impact is 0. The audit command ran as a short-lived read-only process.

## Safety

- prediction ranking changed: NO
- Research ranking changed: NO
- purchase logic changed: NO
- weights changed: NO
- thresholds changed: NO
- historical records changed: NO
- production write: 0
- 403-502 tuning use: NO
- result-derived identity fields: 0
- production deploy: NO
- production promotion: NO

## Reproduction

Run against a read-only directory containing lifecycle record JSON files:

```text
node research/scenario-identity-v3-shadow.mjs <sealed-record-directory>
```

The command emits JSON to stdout and performs no writes. Unit/regression coverage is in `tests/scenario-identity-v3-shadow.mjs`.
