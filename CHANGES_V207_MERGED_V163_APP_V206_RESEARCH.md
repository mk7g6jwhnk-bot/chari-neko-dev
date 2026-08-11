# v207 merged v163 app + v206 research

- Base: v163 app branch.
- Preserves purchase breadth, terminal reevaluation, position/ability separation, purchase funding UI, snapshot version isolation, and v148-v163 regression tests.
- Adds v206 result-only research, operational auto-learning aggregation, outcome diagnostics, and the sealed result-only research governance chain through post-independent-evaluation review.
- Common prediction/engine files stay on the v163 implementation unless a research-specific persistence hook is required.
- Production prediction, purchase generation, and display ratings are not replaced by the older v206 common-engine copies.
- No automatic production promotion.
