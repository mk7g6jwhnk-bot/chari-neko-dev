# v137 買い目0件防止

終端生成に成功したレースでは purchasePlan が0件にならないようにする。

- 通常購入候補が1件以上: 従来どおり
- 通常購入候補が0件: 自然収束度・終端確率の上位から参考買い目を最低1件生成
- 参考買い目は referenceOnly=true
- LINE_DATA_UNAVAILABLE / MAIN_INVARIANT_FAILED / GIRLS_LEAD_EVIDENCE_UNAVAILABLE 等の見送り理由は noBet/noBetReason に残す
- 「買う推奨」と「0件にしない表示」を混同しない
- 5レース回帰テストを全レース >0 へ強化
