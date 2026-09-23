# Terminal detail trace production rollout

- 実施日時: 2026-09-23 JST
- verdict: `TERMINAL_TRACE_PRODUCTION_READY_WITH_LIMITS`
- frontend/research source: `1efbf49`
- browser source: `6f6e1c0`
- browser production integration: `4d9bb6a` (`343d36e` Chromium recovery baseline + `6f6e1c0`)
- Railway deploy: `956648ac-4331-4f13-bc94-8bd7b86a9603` / `SUCCESS`
- Netlify preview: `6ab34dd6c48bebcfeda5f144`
- Netlify production: `6ab35015a77d2d01ae3d812c` / `ready`
- production URL: https://chari-neko-dev.netlify.app

## Deploy safety

- `6f6e1c0` was not deployed directly because it branched from `39de2e1` and did not contain the later Chromium launch/process recovery in `343d36e`.
- The trace-sidecar change was cherry-picked onto `343d36e`; browser check passed before upload.
- `/data` remained mounted. Storage was `HEALTHY`, writable, 6.81% used, 8,754,458,624 bytes free, inode 1.04%.
- After deploy: Chromium connected, generation 1, launch attempts 1, launch failures 0, launch recoveries 0. Log audit found ENOSPC 0, OOM 0, restart 0, launch failure 0, `TRACE_SAVE_FAILED` 0.
- No prediction, purchase, recommendation, THICK, weight, threshold, SHADOW variant, or cliff logic was changed.

## Verification

- Frontend full suite: 38 PASS / 0 FAIL.
- Browser check: PASS (validation status store, browser manager, terminal trace store).
- Local failure injection: prediction seal succeeded while trace write reported `TRACE_SAVE_FAILED`; canonical hash stayed unchanged.
- Production manual prediction E2E: `20260923-73-8` generated, saved, reloaded, and rendered. The first cold attempt reached Netlify 504 while Railway queue wait was 19,511 ms and official fetch was 20,721 ms; retry used the retained manual snapshot and completed. This path had `autoResearch=0`, so it did not create a research sidecar.
- Production Validation Status: detailed trace section is visible; the current 2026-09-23 artifact predates the rollout and correctly displays that observation starts with new-format races.
- Production mobile: 390x844 viewport, no document-level horizontal overflow (`scrollWidth=clientWidth=375`), detailed trace section visible.
- JavaScript errors: 0 in preview and production UI checks.

## Trace coverage limit

- Existing 2026-09-23 lifecycle races were already sealed before the browser rollout. The immutable collector correctly skipped them.
- Authorized read-back over all 72 current-day race keys found 0 new sidecars after deploy. No historical sidecar/backfill was created.
- Therefore this rollout could not truthfully claim a real-race `TRACE_SAVED` sample or result diagnosis on the deploy day: tested new auto-sealed races 0, `TRACE_SAVED` 0, `TRACE_PARTIAL` 0, `TRACE_SAVE_FAILED` 0, coverage `0/0`.
- The first post-rollout race that is sealed by the automatic lifecycle is the required production acceptance sample. The following daily validation can then report saved/target, diagnosis, UNKNOWN, and far-miss counts.

## Performance and storage bounds

- Synthetic 9-rider trace: raw 3,428,401 bytes; gzip 86,273 bytes; ratio 2.52%.
- Baseline engine median 129.27 ms; trace engine median 144.68 ms; trace overhead 15.41 ms.
- Serialization median 59.68 ms; gzip median 26.23 ms; local write median 1.99 ms.
- 1,000 races: about 86.27 MB at the 9-rider conservative size.
- 80 races/day: about 207 MB per 30 days and 621 MB per 90 days.
- Production per-race trace bytes remain unmeasured until the first new automatic seal.

## Integrity

- prediction hash mismatch: 0 (suite and trace ON/OFF parity)
- purchase hash mismatch: 0 (suite and trace ON/OFF parity)
- result mismatch: 0
- result leakage: 0 (`resultDataUsed=false` and no result input in trace generation)
- historical mutation: 0
- protected final use: 0
- production prediction changed: NO
- production purchase changed: NO
- recommendation changed: NO
- THICK changed: NO

The stored fields cover terminal composition, rank, final score, first/second/third conditional trace, pair direction, pair compatibility, scenario score/support, counter evidence, and evidence IDs. This is sufficient for the planned structural SHADOW candidates after enough new races accumulate; no candidate was implemented in this rollout.
