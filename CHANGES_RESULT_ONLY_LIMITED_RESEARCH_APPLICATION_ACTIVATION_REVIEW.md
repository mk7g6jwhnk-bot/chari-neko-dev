# v197 Result-only limited research application activation review

- Added an independent manual activation-review gate for v196 limited research application plans.
- Revalidates `RESEARCH_SANDBOX_ONLY`, the fixed cohort, race cap (10-30), research-score adjustment cap (<=0.02), five monitoring metrics, and five rollback conditions.
- Requires an independent reviewer distinct from the plan creator and prior review/execution identities.
- Approval yields only `AUTHORIZED_LIMITED_RESEARCH_APPLICATION_START_ONLY`; execution remains disabled.
- Prediction use, user-facing prediction mutation, probability calibration, production writes, and automatic promotion remain disabled.
- Activation review records are sealed and reject post-hoc mutation.
