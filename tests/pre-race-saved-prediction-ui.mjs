import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {derivePreRacePredictionState,latestPredictionSummary} from "../public/pre-race-prediction-state.mjs";

const A="a".repeat(64),B="b".repeat(64),C="c".repeat(64),raceKey="20260930-63-4";

const saved=derivePreRacePredictionState({summary:{raceKey,predictionHash:A}});
assert.deepEqual({label:saved.label,action:saved.action,hash:saved.predictionHash}, {label:"予想保存済み",action:"予想を見る",hash:A});
assert.equal(saved.canOpenSaved,true);

const unsaved=derivePreRacePredictionState({summaryLoaded:true});
assert.deepEqual({label:unsaved.label,action:unsaved.action},{label:"未保存",action:"予想する"});

const timestampOnly=derivePreRacePredictionState({summary:{raceKey,predictionHash:A,predictionSealedAt:"2026-09-30T00:00:00Z"},snapshot:{sealedPrediction:{predictionHash:B,predictionSealedAt:"2026-09-29T23:00:00Z"}}});
assert.equal(timestampOnly.label,"予想保存済み","timestamp/hash identity change alone is not meaningful content change");

const updated=derivePreRacePredictionState({summary:{raceKey,predictionHash:A,predictionContentHash:C},snapshot:{sealedPrediction:{predictionHash:B,predictionIdentity:{predictionContentHash:B}}}});
assert.equal(updated.label,"更新あり");
assert.equal(updated.action,"予想を見る","normal action keeps opening the sealed identity");

const latest=latestPredictionSummary([{raceKey,predictionHash:A,predictionSealedAt:"2026-09-30T00:01:00Z"},{raceKey,predictionHash:B,predictionSealedAt:"2026-09-30T00:02:00Z"}],raceKey);
assert.equal(latest.predictionHash,B,"same raceKey resolves by explicit newest immutable identity");
assert.equal(latestPredictionSummary([{raceKey,predictionHash:A,lifecycleStatus:"SEALED_PREDICTION_MUTATED"}],raceKey),null,"known hash-integrity failures are never exposed as readable saved predictions");

const legacy=derivePreRacePredictionState({summaryLoaded:true,lifecycle:{predictionSealedAt:"2026-09-30T00:00:00Z"}});
assert.equal(legacy.kind,"LEGACY_UNLINKED");
assert.equal(legacy.canOpenSaved,false,"legacy artifact must not be guessed by raceKey/time");

const app=await fs.readFile(new URL("../public/app.mjs",import.meta.url),"utf8");
const css=await fs.readFile(new URL("../public/styles.css",import.meta.url),"utf8");
const summaryProxy=await fs.readFile(new URL("../netlify/functions/keirin-saved-prediction-summary.mjs",import.meta.url),"utf8");
assert.match(app,/reuseSealedPrediction\(race,savedState\.predictionHash\)/,"saved list opens by predictionHash");
assert.doesNotMatch(app,/if\(!state\.snapshot\)void reuseSealedPrediction\(race\)/,"list open must not fall back to raceKey inference");
assert.match(app,/savedState\.label/);
assert.match(app,/savedState\.action/);
assert.match(app,/else if\(savedHash\)\{\$\("predictBtn"\)\.textContent="予想を見る"/s,"detail action uses the saved prediction hash before payload restoration completes");
assert.match(app,/if\(savedHash\)\{void reuseSealedPrediction\(state\.race,savedHash\);return\}/s,"detail primary action reads the sealed prediction instead of generating a new one");
assert.match(app,/function selectedPredictionHash\(r\).*r\?\.selectedPredictionHash.*preRacePredictionState\(r\)\.predictionHash/s,"detail and list share the explicit saved prediction identity");
assert.match(css,/@media\(max-width:360px\)\{\.predictionSaveState/,"mobile state badge remains compact");
assert.match(summaryProxy,/AbortSignal\.timeout\(30000\)/,"saved prediction summary proxy tolerates the measured production read latency");
console.log("OK pre-race saved prediction UI tests");
