# v219 Prediction / Purchase Boundary

- Prediction engine and purchase engine are now separate modules.
- `prediction-engine.mjs` creates rider scores, lines, all supported scenario branches, all terminals, and terminal probabilities only.
- Prediction terminals must not contain purchase fields such as `betClass`, `purchaseStatus`, purchase reasons, funding, or purchase-border results.
- `purchase-engine.mjs` consumes a cloned prediction snapshot and owns odds comparison, MAIN/COVER/BUYABLE_HIGH/reference classification, purchase borders, no-bet decisions, and funding allocation.
- The purchase engine must not mutate, delete, or renormalize prediction terminals.
- A prediction/purchase boundary audit fingerprints order, probability, score, and contributing branches before and after purchase processing.
- `keirin-engine.mjs` is now only an orchestrator and preserves a raw `prediction.terminals` snapshot separately from purchase-classified top-level `terminals` for current app compatibility.
- Existing purchase policies from v218 are retained inside the purchase side; this release changes architecture and boundary ownership rather than thresholds.
