import assert from"node:assert/strict";
import{compareChatAndApp}from"../public/chat-app-diff.mjs";
const snapshot={terminalLedger:[
 {order:[1,2,3],probability:.12,betClass:"MAIN",purchaseStatus:"ADOPTED"},
 {order:[1,2,4],probability:.08,betClass:"COVER",purchaseStatus:"REJECTED"},
 {order:[2,1,3],probability:.07,betClass:"COVER",purchaseStatus:"ADOPTED"}
],betSelections:[{order:[1,2,3],probability:.12,category:"MAIN"},{order:[2,1,3],probability:.07,category:"COVER"}]};
let chat={firstCandidates:[{number:1}],pairBranches:[{order:[1,2]}],terminals:[{order:[1,2,3],category:"MAIN",purchaseStatus:"ADOPTED"}]};
let r=compareChatAndApp(chat,snapshot);assert.equal(r.firstDivergence,null);assert.equal(r.stages[0].status,"OK");
chat={firstCandidates:[{number:2}],pairBranches:[{order:[2,1]}],terminals:[{order:[2,1,3],category:"COVER",purchaseStatus:"ADOPTED"}]};
r=compareChatAndApp(chat,snapshot);assert.equal(r.firstDivergence.stage,"FIRST_PLACE_EVALUATION");
chat={firstCandidates:[{number:1}],pairBranches:[{order:[1,5]}],terminals:[{order:[1,5,3],category:"MAIN",purchaseStatus:"ADOPTED"}]};
r=compareChatAndApp(chat,snapshot);assert.equal(r.firstDivergence.stage,"PAIR_BRANCH");
chat={firstCandidates:[{number:1}],pairBranches:[{order:[1,2]}],terminals:[{order:[1,2,5],category:"MAIN",purchaseStatus:"ADOPTED"}]};
r=compareChatAndApp(chat,snapshot);assert.equal(r.firstDivergence.stage,"TERMINAL_GENERATION");
chat={firstCandidates:[{number:1}],pairBranches:[{order:[1,2]}],terminals:[{order:[1,2,3],category:"COVER",purchaseStatus:"ADOPTED"}]};
r=compareChatAndApp(chat,snapshot);assert.equal(r.firstDivergence.stage,"BET_CLASSIFICATION");
chat={firstCandidates:[{number:1}],pairBranches:[{order:[1,2]}],terminals:[{order:[1,2,3],category:"MAIN",purchaseStatus:"REJECTED"}]};
r=compareChatAndApp(chat,snapshot);assert.equal(r.firstDivergence.stage,"PURCHASE_DECISION");
console.log("Keirin chat-app diff audit passed");
