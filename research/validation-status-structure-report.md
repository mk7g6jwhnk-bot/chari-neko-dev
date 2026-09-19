# 検証ステータス・構造観測 実装報告

実装日: 2026-09-19 JST

Verdict: `VALIDATION_STATUS_AND_STRUCTURE_READY_WITH_LIMITS`

## 実装結果

- スマホ向け読み取り専用「検証状況」画面を追加した。
- 累積R、日次追加R、status、integrity、checkpoint、50R観測節目、300/500/1000R調整判断節目、scheduler、最新reportを表示する。
- 最新日次の的中・ROI、P3/P2/P1/P0、trio、評価印、warningを要約表示する。
- 保存済み発走前公式ラインからfieldSize、lineCount、soloCount、lineSizePatternを導出する。
- 構造別に成績、prediction distance、pair/reverse/third/purchase missを日次・累積集計する。
- ガールズとライン不明は推測せず、GIRLS / UNKNOWNとして分離する。
- structure artifactは`structure.json`へ保存する。

## Safe dry-run

- 新規確定・未検証: 24R
- 累積表示: 174R
- 構造利用可能: 23R
- UNKNOWN: 1R
- prediction / purchase / result mismatch: 0 / 0 / 0
- historical mutation: 0
- production write: 0
- 次の観測節目: 200R
- 次の調整判断節目: 300R

## Backfill

150R以前は既存のcompact artifactに公式ライン構造が保存されていないため、今回はbackfillしていない。結果からの逆算を避け、構造累積は今回以降の安全に再取得できた発走前情報から開始する。

## 制限

スマホUIが読む`validation-status.json`は配布時点の読み取り専用snapshotである。Windowsの日次処理で生成されるローカルartifactをNetlifyへ自動同期する経路は未接続のため、production配信後に最新値を継続表示するには、認証済みResearch-only同期または再deployが必要になる。予想・購入・recommendationへは接続していない。
