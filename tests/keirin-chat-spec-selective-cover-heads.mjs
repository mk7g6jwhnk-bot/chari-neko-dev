import assert from"node:assert/strict";
import{applyChatSpecV1}from"../keirin/engine/chat-spec-v1-policy.mjs";

const scored=Array.from({length:7},(_,i)=>({
  number:i+1,
  roleScores:{first:8-i*.25,second:7.5-i*.18,third:7.2-i*.15}
}));
const branches=[
 {id:"M5",label:"5中心",priority:"main",requiredFirstNumber:5,score:9.2,scoreTrace:[
   {key:"firstAbility",contribution:2.2},{key:"linePosition",contribution:1.5}
 ]},
 {id:"C7",label:"7対抗",priority:"contender",requiredFirstNumber:7,score:7.5,scoreTrace:[
   {key:"makuri",contribution:1.4},{key:"linePosition",contribution:1.0},{key:"recent",contribution:.8}
 ]},
 {id:"C4",label:"4別線",priority:"contender",requiredFirstNumber:4,score:6.8,scoreTrace:[
   {key:"startPower",contribution:1.2},{key:"linePosition",contribution:.9}
 ]},
 {id:"C3",label:"3別線",priority:"contender",requiredFirstNumber:3,score:5.9,scoreTrace:[
   {key:"recent",contribution:.8}
 ]},
 {id:"C2",label:"2別線",priority:"contender",requiredFirstNumber:2,score:5.4,scoreTrace:[
   {key:"recent",contribution:.5},{key:"positionRisk",contribution:-1.0}
 ]},
 {id:"C1",label:"1別線",priority:"contender",requiredFirstNumber:1,score:4.1,scoreTrace:[
   {key:"recent",contribution:.4}
 ]}
];

const terminals=[];
function add(head,branch,priority,base){
  const others=[1,2,3,4,5,6,7].filter(x=>x!==head);
  for(let i=0;i<3;i++){
    const second=others[i],third=others[i+1];
    terminals.push({
      order:[head,second,third],
      probability:base*(1-i*.08),
      branchContributions:[{
        branchId:branch.id,branchLabel:branch.label,branchPriority:priority,
        requiredFirstNumber:head,probability:base,
        decisionRatios:{first:.94,second:.88,third:.86}
      }]
    });
  }
}
add(5,branches[0],"main",.10);
add(7,branches[1],"contender",.07);
add(4,branches[2],"contender",.065);
add(3,branches[3],"contender",.055);
add(2,branches[4],"contender",.05);
add(1,branches[5],"contender",.04);

const out=applyChatSpecV1({scored,branches,terminals,oddsByOrder:{}});
const approved=out.audit.contenderHeadAudit.approved.sort((a,b)=>a-b);
assert.deepEqual(approved,[4,7],"two independently-supported heads should both pass");

for(const h of [1,2,3]){
  const rows=out.terminals.filter(x=>x.firstFamilyNumber===h);
  assert.ok(rows.every(x=>x.purchaseStatus==="購入不採用"));
  assert.ok(rows.some(x=>x.purchaseRejectCode==="CONTENDER_HEAD_NOT_SELECTED"));
}

const coverHeads=[...new Set(out.terminals.filter(x=>x.betClass==="COVER").map(x=>x.firstFamilyNumber))].sort((a,b)=>a-b);
assert.deepEqual(coverHeads,[4,7]);
console.log("Keirin independent contender-head eligibility passed:",coverHeads);
