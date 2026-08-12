# v235 — inline official participant evidence fallback

## Root cause
The prediction adapter only bound official profile evidence from dedicated profile containers (`officialProfiles` / `profiles` / `participantProfiles`) or nested profile objects. When the browser service supplied verified official fields directly on each race participant, those fields were ignored.

As a result, `startPower` received no `verifiedOfficialProfile`, `officialTotalStarts`, `backCount`, or `homeCount` for every rider. The UI therefore showed all riders as `主導権 未取得`, even though the race participant payload could contain the required official fields.

## Fix
`hydrateParticipantEvidence()` now also accepts:
- `item.officialProfileEvidence`
- verified inline official participant fields when `item.identityPassed === true`

Inline binding is limited to records carrying an explicit participant identity pass, so unverified fields are not promoted into prediction evidence.

## Regression coverage
- Existing browser evidence adapter test: PASS
- Inline official participant evidence test: PASS
- Start-power input audit: PASS
- Start-power empirical quantile test: PASS
- v225 leader-hold comparison: PASS
- v228 purchase zero-funnel audit: PASS
- JS syntax checks: PASS

## Boundary
This change does not alter the start-power formula, initiative weights, purchase engine, probability calculation, or terminal generation. It only restores verified official participant evidence into the existing prediction pipeline when that evidence is supplied inline.
