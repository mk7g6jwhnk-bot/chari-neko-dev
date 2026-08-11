# v183 Operational Auto Learning Pipeline

- Result attachment now persists operational metrics into the research ledger, so monitoring can exceed the compact prediction snapshot retention window.
- Added automatic pipeline triggered on app startup and every confirmed result attachment.
- Normal-learning races only are counted; cancelled/refund/exceptional races remain excluded.
- Maintains a rolling current window up to 100 races and a prior baseline window.
- Automatically aggregates returnRate, thickHitRate, mainHitRate, supportHitRate, and average betCount.
- Automatically evaluates the five rollback families used by the sealed promotion chain.
- At 100 current races with a usable baseline, creates an operational v182 review-input draft with counterevidence, unresolved issues, and rollback non-trigger evidence.
- No production write, persistent production mutation, or auto-promotion is enabled.
- UI research summary now shows current monitored sample, baseline sample, and v182 draft readiness.
