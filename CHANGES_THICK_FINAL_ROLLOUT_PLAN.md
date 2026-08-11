# Thick final rollout plan

- Adds a sealed 100% final rollout plan after the approved post-staged-expansion decision.
- Locks the cohort, 100% target exposure, minimum 100-race monitoring sample, monitoring metrics, rollback types, immediate-stop behavior, and required post-rollout review.
- Plan creation does not activate full rollout or permit production writes; activation remains a separate manual review step.
- Any sealed-plan mutation is detected as `SEAL_MISMATCH`.
