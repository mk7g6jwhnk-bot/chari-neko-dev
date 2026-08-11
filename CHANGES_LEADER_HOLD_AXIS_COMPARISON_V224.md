# v224 Leader-hold axis comparison

- Prediction-side explanation/audit only. Purchase engine unchanged.
- Adds `leaderHoldComparison` to prediction explanation.
- Separates branch-generation eligibility from rider ability comparison.
- Shows whether each rider has an actual LEADER_HOLD branch.
- If absent, records whether the rider is not an official line leader or the branch was blocked by line/start-evidence gating.
- If multiple LEADER_HOLD branches exist, compares the exact branch score trace: 1st placement 22%, escape 43%, start power 20%, recent form 10%, finish 5% (renormalized when inputs are missing).
- UI adds “なぜこの先行役を軸にしたかを見る”.
- No branch scores, terminal probabilities, purchase decisions, or funding are changed.
