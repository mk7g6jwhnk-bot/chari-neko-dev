# v157 Thick Post-Canary Decision

- Seals the manual post-canary decision after a clean limited canary review.
- Requires a reviewer independent from the post-canary reviewer and prior approval chain.
- Approval requires explicit acknowledgement of counter-evidence, unresolved issues, and every locked rollback type.
- Approval only creates `STAGED_EXPANSION_CANDIDATE_ONLY`; it does not authorize expansion activation, full rollout, production writes, or auto-promotion.
- Decision content is sealed; later mutation invalidates the decision.
