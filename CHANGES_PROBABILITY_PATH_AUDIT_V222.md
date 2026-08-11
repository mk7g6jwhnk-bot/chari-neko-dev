# v222 Probability Path Audit

- Behavior change: none. Prediction probabilities and purchase decisions are unchanged.
- Adds a prediction-side audit tracing node conditional probabilities to actual terminal probability construction.
- Explicitly records that final probability does not directly multiply FIRST/SECOND/THIRD node conditional probabilities.
- Adds sibling 1-2-* comparison to detect when third-stage conditional differences are flatter in final terminal probabilities.
- UI adds `確率経路監査を見る` under the prediction explanation.
