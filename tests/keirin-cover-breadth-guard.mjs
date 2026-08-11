import assert from "node:assert/strict";
import {applyChatSpecV1} from "../keirin/engine/chat-spec-v1-policy.mjs";

const scored=[
 {number:1,roleScores:{first:9.0,second:7.0,third:6.8}},
 {number:2,roleScores:{first:5.0,second:7.8,third:7.0}},
 {number:3,roleScores:{first:4.8,second:7.2,third:7.8}},
 {number:4,roleScores:{first:8.0,second:7.1,third:6.9}},
 {number:5,roleScores:{first:5.2,second:7.0,third:7.2}},
 {number:6,roleScores:{first:4.9,second:6.9,third:7.1}},
 {number:7,roleScores:{first:4.7,second:6.8,third:7.0}}
];
const branches=[
 {id:"M1",label:"1中心",priority:"main",requiredFirstNumber:1,score:9.3,scoreTrace:[{key:"firstAbility",contribution:2.2},{key:"linePosition",contribution:1.4}]},
 {id:"C4",label:"4対抗",priority:"contender",requiredFirstNumber:4,score:8.2,scoreTrace:[{key:"makuri",contribution:1.5},{key:"linePosition",contribution:1.1},{key:"recent",contribution:.9}]}
];
const terminals=[
 {order:[1,2,3],probability:.26,branchContributions:[{branchId:"M1",branchLabel:"1中心",branchPriority:"main",requiredFirstNumber:1,probability:.26,decisionRatios:{first:.98,second:.96,third:.95}}]},
 // contender family: natural/classifiable candidate exists
 {order:[4,5,6],probability:.10,branchContributions:[{branchId:"C4",branchLabel:"4対抗",branchPriority:"contender",requiredFirstNumber:4,probability:.10,decisionRatios:{first:.95,second:.90,third:.89}}]},
 {order:[4,6,5],probability:.095,branchContributions:[{branchId:"C4",branchLabel:"4対抗",branchPriority:"contender",requiredFirstNumber:4,probability:.095,decisionRatios:{first:.94,second:.89,third:.88}}]},
 {order:[4,7,5],probability:.02,branchContributions:[{branchId:"C4",branchLabel:"4対抗",branchPriority:"contender",requiredFirstNumber:4,probability:.02,decisionRatios:{first:.90,second:.82,third:.80}}]}
];
const out=applyChatSpecV1({scored,branches,terminals,oddsByOrder:{}});
assert.ok(out.audit.contenderHeadAudit.approved.includes(4),"contender head must be independently approved for this fixture");
const row=out.audit.coverBreadthAudit.rows.find(x=>x.first===4);
assert.ok(row,"cover breadth audit row missing");
assert.equal(row.passed,true);
assert.ok(row.coverCount>=1,"approved contender head with classifiable natural terminal must retain at least one COVER");
assert.ok(out.terminals.some(x=>x.firstFamilyNumber===4&&x.purchaseStatus==="購入採用"&&x.betClass==="COVER"));
console.log("PASS cover breadth guard",row);
