# v227 Axis Selection Trace Fix

- Axis selection audit now records the exact ranking rule used by prediction explanation: CENTER/main pool first, then terminal probability mass, then branch score, then branch ID.
- UI shows actual axis ranking with probability mass and branch score side by side.
- Fixed misleading leader-hold comparison text: when the mapped axis leader has a lower LEADER_HOLD score than a rival, the UI no longer claims leader-score factors explain axis selection.
- In that case it explicitly states that the leader comparison is insufficient and that the actual axis was selected by branch terminal probability mass.
- Added invariant that recomputed rank-1 branch must equal saved axis branch.
- Prediction/purchase behavior unchanged.
