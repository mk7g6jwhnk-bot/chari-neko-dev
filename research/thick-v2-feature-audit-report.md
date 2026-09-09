# THICK_V2 feature audit / shadow evaluation

## 結論と実施範囲

**NO_THICK_V2_CANDIDATE**（安全に評価できる22R限定）。現行RELATIVE_ONLYを絶対信頼型へ置き換える候補は、今回の情報からは成立していない。UI不一致は修正・commit済み、THICK_V2のproduction採用は行わない。

今回の特徴監査は「全確定V2の完全な解析」ではない。前回保存した監査成果物にある114確定V2のうち、既存303〜402コホートmetadataとraceKeyが一致する22Rだけを採用した。残る92Rは403〜502との重複を否定できないため、特徴・結果を候補評価へ渡していない。日付順で403境界を推測していない。新しいproduction抽出や一時SSH鍵の操作はしていない。

購入可18R、MAIN48点。その内訳はTHICK hit 1 / miss 12、MAIN non-thick hit 1 / miss 34。最新production全件・欠損した保存フィールドの復元には追加の安全なexportが必要だが、今回は秘密情報操作を開始せず、既存資料で実行できる範囲を完了した。

従って、ここでのNO_CANDIDATEは「絶対信頼型THICKが原理的に作れない」という判定ではなく、今回固定した3仮説と利用可能な証拠についての判定。

## 1. UI single source of truth

原因：prediction-storeのselectionRowsがbranchFitなどを落とし、deriveThickBetsがその不完全な証拠から再計算していた。

修正：

- createSnapshotで保存済みthickQualifiedとpredictionQualificationScoreを引き継ぐ。canonicalPurchasePlan.standardTicketsがある場合はその保存flagを優先する。
- deriveThickBetsは保存flagだけを読む。qualifyThickPredictionBetsを呼び出さない。qualifyThickPredictionBets本体は変更していない。
- flag欠落のlegacyはUNAVAILABLE_LEGACYとし、UIが新しい厚めを発明しない。過去のローカルキャッシュを書き換えるmigrationは実行しない。flag未保存の既存キャッシュは、元の保存predictionから再読込するまで厚め表示なし。
- ローカル保存の容量不足による圧縮でもflag・保存scoreを保持。
- MAINのorder・件数・category・元payload・purchaseEligibilityは変更しない。

結果を用いない202Rの保存flag/order回帰で一致。直近100Rは保存THICKあり44R＝UI44R。4不一致Rはすべて厚め表示なしへ戻る。
20260909-61-6 / 20260909-44-8 / 20260909-21-7 / 20260908-13-9。
UI回帰で使ったのは保存flagとticket identityのみ。保護対象の結果・score・quality・Research順位を使って候補評価したものではない。

UI commit: **6e85cfb**。push/deployなし。稼働中productionのUIはまだ変更されていない。

## 2. コホート・特徴の定義

source: research/thick-readonly-audit-results.json（前回の固定スナップショット）。
allowlist: research/thick-v2-shadow-cohort.json（303〜402 metadataの100 raceKey、実際に重なる確定V2は22R）。

outcomeは許可raceKeyの完全なTHICK/MAIN非THICK的中ledgerだけから復元し、非掲載MAIN ticketはmiss。元のraw/seal/resultを編集していない。保護レコードはraceKeyによるmembership判定後に除外し、特徴・払戻にアクセスするgetterを例外にしたテストで境界を確認。

terminalModelScoreは保存terminal weightで、校正済み的中確率ではない。normalized terminal massは分母が前回診断成果物に残っていないためUNKNOWN。scenarioSupportとscenario massは同じ値として扱わない。mainRankはqualification score順、mainQualificationGapは同scoreの1位2位差、mainModelGapはterminal model scoreの1位2位差。firstRankの原値はUNKNOWNで、保存された派生first mass順位は別feature。

