# v127 2着・3着メカニズム連動

SECOND / THIRD の成立条件を、単なる同ライン/別線だけでなく riderEvaluationV2 の着順別メカニズム名へ接続。

SECOND:
- leaderRemain: 先行残り
- lineFollower: 追走残り
- otherLineRemain: 別線残り

THIRD:
- lineThird: ライン3番手残り
- positionRemain: 位置残り
- otherLineRemain: 別線残り

各条件へ mechanism.key / label / score を保存し、worldFacts に secondMechanism / thirdMechanism を継承。
既存の条件確率(.80/.52/.78/.56)、条件数、kindは維持するため、今回の目的は意味付け・監査連動であり買い目ロジックの閾値変更ではない。
