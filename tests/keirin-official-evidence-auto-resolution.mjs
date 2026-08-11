import assert from"node:assert/strict";
import{attachResult,loadResearchLearningRecords,saveSnapshot}from"../public/prediction-store.mjs";
const mem=new Map(),storage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,String(v))};
const s={predictionSnapshotId:"O1",predictionVersion:"X",createdAt:"2026-08-10T00:00:00Z",targetRace:{date:"20260810",venueName:"立川",venueCode:"28",raceNo:1},participants:[],abilitiesUsed:[],predictionOutput:{},branches:[],betSelections:[],terminalLedger:[{order:[5,1,4],probability:.2,purchaseStatus:"購入不採用",nodeSummary:{
FIRST:{conditionalProbability:.3,newConditionCount:2,extraConditionCount:0,conditions:[{id:"MAKURI_POSITION_5",label:"5が捲り位置",kind:"natural",probability:.72,critical:true},{id:"MAKURI_REACH_5",label:"5の捲りが届く",kind:"natural",probability:.68,critical:true}]},
SECOND:{conditionalProbability:.4,newConditionCount:1,extraConditionCount:0,conditions:[{id:"SECOND_LINE_HOLD_1",label:"1が2着",kind:"natural",probability:.8,critical:true}]},
THIRD:{conditionalProbability:.5,newConditionCount:1,extraConditionCount:1,conditions:[{id:"THIRD_OTHER_LINE_SURVIVE_4",label:"4が3着",kind:"extra",probability:.56,critical:true}]}}}],oddsSnapshot:null,result:null};
saveSnapshot(storage,s);attachResult(storage,"O1",{status:"confirmed",finishOrder:[5,1,4],winningMethod:"捲り"});
const row=loadResearchLearningRecords(storage)[0],reach=row.conditionEvidence.find(x=>x.conditionId==="MAKURI_REACH_5"),pos=row.conditionEvidence.find(x=>x.conditionId==="MAKURI_POSITION_5");
assert.equal(reach.status,"CONFIRMED");assert.equal(reach.source,"official_winning_method");assert.equal(reach.autoResolved,true);assert.equal(pos.status,"EVIDENCE_PENDING");assert.equal(row.evidenceSummary.autoResolved,1);assert.equal(row.nodeCauseLearningEligible,false);
console.log("PASS conservative official evidence auto-resolution");
