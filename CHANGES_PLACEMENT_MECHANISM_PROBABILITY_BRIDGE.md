# v128 2着・3着メカニズム確率連動

v127でSECOND/THIRD条件へ接続した riderEvaluationV2 のメカニズムスコアを、
条件付き確率の「小さな調整」にだけ使うようにした。

- 5.0を中立
- スコアが高いほど該当メカニズム条件確率を上げる
- スコアが低いほど下げる
- 調整幅は最大±12%
- 条件確率は0.12〜0.95に制限
- baseProbability と adjustedProbability を両方保存
- riderEvaluationV2スコアを直接確率とは扱わない

終端生成・買い目削除ルールは変更しない。
