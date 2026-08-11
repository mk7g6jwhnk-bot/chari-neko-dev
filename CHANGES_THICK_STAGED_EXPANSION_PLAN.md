# Thick staged expansion plan

- Adds a sealed staged-expansion planning layer after a successful post-canary decision.
- Expansion must be gradual: exposure must increase from the prior canary but may not exceed 25%.
- The cohort is locked to the post-canary cohort.
- Requires at least 60 races, all five monitoring metrics, all inherited rollback types, and immediate stop on rollback.
- Plan creation does not activate expansion. A separate manual activation review is required.
- Production writes, auto-promotion, full rollout, and further expansion remain disabled.
