# v145 印・展開・買い目 整合性監査

- v144の着順別評価→終端完成の流れは維持。
- 購入候補ごとに「1着/2着/3着印 → 同一着順終端 → 由来展開枝 → 買い目分類」を追跡する provenance audit を追加。
- 購入候補なのに生成終端が存在しない場合を high warning として検出。
- 終端まで存在しても由来展開枝IDを追跡できない買い目を high warning として検出。
- 本線で着順印が低い場合、展開による順位逆転の直接理由が記録されているか監査。
- 各買い目の trace row に category / terminal probability / branch IDs / branch labels / 着順別印 / classification reason を保存。
- 本線/押さえ/買える高配当の分類ロジック自体、資金配分は変更しない。
