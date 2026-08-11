# v139 並び未取得時の全員MAIN化防止

v138で0件の根本原因を修正した結果、ライン未取得かつ選手評価が横並びのケースで44点まで膨張した。

原因:
- UNKNOWNを適切に扱ったことで不要な別線ペナルティは消えた。
- しかし選手評価が実質同値でも、ライン非依存MAIN枝が全選手に成立し、全員がMAIN候補になった。
- 「未知を悪材料にしない」と「全員を同格MAINにする」を混同していた。

修正:
- lineFallbackDiscriminationAudit を追加。
- 1着/2着/3着評価のspread、先行/まくりmechanism spread、1着family mass差を監査。
- ライン未取得でも十分な選手差があれば通常購入を継続。
- 差が不足していれば LINE_FALLBACK_INSUFFICIENT_DISCRIMINATION で noBet。
- ただしv137のnonzero reference planにより最低1件の参考買い目は残す。
- 終端・全候補は削除せず、購入表示だけを抑制。
- 固定点数上限による圧縮ではない。
