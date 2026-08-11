# v151 Thick final promotion review decision

- Adds a sealed manual decision after the v150 final-promotion review package.
- Requires a final-promotion reviewer different from both earlier independent reviewers.
- APPROVE_LIMITED_CANARY requires explicit acknowledgement of counter-evidence and every locked rollback condition.
- The approval itself is sealed; later mutation produces `SEAL_MISMATCH`.
- Approval grants only `LIMITED_CANARY_CANDIDATE_ONLY` and cannot activate a canary or write production state.
