# v171 Thick Post Final Rollout Decision

- Adds an independently sealed manual decision after the post-final-rollout review package.
- Approval can only produce `PRODUCTION_ACTIVATION_CANDIDATE_ONLY`.
- Production activation, production writes, and automatic promotion remain disabled.
- Approval requires explicit acknowledgement of counter-evidence, unresolved issues, and every locked rollback type.
- The final decision reviewer cannot reuse key reviewers from the preceding review/activation/promotion chain.
- Decision mutation is detected by seal verification.
