# v61 Detail lazy audit fix

- Race detail now opens before heavy purchase-audit DOM is built.
- Purchase audit is rendered only when its accordion is opened.
- Support-branch previews are capped to reduce browser freezes.
- Old/partial saved prediction shapes are normalized defensively.
- A basic-detail fallback keeps navigation usable even when one audit section fails.
- Prediction and purchase views tolerate legacy snapshots with missing arrays.
