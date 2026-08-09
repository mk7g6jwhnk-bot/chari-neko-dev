# v26 global-main-branches

- Removes the single-main-line lock from Keirin branch selection.
- Structured branches (先行押し切り / 番手差し / まくり) are compared across all official lines.
- Any structured branch scoring at least 90% of the top structured branch is retained as a main-scenario candidate, regardless of line.
- MAIN/COVER purchase logic is otherwise unchanged from v23; this isolates the line-lock correction for audit.
- Branch audit now shows all main-scenario candidate branch labels and line ids.
- Engine version: KEIRIN-0.5.4-global-main-branches.

# UI

- UI remains v24 quick-navigation/deadlines plus v25 branch-prior audit.
