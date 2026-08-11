# v172 Thick Production Activation Plan

- Adds a sealed production activation planning gate after `PRODUCTION_ACTIVATION_CANDIDATE_ONLY`.
- Requires the exact final-rollout cohort and 100% target exposure.
- Requires at least 100 monitored races.
- Locks the five monitoring metrics: return rate, thick hit rate, main hit rate, support hit rate, and bet count.
- Inherits and locks every rollback type from the post-final-rollout decision.
- Requires immediate stop on any rollback breach and a mandatory post-activation review.
- Creating the plan never enables production writes, auto-promotion, or production activation.
- Plan mutation is detected through `SEAL_MISMATCH`.
