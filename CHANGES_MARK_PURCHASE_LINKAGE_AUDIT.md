# v94 印→着順評価→買い目 接続監査

今回の違和感:
- 1着印◎なのに本線頭0
- 1着印○以下の頭が本線を独占
- 1着印△以下の穴頭が高配当枠を大量独占
- 2着印◎/3着印◎なのに該当着順の購入終端がない

## 方針
印を買い目へ強制的に合わせない。
展開による順位逆転は許容するが、その場合は主展開・位置・自然収束の直接根拠を要求する。

## 監査
- FIRST_MARK_NO_MAIN_HEAD
- FIRST_MARK_MAIN_HEAD_INVERSION
- NON_TOP_FIRST_MARK_MAIN_DOMINANCE
- LOW_FIRST_MARK_HIGH_HEAD_MONOPOLY
- SECOND_MARK_NO_SECOND_BET
- THIRD_MARK_NO_THIRD_BET
- OVERALL_MARK_* 系

保存買い目に自然収束度・main枝直接支持・branch-head一致・主展開ラベルを追加し、
印とのズレを画面上で説明できるようにした。

今回はまず接続異常を正確に露出する監査。印を後から買い目に合わせる補正はしない。
