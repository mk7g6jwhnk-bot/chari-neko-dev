import assert from"node:assert/strict";
import{attachResult,loadResearchLearningRecords,saveSnapshot,summarizeResearchLearning}from"../public/prediction-store.mjs";
const mem=new Map();
const storage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v))};
const base={predictionSnapshotId:"S1",predictionVersion:"X",createdAt:"2026-08-10T00:00:00Z",targetRace:{date:"20260810",venueName:"立川",venueCode:"28",raceNo:1},participants:[],abilitiesUsed:[],predictionOutput:{},branches:[],betSelections:[{order:[1,2,3],category:"MAIN"}],terminalLedger:[
 {order:[1,2,3],probability:.08,purchaseStatus:"購入採用",terminalGlobalRank:2,nodeSummary:{FIRST:{conditionalProbability:.3,newConditionCount:1,extraConditionCount:0,conditionLabels:[]},SECOND:{conditionalProbability:.4,newConditionCount:1,extraConditionCount:0,conditionLabels:[]},THIRD:{conditionalProbability:.5,newConditionCount:1,extraConditionCount:0,conditionLabels:[]}}},
 {order:[1,3,2],probability:.07,purchaseStatus:"購入不採用"},
 {order:[2,1,3],probability:.06,purchaseStatus:"購入不採用"}
],oddsSnapshot:null,result:null};
saveSnapshot(storage,base);
attachResult(storage,"S1",{status:"confirmed",finishOrder:[1,2,3],payout:5000},new Date("2026-08-10T06:00:00Z"));
const rows=loadResearchLearningRecords(storage);
assert.equal(rows.length,1);
assert.equal(rows[0].verificationStatus,"PURCHASE_HIT");
assert.ok(rows[0].realizedFirstFamilyProbability>.08);
assert.equal(rows[0].realizedPairProbability,.08);
const s=summarizeResearchLearning(storage);
assert.equal(s.normalCount,1);
assert.equal(s.purchaseHitCount,1);
assert.equal(s.exactTerminalGeneratedRate,1);
assert.equal(s.purchaseHitRate,1);
assert.ok(s.terminalLogLoss>0);
console.log("PASS persistent research learning ledger + aggregate calibration");
