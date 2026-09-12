# 2車単 canonical payout / abnormal metadata 基盤監査

実施日: 2026-09-12  
最終判定: `OFFICIAL_DATA_SOURCE_BLOCKED`

## 結論

Research-onlyのcanonical schema、abnormal fact schema、append-only collector、duplicate防止、bounded queue、retry、checkpoint、formal cohort selector、100円flat auditを実装した。ただし現行Railway公式結果経路は、JSJ046等の取得結果を `status / finishOrder / 3連単payout / source` に縮約してから返す。縮約前の2車単払戻と事故詳細へ、このrepositoryから接続できない。

このためforward production接続と93R backfillは実施していない。公式で確認できない値を推定せず、既存seal/resultも変更していない。

## 現行保存構造

| 情報 | 現行read projection | 判定 |
|---|---|---|
| 3連単払戻 | `officialResult.payout` | 取得可能 |
| 2車単払戻 | fieldなし | 取得不能 |
| cancelled | `status=cancelled` | 直接観測可能 |
| refund | `status=refund` をnormalize可能 | statusが提供された場合のみ可能 |
| 失格 | 独立fieldなし | UNKNOWN |
| 落車 | 独立fieldなし | UNKNOWN |
| 棄権 | 独立fieldなし | UNKNOWN |
| 審議 | 独立fieldなし | UNKNOWN |
| 不成立/raceVoid | 独立fieldなし | UNKNOWN |

`public/prediction-store.mjs` にはremarks等からexceptional raceを分離する処理があるが、現在のsealed result projectionまでremarks/incidentsが到達しない。着順から事故を逆算していない。

## 実race E2E

2026-09-10 武雄の保存済み5Rをread-only確認した。

| raceKey | status | result complete | canonical 2車単 | 独立abnormal facts | source |
|---|---|---:|---:|---:|---|
| 20260910-84-1 | confirmed | YES | NO | NO | JSJ046 |
| 20260910-84-2 | confirmed | YES | NO | NO | JSJ046 |
| 20260910-84-4 | cancelled | NO | NO | NO | JSJ040 |
| 20260910-84-5 | confirmed | YES | NO | NO | JSJ046 |
| 20260910-84-6 | confirmed | YES | NO | NO | JSJ046 |

- 公式結果取得率: 5/5 = 100%
- canonical 2車単払戻取得率: 0/5 = 0%
- 完全abnormal metadata取得率: 0/5 = 0%
- cancelled status直接識別: 1/1

resultOnlyのcold fetchでも `officialData.result` は同じ縮約形で、2車単payout/incident fieldsは得られなかった。これはNetlify側の表示projectionだけではなく、Railway response時点の欠落である。

## Schema

### EXACTA payout

`raceKey`, `betType=EXACTA`, `winningPair`, `payoutPer100`, `payoutStatus`, `officialSource`, `sourceObservedAt`, `sourceHash`, `canonical` を保持する。CONFIRMEDかつpair・金額・source・観測時刻・hashが揃う場合だけcanonicalになる。

### Abnormal facts

`raceCancelled`, `refundOccurred`, `disqualificationOccurred`, `fallOccurred`, `didNotFinish`, `raceVoid`, `abnormalResult`, `abnormalReason[]` をnullable booleanとして保存する。全必須factがbooleanで揃わない限り `abnormalStatusKnown=false`。落車factとformal除外policyは分離した。

## Append-only collector

- original recordを更新しない別enrichment record
- evidence payload由来SHA-256
- race/kind/sourceHash/schemaVersionによるduplicate-safe ID
- bounded queue
- retry / fail-open
- race checkpoint
- restart時は既存NDJSONのIDを再読込

production prediction collectorへの接続は行っていない。接続にはRailway parserが公式rawから2車単払戻と異常factを保持する新しいread/append経路が必要。

## Formal cohort policy

次を全て満たすraceだけを採用する。

1. result complete
2. purchase eligibilityがbooleanで既知
3. canonical EXACTA payoutがCONFIRMED
4. winningPairが有効
5. abnormal fact statusが既知
6. 明示的除外policyに該当しない

UNKNOWN abnormal statusを正常扱いしない。cancelled/refund/disqualification/didNotFinish/raceVoidは除外。`fallOccurred` は事実保存するが、除外policyは別レビューとした。

## Formal audit

- canonical payout取得率: 0%
- abnormal metadata取得率: 0%
- formal cohort: **0R**
- 2車単 formal hit rate: 算出不能
- 2車単 formal ROI: 算出不能
- 3連単との差: formal比較不能
- pair-only hit: formal 0R
- pair→third bottleneck: formalでは未確認

以前のstatus-clean参考93R（2車単30/93、3連単15/93、pair-only 15R）は正式KPIへ昇格していない。

## 次の解除条件

Railway公式result parserで、縮約前の公式responseから以下を保持する必要がある。

- winning EXACTA combination / payout per 100
- bet typeとpayout status
- source response hashとobservedAt
- cancelled/refund/disqualification/fall/DNF/voidの独立facts
- raw evidenceを保持しない場合でも、公式field名と値をhash対象にしたcanonical projection

この経路が用意された後、forward append-only接続を有効化し、新規5Rでcanonical率100%を確認してから93R backfillを再検討する。403〜502は評価・tuning対象にしない。

## 安全確認

- production prediction changed: NO
- production purchase changed: NO
- Research baseline changed: NO
- historical mutation: 0
- production write: 0
- production write内容は新規append-only performance/enrichmentだけか: 該当なし（接続を見送り、write 0）
- 403〜502 tuning use: NO
