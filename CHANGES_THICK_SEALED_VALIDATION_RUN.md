# v149 Thick sealed validation run

- Runs the final validation only against a verified v148 sealed package.
- Requires the evidence cohort id to match the frozen sealed cohort.
- Requires a sealed core metric set: races, return rate, thick hit rate, main hit rate, support hit rate, and bet count.
- Separates PASS / FAIL / insufficient sample / incomplete evidence / seal mismatch.
- PASS only retains the research candidate for final promotion review. It does not write to production or auto-promote.
