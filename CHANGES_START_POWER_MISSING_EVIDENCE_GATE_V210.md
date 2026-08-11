# v210 Start-power missing evidence gate

- Missing official B/H/start-count evidence no longer produces a numeric neutral startPower.
- `startPowerEvidence` now records `usable` and `evidenceStatus`; missing/zero-start evidence is unusable.
- Placement scoring receives `startPower=null` for unusable evidence and renormalizes over other verified inputs.
- LEADER_HOLD / initiative-dependent branches are withheld for riders whose start-power evidence is explicitly unusable.
- Non-initiative branches (for example makuri) remain available.
- Girls purchase evidence count now counts only usable start-power evidence.
- `startPowerInputAudit` reports usable/withheld riders and verifies that no withheld rider leaks into a LEADER_HOLD branch.
- No synthetic rank is created from missing B/H evidence.

- When official line data and usable start-power evidence are both unavailable, standard purchase is blocked and the position-balanced reference set is used; this prevents the missing-evidence gate from expanding a flat race into many normal/reference rows.
