# v174 Thick Production Activation Run

- Adds sealed production activation run start after an independently approved production activation review.
- Re-verifies plan and approval seals before start.
- Locks cohort, 100% exposure, minimum 100 races, five monitoring metrics, rollback conditions, immediate stop, and post-activation review requirement.
- Starts only as `PRODUCTION_ACTIVATION_MONITORING_ACTIVE`.
- Keeps automatic promotion and persistent production mutation disabled; this release implements the controlled activation-run mechanism and audit trail, not an external deployment.
- Run mutation is detected by seal verification.
