# SHADOW_PARAMETER_LAB 234R以降 固定variant開始報告

## 判定

- verdict: `SHADOW_CONFIRMATION_READY`
- 233Rまで: `EXPLORATION / HYPOTHESIS_FORMATION`
- 234R以降: `CONFIRMATION_FROM_234`
- 現在の累積相当: 277R（探索233R + 初回確認44R）
- 初回確認race: `20260921-62-1` から44R
- 300R到達まではvariant値を固定し、production採用判断をしない。

## readinessと固定variant

- PAIR_DIRECTION: SHADOW_READY（terminalScoreにpairNaturalConvergenceScoreを0 / 0.1 / 0.2 / 0.3でblend）
- ELIGIBILITY: SHADOW_READY（`DIFFUSE_CLUSTER_EXCEEDS_BUDGET`だけをbudget比1.0 / 1.1 / 1.2で評価）
- CLIFF: SHADOW_READY（保存済みscoreからproduction saved / max gap / gap+separation / plateau+slopeを仮想評価）
- THIRD_CONDITIONAL: SHADOW_READY（terminalScoreにthirdFamilyRelativeToBestを0 / 0.1 / 0.2 / 0.3でblend）
- variants total: 15。各テーマを独立評価し、直積探索はしていない。

## 初回44R

| theme | variant | rule | hit | ROI | exact survival | avg / p90 tickets | baselineとの差 | status |
|---|---|---|---:|---:|---:|---:|---|---|
| PAIR | BASELINE | blend 0 | 3 | 23.5% | 1 | 3.66 / 6 | — | BASELINE |
| PAIR | PAIR_WEAK | blend 0.1 | 4 | 37.2% | 1 | 3.66 / 6 | hit +1、ROI +13.7pt、pair rank 18.11→18.05 | NEUTRAL |
| PAIR | PAIR_MEDIUM | blend 0.2 | 4 | 37.2% | 1 | 3.66 / 6 | hit +1、ROI +13.7pt、pair rank 18.11→18.07 | NEUTRAL |
| PAIR | PAIR_STRONG | blend 0.3 | 6 | 48.9% | 1 | 3.66 / 6 | hit +3、ROI +25.3pt、pair rank 18.11→18.07 | PROMISING |
| ELIGIBILITY | BASELINE | budget ratio 1.0 | 3 | 23.5% | 1 | 3.66 / 6 | — | BASELINE |
| ELIGIBILITY | RELAX_WEAK | budget ratio 1.1 | 3 | 23.5% | 1 | 3.66 / 6 | rescue 0 | NEUTRAL |
| ELIGIBILITY | RELAX_MEDIUM | budget ratio 1.2 | 4 | 30.9% | 1 | 4.48 / 8 | rescue 1R / hit 1R、cap exceed 1R | WEAK |
| CLIFF | BASELINE | production saved | 3 | 23.5% | 1 | 3.66 / 6 | — | BASELINE |
| CLIFF | MAX_GAP | max adjacent gap | 2 | 12.1% | 1 | 3.34 / 10 | hit -1、wasted 45点 | WEAK |
| CLIFF | GAP_SEPARATION | gap + lower separation | 2 | 11.6% | 1 | 3.50 / 10 | hit -1、wasted 52点 | WEAK |
| CLIFF | PLATEAU_SLOPE | plateau end + slope | 3 | 39.2% | 1 | 1.91 / 4 | hit同数、救済1、wasted 16点 | NEUTRAL |
| THIRD | BASELINE | blend 0 | 3 | 23.5% | 1 | 3.66 / 6 | — | BASELINE |
| THIRD | THIRD_WEAK | blend 0.1 | 4 | 37.2% | 1 | 3.66 / 6 | hit +1、third rank/miss不変 | NEUTRAL |
| THIRD | THIRD_MEDIUM | blend 0.2 | 4 | 37.2% | 1 | 3.66 / 6 | hit +1、third rank/miss不変 | NEUTRAL |
| THIRD | THIRD_STRONG | blend 0.3 | 4 | 37.2% | 1 | 3.66 / 6 | hit +1、third rank/miss不変 | NEUTRAL |

PAIR方向missは全variantで21Rのまま改善なし。PAIR_STRONGはfinal simulated hitとROI、平均pair rankが改善した一方、reverse-onlyが0→5Rへ増えたため300Rまで継続確認する。rider winner Top1 / Top3は13 / 30で不変、点数増加もない。

購入不可はbaseline 11R。RELAX_MEDIUMだけが1Rを購入可能化し、その1Rは的中したがbudget cap超過1Rを伴うためWEAK。critical missingの購入可能化は0件。

cliffはPLATEAU_SLOPEが1件の正解terminalを救済し、平均点数3.66→1.91、p90 6→4、的中3件を維持した。ただし入替で失った的中もあり、追加wasted 16点、現時点はNEUTRAL。MAX_GAPとGAP_SEPARATIONはp90が10へ増え、的中も減った。

third variantsはfinal simulated hitが1件増えたが、exact third rank 2.52、third conditional miss 43R、exact survival 1Rが不変で、third改善とはまだ判定しない。

## manual run / daily

- manual SHADOW run: executed YES
- new races / confirmation evaluated: 44 / 44
- checkpoint changed: NO
- daily integration: YES。固定configを毎日の新規raceに適用し、checkpoint内のconfirmation累積へraceKey単位でidempotent mergeする。
- dry-run: `DAILY_VALIDATION_OK`、44R、15 variants、checkpoint changed NO。
- dry-run中に一時的なsealed classification欠落（42/44、次試行44/44）があり、既存の全体retryで解消した。
- 300R review artifact: `shadow-confirmation-300r-review-template.json`

## integrity / tests

- prediction / purchase / sealed result hash mismatch: 0 / 0 / 0
- production prediction / purchase / recommendation / THICK changed: NO / NO / NO / NO
- production cliff implemented: NO
- historical mutation: 0
- protected final used: 0
- result leakage: 0
- variant cross-contamination: 0
- idempotency: PASS
- daily checkpoint safety: PASS
- full suite: PASS
- JavaScript syntax errors: 0
- mobile: PASS（390px以下でvariant rowを1列化し、statusを表示）

## 制約

- 初回確認は44Rで、300R判定まで残り23R。PROMISINGは暫定表示でproduction採用を意味しない。
- pair方向miss、exact survival、third rank/missは改善していない。PAIR_STRONGのhit増だけでweightを採用しない。
- structure別の安定性は初回44Rだけでは確定しない。venue偏在とticket分布をdaily累積で継続監視する。
