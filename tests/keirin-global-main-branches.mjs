import assert from "node:assert/strict";
import {generateKeirinBranches} from "../keirin/sports/keirin-branches.mjs";

function rider(id,number,{first=5,start=5,sprint=5,finish=5,tracking=5,recent=5,role="ライン"}={}){
  return {id,number,role,roleScores:{first},evidence:{start,sprint,finish,tracking,recent}};
}
const a1=rider("a1",1,{first:5.8,start:5.5,sprint:5.2,finish:5.0,recent:5.5});
const a2=rider("a2",2,{first:8.0,finish:8.0,tracking:8.0,recent:8.0});
const b1=rider("b1",3,{first:5.5,start:5.0,sprint:5.0,finish:5.0,recent:5.0});
const b2=rider("b2",4,{first:5.4,finish:5.1,tracking:5.1,recent:5.0});
const c1=rider("c1",5,{first:8.5,start:6.0,sprint:9.0,finish:8.0,recent:8.0});
const c2=rider("c2",6,{first:5.5,finish:5.0,tracking:5.5,recent:5.0});
const scored=[a1,a2,b1,b2,c1,c2];
const lines=[
  {id:"A",type:"ライン",leader:a1,bante:a2},
  {id:"B",type:"ライン",leader:b1,bante:b2},
  {id:"C",type:"ライン",leader:c1,bante:c2}
];
const branches=generateKeirinBranches({scored,lines,lineConfidence:"高"});
const cMakuri=branches.find(branch=>branch.id==="MAKURI-C");
const aBante=branches.find(branch=>branch.id==="BANTE-A");
const cLead=branches.find(branch=>branch.id==="LEAD-C");
const bMakuri=branches.find(branch=>branch.id==="MAKURI-B");
assert.ok(cMakuri&&aBante&&cLead&&bMakuri);
assert.ok(branches.every(branch=>branch.priority==="hypothesis"),"branch generation must not pre-classify purchase tiers");
assert.ok(Math.abs(branches.reduce((sum,branch)=>sum+branch.probability,0)-1)<1e-12,"all enabled hypotheses share one normalized probability pool");
assert.ok([cMakuri,aBante,cLead,bMakuri].every(branch=>Number.isFinite(branch.score)&&branch.score>0),"all enabled hypotheses retain evidence scores");
assert.deepEqual(generateKeirinBranches({scored,lines,lineConfidence:"高"}),branches,"hypothesis ordering and probabilities are deterministic");
assert.notEqual(cMakuri.primaryLineId,aBante.primaryLineId);
console.log("Keirin global hypothesis pool passed:",cMakuri.label,cMakuri.score.toFixed(3),aBante.label,aBante.score.toFixed(3));
