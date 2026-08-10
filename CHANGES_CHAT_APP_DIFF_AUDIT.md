# v73 Chat vs App Difference Audit

- Imported chat predictions are compared with the saved app prediction for the same race.
- Comparison order is fixed: first-place evaluation -> 1-2 branches -> 3-place terminals -> bet classification -> purchase decision.
- The UI highlights the first stage where the two predictions diverge.
- Later-stage differences are still shown, but engine fixes should prioritize the first divergence.
- Missing chat fields are shown as comparison-unknown rather than guessed.
- Chat predictions never overwrite app predictions.
