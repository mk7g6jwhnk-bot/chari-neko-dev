import assert from"node:assert/strict";
import{generateKeirinTerminals}from"../keirin/sports/keirin-terminals.mjs";

const mk=(id,number,role,thirdScore)=>({
  id,number,role,lineId:"A",
  roleScores:{first:7,second:7,third:7},
  evidence:{recent:7,start:7,sprint:7,finish:7,tracking:7,stamina:7,lineTrust:7},
  riderEvaluationV2:{
    secondMechanisms:{leaderRemain:5,lineFollower:5,otherLineRemain:5},
    thirdMechanisms:{lineThird:thirdScore,positionRemain:thirdScore,otherLineRemain:thirdScore}
  }
});
const scored=[mk("1",1,"番手",5),mk("2",2,"自力",5),mk("3",3,"三番手",5.01),mk("4",4,"三番手",5)];
const branches=[{id:"BANTE",label:"A番手差し",branchType:"BANTE_SASHI",primaryLineId:"A",priority:"main",score:8,firstCandidates:["1"],firstCandidateScores:{"1":8}}];
const terminals=generateKeirinTerminals({scored,branches});
const top=terminals.find(x=>x.order.join("-")==="1-2-3");
const alt=terminals.find(x=>x.order.join("-")==="1-2-4");
assert.ok(top&&alt);
assert.ok(top.probability>alt.probability,"even a tiny third-place evidence edge must survive final normalization");
assert.equal(top.relativeConditionTrace.find(x=>x.stage==="THIRD")?.count,0);
const thirdAlt=alt.relativeConditionTrace.find(x=>x.stage==="THIRD");
assert.equal(thirdAlt?.count,1,"lower-probability third candidate must carry one differential condition");
assert.ok(thirdAlt.ratio<1&&thirdAlt.ratio>.99,"fixture must represent a tiny, not large, probability difference");
assert.ok(thirdAlt.penalty>0&&thirdAlt.penalty<=.03,"differential burden must be light");
assert.ok(alt.relativeConditionPenalty<1&&alt.relativeConditionPenalty>.95);
assert.equal(alt.probabilitySeparationPolicy,"BASE_PROBABILITY_FIRST_PLUS_LIGHT_DIFFERENTIAL_CONDITION_V1");
const audit=terminals.generationAudit;
assert.equal(audit.probabilitySeparationPolicy,"BASE_PROBABILITY_FIRST_PLUS_LIGHT_DIFFERENTIAL_CONDITION_V1");
console.log("PASS v214 tiny probability differences preserved + light differential condition burden");
