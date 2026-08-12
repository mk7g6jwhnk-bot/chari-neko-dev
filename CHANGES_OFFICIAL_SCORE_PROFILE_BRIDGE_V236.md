# v236 — official score profile bridge

## Root cause
The verified official profile pipeline restored B/H/start-count evidence, but the prediction adapter still populated `officialScore` only from the race participant's `score` field.

When the browser supplied the official race score as `currentScore` inside verified official profile evidence, the prediction participant reached the initiative engine with `officialScore = null` (and downstream explanation rendered `0.00`).

## Fix
`adaptParticipant()` now resolves `officialScore` in this order:

1. participant `score`
2. participant `officialScore`
3. participant `currentScore`
4. verified `officialProfileEvidence.currentScore`
5. participant `officialProfile.currentScore`

The existing numeric validation remains in place.

## Boundary
No initiative formula, weighting, probability calculation, branch generation, terminal generation, or purchase-engine logic was changed.

## Regression
Added an assertion that inline verified `currentScore` reaches the prediction participant as `officialScore`.
