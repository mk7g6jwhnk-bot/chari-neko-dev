# オートレース公式source監査

## 採用source

- `https://autorace.jp/race_info/`（公益財団法人JKAの公式レース情報）
- 公式ページ自身が利用する公開JSON経路: `Program` / `OtherRaceInfo` / `RaceResult`
- 開催確認候補: `XML/Hold/Today` / `XML/Calendar`

## field分類

安定取得可能:

- 開催場、日付、raceNo、race名、grade、距離、発走予定
- 選手コード、氏名、車番、ハンデ、級別、年齢、ランク、期別
- 競走車名、試走タイム、再試走、公式偏差
- 天候、気温、湿度、走路温度、走路状態コード
- 着順、競走タイム、ST、事故・反則コード、払戻、返還

現時点で取得不可または未確認:

- 周回数の明示値、風向、風速、走路水分量、machineNo
- 公式確定時刻、各sourceのサーバー観測時刻
- 公式コメント/試走コメントの安定した構造化field

不安定または注意が必要:

- ProgramはCSRF/sessionが必要で、HTML layout scrapingよりJSON経路を優先する
- 過去raceの再取得では当時のcapture時刻を復元できないため `historicalReadback=true`、`sourceObservedAt=null`
- trial未発表、欠車、再試走、中止時はnullとmissing reasonを保持し、推測補完しない
- `RaceResult`のfield名 `traialTime` は公式responseの綴りをraw保存し、正規化層だけで `trialTime` に写像する

## 時点安全性

- PRE/TRIAL snapshotはProgram + OtherRaceInfoだけから生成する
- RESULT_CONFIRMEDはRaceResultを別snapshotとして保存する
- result payloadをPRE/TRIALへコピーしない
- historical readbackはlive時点snapshotの代替とみなさない

## 未実装

- prediction、purchase、recommendation、weight、threshold、SHADOW接続
- production DB接続
- 結果を用いた事前feature生成
