# v163 Thick Post-Staged Expansion Decision

- Adds an independent manual decision after the sealed post-staged-expansion review.
- Reuses of the post-staged review author, staged-expansion activation reviewer, or post-canary decision reviewer are blocked.
- Approval requires explicit acknowledgement of counterevidence, unresolved issues, and every locked rollback type.
- Approval yields `FINAL_ROLLOUT_CANDIDATE_ONLY`; it does not allow full rollout, production writes, or automatic promotion.
- The approval decision is sealed; post-approval mutation produces `SEAL_MISMATCH`.
