# v223 Conditional Probability Distribution Audit

- Behavior change: none to terminal probability calculation or purchase selection.
- Added prediction-side audit for whether FIRST / SECOND / THIRD node `conditionalProbability` values sum to 1 within each identical parent state.
- Audit reconstructs unique candidate distributions from branch contributions and reports group count, min/max/average sum, missing mass, and candidate burden.
- Current formula is documented as `score share × required-condition burden`, without post-burden renormalization.
- If any parent-state distribution does not sum to 1 (tolerance 0.001), values are explicitly marked as not valid conditional-probability distributions and direct `P(branch) × P1 × P2 × P3` use is blocked by the audit.
- UI adds 「条件付き確率の100%監査」 under prediction probability audit.
- No purchase-engine changes.
