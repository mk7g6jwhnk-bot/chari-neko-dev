# v66 Terminal lifecycle audit

- Added terminal lifecycle policy: generate -> probability evaluate -> purchase decision.
- Low probability, low popularity, ticket count or rank are never terminal deletion reasons.
- Generation-stage exclusions require an allowed reason group (`RULE_IMPOSSIBLE` or `DATA_CONTRADICTION`); duplicate terminal paths are merged under `DUPLICATE`.
- Every generated terminal records whether it was probability evaluated, purchased/rejected, and its purchase reason code/text.
- Added `terminalLifecycleAudit` with preservation, unexplained exclusion and unreasoned rejection checks.
- Saved predictions now include a compact `terminalLedger`.
- Result verification now records whether the actual trifecta was generated and, if it was not purchased, the stored rejection reason.
- Purchase audit UI shows terminal preservation status and reasonless exclusion/rejection counts.
- No Railway change required.
