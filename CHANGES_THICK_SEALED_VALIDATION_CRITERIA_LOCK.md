# Thick sealed validation criteria lock

- Seals validation criteria inside `createThickSealedValidationPackage(...)`.
- Sealed criteria: `minimumRaces`, `minimumReturnDelta`, `minimumThickHitDelta`, `maxMainHitDrop`, `maxSupportHitDrop`, `maxBetCountIncrease`.
- `verifyThickSealedValidationPackage(...)` now includes criteria in the seal payload.
- `runThickSealedValidation(...)` uses only sealed package criteria.
- Runtime overrides that differ from the sealed criteria fail with `SEALED_VALIDATION_CRITERIA_MISMATCH`.
- Matching explicit overrides remain accepted for compatibility.
- Added regression tests for criteria sealing, mutation detection, mismatched override rejection, and matching override acceptance.
- Production writes and automatic promotion remain disabled.
