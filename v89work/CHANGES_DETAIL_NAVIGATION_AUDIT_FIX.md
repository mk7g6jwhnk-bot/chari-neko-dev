# v60 Detail navigation audit fix

- Prediction screen `レース詳細へ` now reopens the currently saved snapshot through `openSavedDetail()` instead of rendering with possibly stale in-memory payload.
- This clears the transient prediction payload and restores `targetRace` from the saved snapshot before rendering the detail/audit screen.
- Bumped the static app query to `app.mjs?v=60` to avoid stale browser cache after deploy.
- Purchase selection logic is intentionally unchanged from v59 so the current suspicious bet list can be audited without changing the evidence under inspection.
