# v144 着順別評価・終端評価接続

- v143で分離した raw ability / role context / final placement を終端生成まで追跡。
- FIRST / SECOND / THIRD の各段階で final placement score を明示入力として使用。
- 1着成立後は残り全員を2着として再評価。
- 1-2着成立後は残り全員の3着条件を先に生成してから評価。
- SECOND の score>0 フィルタを廃止し、score を理由に生成候補を削除しない。
- positionTerminalConnectionAudit を追加し、着順別入力・全候補再評価・終端完成・確率付与順を監査。
- 購入分類・本線/押さえ分類・資金配分は変更しない。
