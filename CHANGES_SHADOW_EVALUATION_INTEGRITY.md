# v129 シャドー評価整合性

現行とシャドーを同じ評価用確率質量へ正規化し、複数パッケージは1件ずつ孤立評価。package qualification / canaryはpackageOutcomesだけを使用。旧combined attribution記録は保持するが判定母数から除外。production snapshot・買い目・本番値は変更しない。
