# v25 branch-prior-audit

- Prediction logic unchanged from v23 weighted branch support.
- Adds audit-only visibility for pre-terminal branch scores, normalized branch share, top-relative score, priority, line id, and score trace.
- Engine version: KEIRIN-0.5.3-branch-prior-audit.

# Version

KEIRIN-0.5.2-weighted-branch-support / UI-v24-quick-navigation-deadlines

- Prediction logic is unchanged from KEIRIN-0.5.2.
- Added 会場選択 / レース選択 quick buttons beside the back button.
- Venue cards show the nearest upcoming cutoff time when discover data provides official race times.
- Race cards and timeline rows show cutoff time explicitly.
- Venue cards are color-coded by モーニング / デイ / ナイター / ミッド.
- Saved race snapshots preserve the official deadline separately when available.
- Netlify discover adapter accepts Railway v0.5.6 per-race deadline/startTime metadata.
