# v211 direct linkage, no rider marks

- Rider marks are retired from the current prediction detail UI and consistency audit.
- Historical `riderMarks` fields remain readable for backward compatibility only.
- The current UI shows rank-specific first/second/third evaluations directly.
- Bet consistency is audited through the existing whole-linkage chain: placement evaluation -> scenario branch -> terminal probability -> purchase classification.
- Research outcome diagnostics no longer emit mark/purchase alignment review tags. Historical diagnostics remain readable.
- Prediction generation, purchase classification, funding, and research ledgers are otherwise unchanged.
