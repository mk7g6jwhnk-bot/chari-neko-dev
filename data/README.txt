# RiderDB import 2026-08-13

`rider-db.json` is a provider-compatible RiderDB wrapper built directly from
`all_riders_basic_v1.jsonl` in the uploaded research archive.

- 2,420 riders
- keyed by 6-digit JKA registration number
- `riderId` is `JKA-xxxxxx`
- no fabricated ability values
- no 5.00 fallback values inserted

Important:
The current production engine's RiderDB gate requires numeric ability fields
such as `recentForm`, `startPower`, `sprintPower`, `finishPower`,
`trackingSkill`, and `roleScores`. Those fields are not present in the
uploaded research-basic dataset, so this is a real/base RiderDB but not yet
an engine-ready ability DB.