scenarioFamily / scenarioMass / scenarioRank / normalizedTerminalMass / firstRank原値 / firstSupport / pairSupport / thirdVariantStatus / ambiguityRescue / raceTicketCountは利用可能な診断成果物に存在せずUNKNOWN。保存Volume自体にも存在しないと断定したわけではない。branchSupportの配列からscenario familyを推測しない。MAIN件数から全race点数を推測しない。AMBIGUITY_ONEの由来が記録されていない場合、falseと決めつけない。

## 3. A/B/C/D特徴比較

表中は中央値 [p25,p75]。カテゴリ列は分布。hit各1点のquartileはその1点の値であり、分布や共通条件の証明ではない。

| feature | THICK hit (1) | THICK miss (12) | MAIN非THICK hit (1) | MAIN非THICK miss (34) |
|---|---|---|---|---|
| terminalModelScore | 0.013719 [0.013719, 0.013719] | 0.013086 [0.012449, 0.013896] | 0.012791 [0.012791, 0.012791] | 0.011665 [0.010899, 0.013066] |
| normalizedTerminalMass | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| mainRank | 1 [1, 1] | 1 [1, 1] | 2 [2, 2] | 2 [2, 3.75] |
| mainQualificationGap | 0.125027 [0.125027, 0.125027] | 0.055119 [0.036174, 0.128122] | 0.033033 [0.033033, 0.033033] | 0.063708 [0.038033, 0.074369] |
| mainModelGap | 0.000589 [0.000589, 0.000589] | 0.000321 [0.000144, 0.000524] | 0.000153 [0.000153, 0.000153] | 0.000301 [0.000104, 0.000419] |
| scenarioFamily | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| scenarioMass | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| scenarioRank | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| scenarioSupport | 0.124322 [0.124322, 0.124322] | 0.11194 [0.101915, 0.117264] | 0.097673 [0.097673, 0.097673] | 0.124322 [0.103454, 1] |
| concentration | {"LOW":1} | {"HIGH":10,"LOW":1,"MEDIUM":1} | {"HIGH":1} | {"HIGH":30,"LOW":3,"MEDIUM":1} |
| firstRank | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| derivedFirstMassRank | 1 [1, 1] | 1 [1, 1] | 1 [1, 1] | 1 [1, 1] |
| firstSupport | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| pairRank | 1 [1, 1] | 1 [1, 1] | 1 [1, 1] | 1 [1, 1] |
| pairMassRank | 1 [1, 1] | 1 [1, 2] | 2 [2, 2] | 2 [1, 3] |
| pairSupport | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| branchSupport | {"LEAD-A / MAKURI-A / SEPARATION / BATTLE":1} | {"MAKURI-A / LEAD-A / BATTLE / SEPARATION":4,"LEAD-B / MAKURI-B / SEPARATION / BATTLE":1,"MAKURI-B / LEAD-B / BATTLE / SEPARATION":1,"MAKURI-C / LEAD-C / BATTLE / SEPARATION":2,"BATTLE":1,"MAKURI-A / LEAD-A / SEPARATION / BATTLE":3} | {"MAKURI-A / LEAD-A / BATTLE / SEPARATION":1} | {"MAKURI-A / LEAD-A / BATTLE / SEPARATION":3,"LEAD-B / MAKURI-B / SEPARATION / BATTLE":2,"MAKURI-B / LEAD-B / BATTLE / SEPARATION":1,"MAKURI-A / LEAD-A / SEPARATION / BATTLE":9,"MAKURI-C / LEAD-C / BATTLE / SEPARATION":2,"LEAD-A / MAKURI-A / SEPARATION / BATTLE":3,"BATTLE":14} |
| branchSupportCount | 4 [4, 4] | 4 [4, 4] | 4 [4, 4] | 4 [1, 4] |
| branchFit | 1 [1, 1] | 1 [0.998617, 1] | 0.988144 [0.988144, 0.988144] | 0.960545 [0.936825, 0.984189] |
| naturalBoundaryRank | 1 [1, 1] | 1 [1, 1.25] | 2 [2, 2] | 2.5 [2, 4] |
| naturalConvergence | 0.496843 [0.496843, 0.496843] | 0.366576 [0.359706, 0.501986] | 0.507359 [0.507359, 0.507359] | 0.307441 [0.303462, 0.365705] |
| thirdVariantStatus | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| ambiguityRescue | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| quality | {"LOW":1} | {"LOW":11,"HIGH":1} | {"LOW":1} | {"LOW":20,"HIGH":14} |
| display | {"注意":1} | {"注意":11,"通常":1} | {"注意":1} | {"注意":20,"通常":14} |
| mainTicketCount | 3 [3, 3] | 2 [2, 2] | 2 [2, 2] | 6 [2, 6] |
| raceTicketCount | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

