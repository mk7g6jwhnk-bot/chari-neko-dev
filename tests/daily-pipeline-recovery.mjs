import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {completionStatus,isTransientFailure,japanesePipelineStatus,openDailyRunManifest,retryWithBackoff,runRecoverableStages} from '../research/daily-pipeline-run.mjs';
import {runDailyValidationResilient} from '../research/daily-validation-resilient-run.mjs';

const makeRow=raceKey=>({raceKey,predictionSealedAt:'2098-12-31T20:00:00Z',resultObservedAt:'2099-01-01T01:00:00Z',hashes:{predictionHash:'p',inputHash:'i',resultHash:'r',purchaseHash:'u'},integrity:{predictionStatus:'VALID',resultValid:true,temporalValid:true},result:{status:'confirmed',finishOrder:[1,2,3],payout:1000},purchase:{eligibility:'PURCHASE_ALLOWED',tickets:[{order:'2-1-3',class:'MAIN',thick:false}]},prediction:{participantNumbers:[1,2,3,4,5],riderScores:[1,2,3,4,5].map(number=>({riderId:String(number),number,name:`R${number}`,score:6-number})),terminals:[{order:'1-2-3',probability:.5,terminalGlobalRank:1,scenarioFamilyRank:1,representativeTerminal:true,purchaseRejectCode:'ADOPTED',dominantBranchId:'A'},{order:'2-1-3',probability:.4,terminalGlobalRank:2,scenarioFamilyRank:1,representativeTerminal:true,purchaseRejectCode:'ADOPTED',dominantBranchId:'A'}]}});
const sourceFor=(keys,exclusions=[])=>({schemaVersion:'VALIDATION_COHORT_SOURCE_V2',cohort:{raceKeys:keys.filter(key=>!exclusions.some(item=>item.raceKey===key)),protectedFinalIncluded:0},requestedCohort:{raceKeys:keys,protectedFinalIncluded:0},hashes:{predictionMismatch:0,purchaseMismatch:0,sealedResultMismatch:0},exclusions,rows:keys.filter(key=>!exclusions.some(item=>item.raceKey===key)).map(makeRow),validationDiagnostics:[],safety:{readOnly:true,historicalMutation:0,protectedFinalUsed:0,resultLeakage:0}});
const event=raceKey=>({raceKey,metadata:{collectedAt:'2099-01-01T01:00:00Z'},record:{result:{status:'confirmed'}}});
const checkpoint={schemaVersion:'DAILY_VALIDATION_CHECKPOINT_V1',lastSuccessfulTimestamp:'2098-12-31T00:00:00Z',processedRaceKeys:[],lastTargetDate:'2098-12-31',scriptVersion:'TEST',executionId:'TEST',status:'SUCCESS',cumulativeBaseline:{},dailyRuns:0};

