# v218 Purchase Border Recovery Lock

- Added end-to-end purchase flow audit: first-pass purchased count -> tightened second-pass count -> second recovery state -> final count.
- When the v217 skip-linked diffuse-race gate activates, the second-pass purchase border is authoritative.
- Disabled the second mass-undercoverage recovery after that gate so coverage-target recovery cannot re-expand a race already classified as diffuse.
- Kept generated terminals and rejected terminals intact for research/audit; this only changes purchase adoption.
- Added UI audit text showing the actual purchase flow and recovery lock.
- Added dedicated v218 regression test proving `7 -> 6 -> no second recovery -> 6`.
