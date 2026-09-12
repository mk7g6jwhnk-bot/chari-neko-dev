import assert from "node:assert/strict";
import {generateKeirinBranches} from "../keirin/sports/keirin-branches.mjs";

const scored=[
  {id:"a1",number:1,roleScores:{first:8},evidence:{start:8,sprint:8,finish:7,recent:7,tracking:6}},
  {id:"a2",number:2,roleScores:{first:6},evidence:{start:5,sprint:5,finish:8,recent:7,tracking:8}},
  {id:"b1",number:3,roleScores:{first:7},evidence:{start:7,sprint:7,finish:6,recent:6,tracking:5}},
  {id:"b2",number:4,roleScores:{first:5},evidence:{start:4,sprint:4,finish:7,recent:6,tracking:7}}
];
const lines=[{id:"A",type:"ライン",leader:scored[0],bante:scored[1]},{id:"B",type:"ライン",leader:scored[2],bante:scored[3]}];
const branches=generateKeirinBranches({scored,lines,lineConfidence:"高"});
assert.deepEqual(branches.map(branch=>branch.id),["LEAD-A","MAKURI-A","BANTE-A","LEAD-B","MAKURI-B","BANTE-B","BATTLE","SEPARATION"]);
assert.ok(branches.every(branch=>branch.priority==="hypothesis"),"branch generator exposes hypotheses, not legacy adaptive tiers");
assert.ok(Math.abs(branches.reduce((sum,branch)=>sum+branch.probability,0)-1)<1e-12);
assert.deepEqual(generateKeirinBranches({scored,lines,lineConfidence:"高"}),branches,"branch generation must be deterministic");
console.log("Keirin deterministic hypothesis pool passed:",branches.map(x=>x.id).join(","));