// 1: transient result fetch retries and then succeeds.
let attempts=0,delays=[];assert.equal(await retryWithBackoff(async()=>{if(attempts++===0)throw Error('HTTP_503');return'ok'},{baseDelayMs:2,sleep:async ms=>delays.push(ms)}),'ok');assert.deepEqual(delays,[2]);
// 2: a single evaluation poison item is quarantined while the valid item completes.
const quarantineDir=await fs.mkdtemp(path.join(os.tmpdir(),'daily-recovery-q-'));await fs.writeFile(path.join(quarantineDir,'checkpoint.json'),JSON.stringify(checkpoint));
const qResult=await runDailyValidationResilient({directory:quarantineDir,now:new Date('2099-01-01T21:30:00Z'),events:[event('20990101-01-1'),event('20990101-01-2')],sourceRetryBaseMs:1,sleep:async()=>{},fetchSource:async({cohort})=>sourceFor(cohort.raceKeys,[{raceKey:'20990101-01-2',reason:'HASH_INTEGRITY_FAILURE',retryable:false}])});
assert.equal(qResult.status,'COMPLETE_WITH_QUARANTINE');assert.deepEqual(qResult.targetRaceKeys,['20990101-01-1']);assert.equal(qResult.quarantinedRaces.length,1);
// 3/4: performance and daily aggregation stages resume without refetching completed source/evaluation.
const resumeDir=await fs.mkdtemp(path.join(os.tmpdir(),'daily-recovery-r-'));await fs.writeFile(path.join(resumeDir,'checkpoint.json'),JSON.stringify(checkpoint));let fetches=0;
const failed=await runDailyValidationResilient({directory:resumeDir,now:new Date('2099-01-02T21:30:00Z'),events:[event('20990102-01-1')],fetchSource:async({cohort})=>(fetches++,sourceFor(cohort.raceKeys)),failStage:'DAILY_AGGREGATION'});assert.equal(failed.status,'RETRYING');
const resumed=await runDailyValidationResilient({directory:resumeDir,now:new Date('2099-01-02T21:31:00Z'),events:[event('20990102-01-1')],fetchSource:async({cohort})=>(fetches++,sourceFor(cohort.raceKeys))});assert.equal(resumed.status,'COMPLETE');assert.equal(fetches,1);assert.equal(resumed.pipelineRun.stageResults.RESULT_EVALUATION.status,'COMPLETE');
// 5/6: browser pressure and 5xx are transient and eligible for bounded backoff.
assert.equal(isTransientFailure('BROWSER_LAUNCH_DEFERRED_MEMORY_PRESSURE'),true);assert.equal(isTransientFailure('HTTP_502'),true);
// 7: a hash mismatch is never forced through.
assert.equal(isTransientFailure('HASH_INTEGRITY_FAILURE'),false);assert.equal(completionStatus({quarantined:1}),'COMPLETE_WITH_QUARANTINE');
// 8: duplicate retry does not duplicate the processed key.
const cp=JSON.parse(await fs.readFile(path.join(resumeDir,'checkpoint.json'),'utf8'));assert.equal(cp.processedRaceKeys.filter(key=>key==='20990102-01-1').length,1);
const duplicate=await runDailyValidationResilient({directory:resumeDir,now:new Date('2099-01-02T22:00:00Z'),events:[event('20990102-01-1')],fetchSource:async()=>{throw Error('MUST_NOT_FETCH')}});assert.equal(duplicate.status,'ALREADY_VALIDATED');
// 9: a durable run identity is reused instead of creating a competing run.
const manifestDir=await fs.mkdtemp(path.join(os.tmpdir(),'daily-recovery-m-')),first=await openDailyRunManifest({directory:manifestDir,targetDate:'2099-01-03',now:new Date('2099-01-02T21:30:00Z')});await first.fail(Error('HTTP_503'),{retryable:true});const second=await openDailyRunManifest({directory:manifestDir,targetDate:'2099-01-03',now:new Date('2099-01-02T21:31:00Z')});assert.equal(second.manifest.runId,first.manifest.runId);
// 10: 21:30Z belongs to the following JST date (covered by the resilient run target date).
assert.equal(qResult.targetDate,'2099-01-02');
// 11: completion with quarantine is a terminal, successful state.
assert.equal(japanesePipelineStatus('COMPLETE_WITH_QUARANTINE'),'一部保留あり');
// 12: stage runner skips an already-completed stage and preserves prior output.
let calls=0;const state=await runRecoverableStages({state:{RESULT_FETCH:{completed:true,value:'cached'}},stages:[{name:'RESULT_FETCH',run:async()=>{calls++;return'new'}},{name:'RESULT_EVALUATION',run:async()=>{calls++;return'evaluated'}}]});assert.equal(calls,1);assert.equal(state.RESULT_FETCH.value,'cached');assert.equal(state.RESULT_EVALUATION.value,'evaluated');

console.log('daily pipeline recovery: PASS (12/12)');
