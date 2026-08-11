# v230 MAIN scenario class invariant

- Standard purchase cannot consist only of COVER / BUYABLE_HIGH.
- Any adopted natural terminal originating from the main forecast is MAIN by definition.
- The old 0.58 direct-main threshold may affect selection strength, but no longer downgrades an adopted main-scenario terminal to COVER.
- Post-recovery normalization enforces the same rule after breadth/mass recovery.
- If non-MAIN standard purchases somehow exist with no valid main-scenario anchor, those non-MAIN purchases are rejected with MAIN_REQUIRED_FOR_STANDARD_PURCHASE instead of exposing a COVER-only plan.
- Prediction terminals and probabilities are unchanged.