## 4. LOWでも当たるTHICK / HIGHでも外れるTHICK

| group | n | model score中央値 | natural convergence中央値 | scenario support中央値 | concentration |
|---|---:|---:|---:|---:|---|
| LOW_THICK_HIT | 1 | 0.013719 | 0.496843 | 0.124322 | {"LOW":1} |
| LOW_THICK_MISS | 11 | 0.013227 | 0.367612 | 0.109468 | {"HIGH":9,"LOW":1,"MEDIUM":1} |
| HIGH_THICK_HIT | 0 | — | — | — | null |
| HIGH_THICK_MISS | 1 | 0.008769 | 0.299462 | 1 | {"HIGH":1} |

唯一のLOW THICK hitは20260908-37-4、4-5-3、払戻4740円。MAIN順位1、pair内順位1、派生first/pair mass順位1、branch support 4系統、branchFit=1。model score=0.013719、natural convergence=0.496843、scenario support=0.124322、MAIN qualification gap=0.125027。

LOW miss11点もMAIN順位1、branch support中央値4、branchFit中央値1であり、これらだけでは識別できない。hitの自然収束やgapはmiss中央値より大きいが、missの上位quartileと重なる。hit1点なので「LOWでも当たる共通条件」は確立できない。LOWを除くと唯一の厚め的中を失う。

HIGH THICK hitは0点、HIGH missは1点だけ。HIGH・HIGH concentration・scenario support約1でも外れた例はあるが、HIGH missの共通パターンとは呼べない。MEDIUM qualityは比較材料なし。現行T1/T2は不採用のまま。

## 5. 単変量の識別力

以下のthresholdは結果比較前に固定した探索用仮説。表はTHICK hit1/miss12のretained hit / removed miss。欠損による除外は既知値による識別と分ける。全MAINの同指標、各群missing率、カテゴリ分布もJSONに保存。

AUCはP(hit値>miss値)+0.5×P(tie)の記述値で、低い順位の方が良いfeatureでは方向に注意。ticketはrace内で相関し、hit1点しかない。p値・一般化性能・校正性能の主張には用いない。

