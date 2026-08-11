# v186 Result-only hypothesis validation gate

- Adds a research-only validation gate over result-only objective research candidates.
- Splits objective result records chronologically into early/late halves and requires temporal replication.
- Requires multi-venue evidence before a result-only correlation can become a research validation candidate.
- Candidate statuses: VALIDATION_PENDING, TEMPORAL_REPLICATION_FAILED, CONTEXT_EVIDENCE_PENDING, RESEARCH_VALIDATION_CANDIDATE_ONLY.
- Even passed candidates remain excluded from prediction accuracy, return rate, probability calibration, automatic promotion, and production writes.
- Research UI now shows validation candidates, pending hypotheses, and temporal replication failures.
