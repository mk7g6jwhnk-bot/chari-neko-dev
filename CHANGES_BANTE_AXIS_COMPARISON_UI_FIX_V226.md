# v226 BANTE_SASHI axis comparison UI fix

## Root cause
The v225 comparison was generated/rendered only when the selected axis branch itself was `LEADER_HOLD`. In common main scenarios where the leader rides first and the bante rider wins (`BANTE_SASHI`), the real initiative rider still matters, but `axisBranchId` pointed to the bante branch. Therefore `leaderHoldComparison.axisRow` became null and the UI guard also suppressed the comparison.

## Fix
- When the prediction axis is `BANTE_SASHI`, map it to the same official line's `LEADER_HOLD` branch before building the leader comparison.
- Preserve the original axis branch id/type in audit fields and mark `mappedFromBanteSashi=true`.
- Render the leader comparison for both `LEADER_HOLD` and `BANTE_SASHI` axis branches.
- Added a regression test proving a bante-sashi axis produces a user-facing `2番 vs 3番` leader comparison.

## Behavior
No prediction score/probability/purchase logic changed. This is a visibility/mapping bug fix only.
