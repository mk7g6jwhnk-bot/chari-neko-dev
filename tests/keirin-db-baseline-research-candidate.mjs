import assert from "node:assert/strict";
import {buildDbBaseline,buildTodayAdjustments,buildCandidateTerminals,classifyBehaviorTraitSources,CANDIDATE_POLICY} from "../research/db-baseline/candidate.mjs";
import {runResearchStateGraph} from "../research/state-engine/state-engine.mjs";
import {runDevelopmentBacktest} from "../research/db-baseline/backtest.mjs";

const db={riders:{"000123":{officialIdConfirmed:true,recent_4_months:{race_points:90,official_first_rate:20,official_top2_rate:50,official_top3_rate:70,starts:20,home:4,back:6},winning_method_share_among_top2:{escape:10,sprint:40,pass:30,mark:20},metadata:{sample_size:20,confidence:"high",quality_status:"success",recent_updated_at:"2026-08-01",stale:{any:false},missing_fields:[]}}}};
const participant={number:1,id:"1",registration:"123",officialScore:94,recentForm:7,role:"自力",lineId:"A",roleScores:{first:5,second:5,third:5}};
const base=buildDbBaseline(participant,{riderDb:db,raceDate:"20260820"});
assert.equal(base.matched,true);assert.ok(base.baseAbility.firstAbility>0);assert.equal(base.baseAbility.stamina,null);assert.equal(base.behaviorTraits.blockTendency.verifiedLevel,"UNVERIFIED");
assert.equal(buildDbBaseline(participant,{riderDb:db,raceDate:"20261020"}).reliability.stale,true);
const adjustments=buildTodayAdjustments(participant,base);assert.equal(adjustments.length,5);assert.ok(adjustments.every(x=>x.appliedValue>=.94&&x.appliedValue<=1.06||x.name==="lineRoleAdjustment"));
assert.deepEqual(classifyBehaviorTraitSources([{nodeType:"FIRST"},{nodeType:"BLOCK",requiresMedia:true},{nodeType:"OTHER"}]).map(x=>x.derivability),["AUTO_DERIVABLE","MEDIA_REQUIRED","UNVERIFIED"]);
const race={date:"20260820",participants:[participant,{...participant,number:2,id:"2",registration:"124",role:"番手",roleScores:{first:6,second:6,third:6}},{...participant,number:3,id:"3",registration:"125",lineId:"B",roleScores:{first:7,second:7,third:7}}]};
const graph=runResearchStateGraph({race});const output=buildCandidateTerminals({race,existingGraph:graph,variant:"C4",riderDb:db});assert.equal(output.terminals.length,6);assert.equal(output.behaviorTraitsUsed,false);assert.equal(output.productionWriteAllowed,false);assert.equal(CANDIDATE_POLICY.existingResearchCalibrationTemperature,.5);
assert.throws(()=>runDevelopmentBacktest([],{graphRunner:runResearchStateGraph}),/DEVELOPMENT_COHORT_INCOMPLETE:0\/302/);
console.log("keirin db baseline research candidate tests passed");
