# Chat Keirin Engine v1 implementation matrix

| Spec area | v67 status | Notes |
|---|---|---|
| Input snapshot/save-before-display | Implemented | Existing prediction snapshot flow retained |
| Missing ability ≠ 5.00 | Implemented for kimarite abilities | Missing values excluded and remaining weights renormalized |
| 1st/2nd/3rd role scoring | Implemented, provisional | Weight calibration remains research-only |
| Ability vs position separation | Partial | Role bonus exists; deeper independent position model remains |
| Start-power input audit | Implemented in v67 | Per-rider auditable/missing status persisted |
| Multiple scenario branches | Implemented, provisional | Needs comparison against chat predictions |
| Complete 3-place terminals | Implemented | Terminal generation audit present |
| No unexplained terminal deletion | Implemented in v66 | Lifecycle audit retained |
| Terminal probability after generation | Implemented | No rank/probability deletion gate |
| First-family aggregation/coverage | Implemented, provisional | Coverage targets need calibration |
| MAIN/COVER/BUYABLE_HIGH provenance | Implemented, provisional | Still needs chat-vs-app comparison |
| Reasoned purchase rejection | Implemented in v66 | Reject code + reason required |
| Rating consistency audit | Implemented, uncalibrated | Display ratings remain research-only |
| Post-result causal verification | Partial | Exact result comparison exists; intermediate race events often remain unknown |
| Post-hoc rationalization timestamps | Not yet implemented | Next phases |
| Chat prediction import | Not yet implemented | Planned as comparison tooling |
| First divergence detection | Not yet implemented | Planned after import schema |
| Automated model learning to production | Disabled | Research storage only |
