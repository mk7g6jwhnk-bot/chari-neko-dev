# v184 Result-only objective research

- Saves official results for races with no prediction snapshot into a separate result-only research ledger.
- Excludes result-only records from prediction accuracy, return-rate, purchase, and probability-calibration denominators.
- Stores only objectively confirmable facts: finish order, winning method, S/B markers, rider finish rows, and incidents when official structured evidence exists.
- Intermediate process claims such as initiative changes, attack order, follow state, jump-on, split, separation cause, and switching cause remain evidence-pending instead of being inferred from finish order.
- Automatically scans finished, unpredicted, uncollected races from the meeting list, up to 24 per pass with at most 3 concurrent result requests.
- Duplicate races are replaced by race key rather than double-counted.
- Production writes and automatic promotion remain disabled.
