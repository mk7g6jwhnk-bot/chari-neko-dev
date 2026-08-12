# Keirin result pipeline audit

Finalized structure:

Scheduled Function
→ Background Coordinator
→ 1 race / 1 Background Worker
→ KEIRIN_BROWSER_SERVICE_URL
→ normalizeResult
→ race_results

Worker additionally checks `race_results` before browser access and skips
terminal statuses (`confirmed`, `cancelled`, `canceled`, `refund`), while
`not_finished` remains eligible for a later retry.

The scheduler/coordinator/worker files are included in the package syntax
check. No prediction-engine or purchase-engine files are modified by this
fix.
