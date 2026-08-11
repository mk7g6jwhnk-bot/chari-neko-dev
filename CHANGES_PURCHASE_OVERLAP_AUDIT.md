# v154 Purchase overlap audit

- Exact duplicate trifecta orders are defensively collapsed at allocation time.
- Generated terminals remain untouched; dedupe is purchase/funding-side only.
- Purchase diagnostics now records pair-level third-place variant counts and probability mass.
- Similar but distinct third-place outcomes are not deleted solely for looking alike.
- Five or more purchased third variants on the same 1-2 pair are flagged HIGH for audit.
