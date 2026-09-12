# Official winning method / AUTO_DIRECT audit

実施日: 2026-09-12  
Verdict: `OFFICIAL_WINNING_METHOD_SOURCE_BLOCKED`

## 1. Source実態

分類は **C: 現行official source経路では決まり手を取得していない**。加えて、将来upstreamがfieldを返しても現行Netlify `normalizeResult` が返却projectionから落とすため、Bの潜在欠落もある。

- Railway `GET /keirin/race?resultOnly=1` 実race監査: `officialData.result` は `status / finishOrder / payout / source=JSJ046`のみ。`winningMethod`なし。
- Netlify `keirin-result`: 同じ4項目へ縮約。実測HTTP 200、29.237秒、243 bytes、`winningMethod`なし。
- sealed-result: `officialResult`に決まり手なし。既存20Rすべて同じ。
- result worker: `saveResult`は`result.winningMethod`を保存可能だが、入力に使う`normalizeResult`が決まり手を返さないため現在はnull。
- local Research adapter: fieldがあれば渡せるが、入力projectionが欠損。

着順・払戻・選手傾向から決まり手を推定していない。production fetch/parser/projection/sealed originalには変更を加えていない。

## 2. Research-only実装

`OFFICIAL_WINNING_METHOD_ENRICHMENT_V1`を追加した。`raceKey / source / winningMethod / sourceValue / sourceTimestamp / fetchedAt / sourceHash / canonical / status / evidence`を持ち、原本とは別のappend-onlyファイルとして保存する。

canonical enumは`ESCAPE / MAKURI / DIFFERENCE / MARK / UNKNOWN`。完全一致する公式表記だけを正規化し、それ以外はUNKNOWN。source errorはUNKNOWNと区別して`SOURCE_ERROR`にできる。

公式fieldが将来到達した場合のAUTO_DIRECT規則も実装・テストした。

- 逃げ: `ATTACK_OUTCOME=ESCAPE_SUCCESS` + `INITIATIVE=ACQUIRED`
- 捲り: `ATTACK_OUTCOME=MAKURI_SUCCESS`
- 差し: `ATTACK_OUTCOME=DIFFERENCE_SUCCESS`
- マーク: `ATTACK_OUTCOME=MARK_FINISH`

決まり手だけからCLEAN/CONTESTED/LONG_LEAD、ENERGY_STATE、BANTE_RESPONSE、LINE_TRACKING_FAILURE、SWITCH、被捲り、LINE_COLLAPSE、OTHER_LINE_SURVIVALをCONFIRMEDにしない。pair/purchaseへ接続していない。

## 3. Retro 20R

- tested: 20R
- winning method available: 0R
- UNKNOWN: 20R
- source HTTP failure: 0
- append-only enrichment: 20
- AUTO_DIRECT: 0
- STRONG_PROXY: 41（既存と不変）
- 2回目評価のduplicate suppression: 20
- original action tag / sealed result mutation: 0

AUTO_DIRECT > STRONG_PROXY > MANUAL_REVIEWの優先規則は既存dedupeに維持され、同一rider/state/valueの重複は保存しない。retro既存STRONG_PROXYは破壊していない。

## 4. New live E2E

新規10〜20Rの追加取得は実施しなかった。retro 20RとRailway直接監査の双方で公式決まり手が0件であり、同じsourceを反復してproductionに負荷を加えてもAUTO_DIRECTの成立可能性がないためである。これはaccuracy/tuning判断ではなくsource contractの欠落による停止。

production result GETの実測は29.237秒、Railway直接監査は24.386秒かつHTTP 422（result自体は返るがparticipants欠損）。この高latency経路を20R反復しないことが安全と判断した。502/503/timeoutは0。

## 5. Memory / integrity

- local heap: 5,615,576 → 6,355,456 bytes
- local RSS: 39,124,992 → 45,563,904 bytes（peak観測値45,563,904）
- enrichment storage latency: 20R全体1秒未満
- collector/browser/storage: 直前live gateでhealthy / connected、failureCount 0、lastError null
- enrichment process restart/duplicate再実行: PASS（append 0、duplicate 20）
- prediction hash mismatch: 0
- purchase hash mismatch: 0
- sealed original hash changed: NO

RailwayのRSS/heapは公開statusにないため数値取得不能。production runtimeにコードをdeployしておらず、今回のlocal Research処理がproduction memoryを増やす経路はない。

## 6. Remaining blocker

公式取得serviceが、公式に明示された決まり手とそのsource timestamp/evidenceをread-only responseへ含める必要がある。安全な順序は、公式source parserで決まり手を直接取得し、sealed originalを書き換えず専用Research projectionへ返すこと。そのsource契約が整うまでAUTO_DIRECTは0のままが正しい。

## Safety

- production prediction changed: NO
- production purchase changed: NO
- production UI changed: NO
- Research baseline changed: NO
- historical mutation count: 0
- result-aware tuning: NO
- UNKNOWN imputation: NO
- sealed original mutation: 0
- production write: 0
