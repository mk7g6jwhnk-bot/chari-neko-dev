# v67 Chat engine spec baseline

- Added `docs/CHAT_KEIRIN_ENGINE_SPEC_V1.md` as the implementation baseline for the keirin engine.
- Added `audit.startPowerInputAudit` to every new keirin prediction.
- New predictions store per-rider start-power audit status and missing-input details.
- The UI no longer treats a start-power audit rendering/problem as a normal "監査を省略" state.
- Legacy or missing audit data is explicitly shown as `主導権入力監査不能`.
- Partial missing inputs are shown rider by rider instead of failing the whole audit panel.
- This is phase 1 of the spec migration. It does not claim full v1 compliance yet.
