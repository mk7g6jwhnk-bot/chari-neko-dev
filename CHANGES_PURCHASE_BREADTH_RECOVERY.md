# v156 Second-pair breadth recovery

- Root cause of the still-small ticket set was upstream of probability-mass coverage: strong alternative 2nd-place pairs were disappearing after one pair reached family coverage.
- Added `SECOND_PAIR_BREADTH_RECOVERY`: for each MAIN/approved contender first family, every 1-2 pair with second-place support >= 0.94 keeps at most one strongest terminal from that same pair.
- Recovery floor is terminal convergence >= 0.30, but low total-convergence purchases are authorized only when they come from this explicit pair-local recovery.
- No cross-pair third-place Cartesian expansion; at most one recovery per missing 1-2 pair.
- Global probability-mass shortage is audit-only (`GLOBAL_MASS_WARN_ONLY_PAIR_LOCAL_RECOVERY`) rather than a quota that can add unrelated terminals.
- SUB/risk branches and high-payout odds gates are unchanged.
- Five-race regression moved from 6,6,4,7,6 to 10,10,4,12,10. The line-missing reference case stays at 4.