| feature | hit中央値 [p25,p75] | miss中央値 [p25,p75] | effect direction | missing hit/miss | 固定条件 | retained hit | removed miss（うちUNKNOWN） |
|---|---|---|---|---|---|---:|---|
| terminalModelScore | 0.013719 [0.013719, 0.013719] | 0.013086 [0.012449, 0.013896] | HIGHER_IN_HITS | 0.00% / 0.00% | >= 0.02 | 0 | 12 (0) |
| normalizedTerminalMass | UNKNOWN | UNKNOWN | UNDETERMINED | 100.00% / 100.00% | >= 0.02 | 0 | 12 (12) |
| mainRank | 1 [1, 1] | 1 [1, 1] | EQUAL_MEDIAN | 0.00% / 0.00% | <= 1 | 1 | 0 (0) |
| mainQualificationGap | 0.125027 [0.125027, 0.125027] | 0.055119 [0.036174, 0.128122] | HIGHER_IN_HITS | 0.00% / 0.00% | >= 0.05 | 1 | 5 (0) |
| mainModelGap | 0.000589 [0.000589, 0.000589] | 0.000321 [0.000144, 0.000524] | HIGHER_IN_HITS | 0.00% / 0.00% | >= 0.005 | 0 | 12 (0) |
| scenarioFamily | UNKNOWN | UNKNOWN | UNDETERMINED | 100.00% / 100.00% | 未定義 | — | — |
| scenarioMass | UNKNOWN | UNKNOWN | UNDETERMINED | 100.00% / 100.00% | >= 0.5 | 0 | 12 (12) |
| scenarioRank | UNKNOWN | UNKNOWN | UNDETERMINED | 100.00% / 100.00% | <= 1 | 0 | 12 (12) |
| scenarioSupport | 0.124322 [0.124322, 0.124322] | 0.11194 [0.101915, 0.117264] | HIGHER_IN_HITS | 0.00% / 0.00% | >= 0.5 | 0 | 11 (0) |
| concentration | {"LOW":1} | {"HIGH":10,"LOW":1,"MEDIUM":1} | UNDETERMINED | 0.00% / 0.00% | == HIGH | 0 | 2 (0) |
| firstRank | UNKNOWN | UNKNOWN | UNDETERMINED | 100.00% / 100.00% | <= 1 | 0 | 12 (12) |
| derivedFirstMassRank | 1 [1, 1] | 1 [1, 1] | EQUAL_MEDIAN | 0.00% / 0.00% | 未定義 | — | — |
| firstSupport | UNKNOWN | UNKNOWN | UNDETERMINED | 100.00% / 100.00% | >= 0.5 | 0 | 12 (12) |
| pairRank | 1 [1, 1] | 1 [1, 1] | EQUAL_MEDIAN | 0.00% / 0.00% | <= 1 | 1 | 0 (0) |
| pairMassRank | 1 [1, 1] | 1 [1, 2] | EQUAL_MEDIAN | 0.00% / 0.00% | <= 1 | 1 | 5 (0) |
| pairSupport | UNKNOWN | UNKNOWN | UNDETERMINED | 100.00% / 100.00% | >= 0.5 | 0 | 12 (12) |
| branchSupport | {"LEAD-A / MAKURI-A / SEPARATION / BATTLE":1} | {"MAKURI-A / LEAD-A / BATTLE / SEPARATION":4,"LEAD-B / MAKURI-B / SEPARATION / BATTLE":1,"MAKURI-B / LEAD-B / BATTLE / SEPARATION":1,"MAKURI-C / LEAD-C / BATTLE / SEPARATION":2,"BATTLE":1,"MAKURI-A / LEAD-A / SEPARATION / BATTLE":3} | UNDETERMINED | 0.00% / 0.00% | 未定義 | — | — |
| branchSupportCount | 4 [4, 4] | 4 [4, 4] | EQUAL_MEDIAN | 0.00% / 0.00% | >= 2 | 1 | 1 (0) |
| branchFit | 1 [1, 1] | 1 [0.998617, 1] | EQUAL_MEDIAN | 0.00% / 0.00% | >= 0.8 | 1 | 1 (0) |
| naturalBoundaryRank | 1 [1, 1] | 1 [1, 1.25] | EQUAL_MEDIAN | 0.00% / 0.00% | <= 3 | 1 | 1 (0) |
| naturalConvergence | 0.496843 [0.496843, 0.496843] | 0.366576 [0.359706, 0.501986] | HIGHER_IN_HITS | 0.00% / 0.00% | >= 0.5 | 0 | 8 (0) |
| thirdVariantStatus | UNKNOWN | UNKNOWN | UNDETERMINED | 100.00% / 100.00% | == NONE | 0 | 12 (12) |
| ambiguityRescue | UNKNOWN | UNKNOWN | UNDETERMINED | 100.00% / 100.00% | == false | 0 | 12 (12) |
| quality | {"LOW":1} | {"LOW":11,"HIGH":1} | UNDETERMINED | 0.00% / 0.00% | == HIGH | 0 | 11 (0) |
| display | {"注意":1} | {"注意":11,"通常":1} | UNDETERMINED | 0.00% / 0.00% | == 通常 | 0 | 11 (0) |
| mainTicketCount | 3 [3, 3] | 2 [2, 2] | HIGHER_IN_HITS | 0.00% / 0.00% | <= 3 | 1 | 0 (0) |
| raceTicketCount | UNKNOWN | UNKNOWN | UNDETERMINED | 100.00% / 100.00% | <= 6 | 0 | 12 (12) |

