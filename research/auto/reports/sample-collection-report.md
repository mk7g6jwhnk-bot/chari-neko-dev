# オートレース基礎データ sample収集レポート

## 実行結果

- source: AutoRace.JP公式 `Program` / `OtherRaceInfo` / `RaceResult`
- 開催: 川口、2026-06-04
- race: 1R〜3R
- fetched: 3/3R
- snapshot: 6（TRIAL_AVAILABLE 3、RESULT_CONFIRMED 3）
- participants: pre 21、result 21
- trial available: 21/21
- result available: 3/3R
- fetch time: 2.281秒
- source HTTP/parser error: 0

## 品質監査

- duplicate race/snapshot: 0
- participant count mismatch: 0
- race identity mismatch: 0
- pre/result join failure: 0
- observedAt inversion: 0
- hash mismatch: 0
- result leakage: 0
- audit issue: 0

明示的missing entryは18件。各snapshotで以下3 fieldを `null` + reason付きで保持した。

- `race.laps`: 公式source未公開
- `race.windDirection`: 公式source未公開
- `race.trackMoisture`: 公式source未公開

また、machineNo、公式確定時刻、source server observedAt、構造化された試走コメントは未確認または取得不能のためnull。推測補完していない。

## 時点上の制約

このsampleは過去raceのreadbackであり、当時のcapture時刻を再現しない。全snapshotを `historicalReadback=true`、`sourceObservedAt=null` とした。Program由来の試走情報とRaceResult由来の結果は別snapshotに保存し、結果fieldをTRIAL_AVAILABLEへ混入させていない。

## 次段階候補

- live開催でPRE → TRIAL_AVAILABLE → FINAL_PRE_RACE → RESULT_CONFIRMEDを実時間収集
- `XML/Hold/Today` / Calendarを用いた開催・全race discovery
- 欠車、中止、再試走、湿/斑走路を含むfield coverage sample拡大
- raw蓄積後にのみ、試走タイム、同ハン比較、ST、湿走路適性、走路温度、内外、機力、recent formを研究候補として検討

予想、買い目、recommendation、SHADOW接続は未実装。
