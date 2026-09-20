import assert from'node:assert/strict';
import fs from'node:fs/promises';
import { auditTerminalSurvival, mergeTerminalSurvivalSummaries, summarizeTerminalSurvival } from'../research/terminal-survival-audit.mjs';

const row=({eligibility='PURCHASE_ALLOWED',tickets=[]}={})=>({raceKey:'20990101-01-1',result:{finishOrder:[1,2,3]},purchase:{eligibility,tickets}});
const diagnosis=overrides=>({terminal:{generated:true,meaningful:true,purchaseCandidate:true,purchased:false,globalRank:1,scenarioFamilyRank:1,purchaseRejectCode:'ADOPTED',purchaseReason:null},pair:{generated:true,meaningful:true,reverseMeaningful:false},third:{generated:true,rank:1},...overrides});

const exact=auditTerminalSurvival(row({tickets:[{order:'1-2-3',class:'MAIN'}]}),diagnosis({terminal:{...diagnosis().terminal,purchased:true}}));
assert.equal(exact.dropStage,'EXACT_PURCHASE_HIT');assert.equal(exact.stages.FINAL_CLASS,'MAIN');assert.equal(exact.reason,null);
const ineligible=auditTerminalSurvival(row({eligibility:'PURCHASE_BLOCKED'}),diagnosis());assert.equal(ineligible.dropStage,'PURCHASE_INELIGIBLE');assert.equal(ineligible.reason,'PURCHASE_INELIGIBLE');
const pairDrop=auditTerminalSurvival(row(),diagnosis({terminal:{...diagnosis().terminal,meaningful:false,purchaseCandidate:false},pair:{generated:true,meaningful:false,reverseMeaningful:true}}));assert.equal(pairDrop.reason,'PAIR_DIRECTION_OR_RANK');
const thirdDrop=auditTerminalSurvival(row(),diagnosis({terminal:{...diagnosis().terminal,meaningful:false,purchaseCandidate:false,globalRank:null,scenarioFamilyRank:null,purchaseRejectCode:'THIRD_REJECT'},pair:{generated:true,meaningful:true,reverseMeaningful:false}}));assert.equal(thirdDrop.reason,'THIRD_CONDITIONAL');
const candidateDrop=auditTerminalSurvival(row(),diagnosis({terminal:{...diagnosis().terminal,purchaseCandidate:false,globalRank:null,scenarioFamilyRank:null,purchaseRejectCode:null}}));assert.equal(candidateDrop.dropStage,'DROP_AT_PURCHASE_CANDIDATE');assert.equal(candidateDrop.reason,'CLASSIFICATION_ONLY');
const cliff=auditTerminalSurvival(row(),diagnosis({terminal:{...diagnosis().terminal,purchaseCandidate:false,purchaseRejectCode:'THIRD_VARIANT_BOUNDARY'}}));assert.equal(cliff.dropStage,'DROP_AT_PURCHASE_CANDIDATE');assert.equal(cliff.reason,'CLIFF_BOUNDARY');
const compression=auditTerminalSurvival(row(),diagnosis());assert.equal(compression.dropStage,'DROP_AT_FINAL_PURCHASE');assert.equal(compression.reason,'PURCHASE_COMPRESSION');
const trio=auditTerminalSurvival(row({tickets:[{order:'2-1-3',class:'COVER'}]}),diagnosis());assert.equal(trio.trio.trifectaMissTrioHit,true);assert.equal(trio.finalRiderCoverage.count,3);assert.equal(trio.pair.reverseFinal,true);
const internalP3FinalP2=auditTerminalSurvival(row({tickets:[{order:'1-2-4',class:'MAIN'}]}),diagnosis({meaningfulRiderCount:3}));assert.equal(internalP3FinalP2.finalRiderCoverage.count,2);assert.equal(internalP3FinalP2.finalRiderCoverage.winnerFirst,true);
const unknown=auditTerminalSurvival(row(),diagnosis({terminal:{generated:false,meaningful:false,purchaseCandidate:false,purchased:false,globalRank:null,scenarioFamilyRank:null,purchaseRejectCode:null,purchaseReason:null},pair:{generated:false,meaningful:false,reverseMeaningful:false},third:{generated:false,rank:null}}));assert.equal(unknown.reason,'UNKNOWN');
const summary=summarizeTerminalSurvival([exact,ineligible,pairDrop,thirdDrop,candidateDrop,cliff,compression,trio,internalP3FinalP2,unknown],{unreconstructable:2});assert.equal(summary.races,12);assert.equal(summary.reconstructed,10);assert.equal(summary.unreconstructable,2);assert.equal(summary.drops.EXACT_PURCHASE_HIT,1);assert.equal(summary.drops.UNKNOWN,2);assert.equal(summary.reasons.UNKNOWN,3);assert.equal(summary.reasons.CLIFF_BOUNDARY,1);assert.equal(summary.finalRiderCoverage.P3,2);assert.equal(summary.finalRiderCoverage.P2,1);
const merged=mergeTerminalSurvivalSummaries(summary,summary);assert.equal(merged.races,24);assert.equal(merged.stages.GENERATED,18);
const evaluator=await fs.readFile(new URL('../research/prediction-distance-evaluation.mjs',import.meta.url),'utf8');assert.match(evaluator,/terminalSurvival/);assert.doesNotMatch(evaluator,/thresholdSearch:\s*true/);
const app=await fs.readFile(new URL('../public/app.mjs',import.meta.url),'utf8');assert.match(app,/正解terminalの生存・脱落|validationTerminalSurvivalBody/);assert.match(app,/内部候補 P3/);assert.match(app,/最終購入の車券内 P3/);
console.log('terminal-survival-audit: PASS');