MAIN qualification gap>=0.05はhit1を維持しmiss5を除いた。しかしこれは相対的なgapであり、絶対信頼型への解決ではない。結果を見てこれを新候補へ追加したり既存候補を緩めたりしていない。branchFit>=0.8はhit1を維持するがmiss除去は1点だけ。自然収束>=0.5はhit値0.496843も落とすため、閾値を0.49などへ後付け変更していない。

## 6. THICK_V2の事前固定定義

frozenAt: 2026-09-09T23:13:52.872Z

definition SHA256: d18349bbe4fb82484efb447d57172330b6ab7decc24e05aaacf6c6ed2006aa65

- V2-A：MAINのterminal model score>=0.02 **かつ** natural convergence>=0.5。
- V2-B：firstSupport / pairSupport / scenarioSupportのうち、>=0.5を2系統以上。欠損は成立数へ数えない。
- V2-C：保存CONTROL厚め **かつ** terminal model score>=0.02。

A/Bは既存MAINの範囲でラベルだけを評価、CはCONTROLのsubset。新規買い目生成なし。数字は丸い値による事前の探索仮説で、学習済み・校正済みの絶対信頼閾値ではない。前回の結果を新規holdoutと呼ばない。

成功guardrails：CONTROL的中の80%以上、CONTROL払戻の80%以上を維持、ROI非悪化、1万円以上のCONTROL的中を外さない。件数削減だけでは成功にしない。今回は1万円以上のCONTROL的中が0なので高払戻保護の実証は不能。READYには別の未使用データでの検証が必要で、この記述評価だけからREADYを返さない。

## 7. shadow結果

| candidate | 厚めR | 点数 | 購入可Rに対する率 | hit点 | ticket hit率 | 投資 | 払戻 | ROI | 外す的中 | LOW R/点 | 注意 R/点 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| CONTROL | 13 | 13 | 72.22% | 1 | 7.69% | 1300 | 4740 | 364.62% | 0 | 12/12 | 12/12 |
| V2-A | 0 | 0 | 0.00% | 0 | — | 0 | 0 | — | 1 | 0/0 | 0/0 |
| V2-B | 0 | 0 | 0.00% | 0 | — | 0 | 0 | — | 1 | 0/0 | 0/0 |
| V2-C | 0 | 0 | 0.00% | 0 | — | 0 | 0 | — | 1 | 0/0 | 0/0 |

全案ともCONTROLの唯一の的中4-5-3（20260908-37-4、4740円）を厚め対象から外す。MAIN自体は維持するため、元の購入的中が消えるという意味ではない。元からCONTROL非厚めの新しい的中を加える案も0。

V2-A/C：model score下限を超える厚め候補がない。V2-B：first/pair supportがUNKNOWNで2系統一致を確認できない。Bの0件は特徴が効かない証拠ではなく、評価に必要な証拠の不足。投資0のROIは0%ではなく未定義（—）。

### concentration別

