# v153 Combination completeness audit

- 1着・2着・3着候補が個別に残っているのに、購入可能な1-2-3組み合わせだけが消える経路を監査。
- 選択済み1-2枝ごとに、3着専用工程・実終端・最終購入分類を突き合わせる `combinationCompletenessAudit` を追加。
- 3着クラスタで選ばれた候補が全て後段分類不能でも、通常のMAIN/COVER条件を満たす3着終端が同じ1-2枝内に存在する場合、その最強1本だけを `COMBINATION_CLASSIFIABLE_RECOVERY` として復元。
- 弱い終端の昇格、別ペア間の候補直積、固定点数追加は行わない。
