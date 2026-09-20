import fs from'node:fs/promises';
import { evaluatePredictionDistance } from'./prediction-distance-evaluation.mjs';
import { auditSavedTerminalDiagnosis, summarizeTerminalSurvival } from'./terminal-survival-audit.mjs';

const root=new URL('./',import.meta.url);
const source=JSON.parse(await fs.readFile(new URL('prediction-distance-100r-source.json',root),'utf8'));
const checkpoint=JSON.parse(await fs.readFile(new URL('daily-validation/checkpoint.json',root),'utf8'));
const evaluation=evaluatePredictionDistance(source);
const currentDaily=JSON.parse(await fs.readFile(new URL('daily-validation/2026-09-20/prediction-distance.json',root),'utf8'));
const audited=[...evaluation.terminalSurvival.races,...currentDaily.races.map(auditSavedTerminalDiagnosis)];
const total=checkpoint.processedRaceKeys.length;
const reconstructedKeys=new Set(audited.map(row=>row.raceKey));
const unavailable=checkpoint.processedRaceKeys.filter(key=>!reconstructedKeys.has(key));
const artifact={schemaVersion:'TERMINAL_SURVIVAL_BACKFILL_V2',generatedAt:new Date().toISOString(),source:'saved pre-result trace only',definitionChanged:false,resultAwareRegeneration:false,protectedFinalUsed:0,latestDaily:{date:'2026-09-20',summary:summarizeTerminalSurvival(currentDaily.races.map(auditSavedTerminalDiagnosis))},summary:summarizeTerminalSurvival(audited,{unreconstructable:unavailable.length}),races:audited,unreconstructable:{count:unavailable.length,reason:'SAVED_TERMINAL_TRACE_NOT_AVAILABLE',raceKeys:unavailable},integrity:evaluation.integrity,safety:{productionPredictionChanged:false,productionPurchaseChanged:false,recommendationChanged:false,thickChanged:false,tuningPerformed:false,historicalMutation:0}};
await fs.writeFile(new URL('terminal-survival-backfill-v2.json',root),`${JSON.stringify(artifact,null,2)}\n`);
const s=artifact.summary;
await fs.writeFile(new URL('terminal-survival-backfill-v2-report.md',root),`# Terminal survival backfill V2\n\n- total: ${s.races}R\n- fully reconstructable: ${s.reconstructed}R\n- partially reconstructable: ${s.partiallyReconstructed}R\n- UNKNOWN / trace unavailable: ${s.unreconstructable}R\n- GENERATED / MEANINGFUL / PURCHASE_CANDIDATE / FINAL_PURCHASE: ${s.stages.GENERATED} / ${s.stages.MEANINGFUL} / ${s.stages.PURCHASE_CANDIDATE} / ${s.stages.FINAL_PURCHASE}\n- final rider coverage P3 / P2 / P1 / P0 / UNKNOWN: ${s.finalRiderCoverage.P3} / ${s.finalRiderCoverage.P2} / ${s.finalRiderCoverage.P1} / ${s.finalRiderCoverage.P0} / ${s.finalRiderCoverage.UNKNOWN}\n- protected final: 0\n- historical mutation: 0\n- result-aware regeneration: 0\n\n復元不能なraceは推測せずUNKNOWNとして母数に残す。部分復元37Rでは当時保存されなかった最終買い目選手集合をUNKNOWNとする。\n`);
console.log(JSON.stringify({total:s.races,reconstructed:s.reconstructed,unreconstructable:s.unreconstructable,stages:s.stages,drops:s.drops,reasons:s.reasons,coverage:s.finalRiderCoverage,integrity:artifact.integrity},null,2));