| candidate | concentration | eligible R | 厚めR/点 | hit点 | 投資 | 払戻 | ROI |
|---|---|---:|---:|---:|---:|---:|---:|
| CONTROL | HIGH | 15 | 10/10 | 0 | 1000 | 0 | 0.00% |
| CONTROL | MEDIUM | 1 | 1/1 | 0 | 100 | 0 | 0.00% |
| CONTROL | LOW | 2 | 2/2 | 1 | 200 | 4740 | 2370.00% |
| V2-A | HIGH | 15 | 0/0 | 0 | 0 | 0 | — |
| V2-A | MEDIUM | 1 | 0/0 | 0 | 0 | 0 | — |
| V2-A | LOW | 2 | 0/0 | 0 | 0 | 0 | — |
| V2-B | HIGH | 15 | 0/0 | 0 | 0 | 0 | — |
| V2-B | MEDIUM | 1 | 0/0 | 0 | 0 | 0 | — |
| V2-B | LOW | 2 | 0/0 | 0 | 0 | 0 | — |
| V2-C | HIGH | 15 | 0/0 | 0 | 0 | 0 | — |
| V2-C | MEDIUM | 1 | 0/0 | 0 | 0 | 0 | — |
| V2-C | LOW | 2 | 0/0 | 0 | 0 | 0 | — |

### MAIN non-thick比較

MAIN non-thickは18R・35点、hit1点、ticket hit率2.86%、投資3500円・払戻1240円・ROI35.43%。CONTROLは13R・13点、hit1点、投資1300円・払戻4740円・ROI364.62%。どちらも的中1点のため、増額価値や将来ROIを推定できる標本ではない。

## 8. audit fieldと最終判定

各ticket・候補にcandidateAuditを保存：absoluteSupport.checks（値、閾値、既知/欠損、成立）、relativeSupport（保存CONTROL要件と成立）、reason、role.mainRelativeStrength、role.allocationCandidate。

これにより「MAIN内の相対上位」と「絶対条件を通ったshadow増額候補」を別軸で扱える。UNKNOWNによる保留と既知値の条件不成立も区別。現在のproduction UIへV2やResearchを接続していない。

**NO_THICK_V2_CANDIDATE**。今回、絶対信頼の問題は解消できたとは報告しない。単に数値下限を追加しても、校正された増額価値にはならない。必要なのは保護対象外の追加データと、normalized mass・first/pair support・scenario provenanceを保持した事前証拠。今回の1的中へ条件を合わせない。shadow liveも開始しない。

## 9. safety / tests

prediction ranking changed: NO

MAIN tickets changed: NO

purchase eligibility changed: NO

Research ranking changed: NO

weights changed: NO

thresholds production changed: NO

historical records changed: NO

production write: 0

403〜502 tuning use: NO

403〜502 feature/outcome evaluation use: NO

V2-A/B/C thresholds changed after outcomes: NO

T1/T2 adopted: NO

secret/private key/token operations: NONE in this turn

UI修正はローカルコードのみ。保存purchaseの資格計算は未変更。historical migration、raw/seal/result/audit history更新、push/deployなし。元のthick-readonly成果物は変更しない。

検証：202R flag-only UI回帰（直近44=44・4不一致修正）、canonical優先、legacy無再計算、gate、容量圧縮、資金配分preview、prediction save/reload/result matching、MAIN/COVER整合、scenario/purchase整合、V2固定hash、保護対象getter禁止、候補へのoutcome getter禁止、結果差替え時の候補不変、UNKNOWN処理、22R集計再現、入力非破壊。

## 10. 成果物とcommit

- research/thick-v2-feature-audit-report.md：本報告
- research/thick-v2-shadow.mjs：read-only adapter・特徴監査・shadow評価・説明
- research/thick-v2-shadow-definition.json：事前固定条件
- research/thick-v2-shadow-cohort.json：403未満membershipのmetadata
- research/thick-v2-shadow-results.json：4群・単変量・候補比較・全48 MAIN ticketのaudit
- tests/thick-saved-decision-ui.mjs / tests/thick-v2-shadow.mjs

UI一致修正commit: 6e85cfb。
research-only commit: 最終応答に記載。

再現：node research/thick-v2-shadow.mjs（stdoutのみ、production接続なし）。
