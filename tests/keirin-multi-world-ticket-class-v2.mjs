import assert from "node:assert/strict";
import crypto from "node:crypto";
import {attachCanonicalMultiWorldTicketClasses,classifyMultiWorldTicketV2,MULTI_WORLD_TICKET_CLASS_VERSION} from "../keirin/engine/multi-world-ticket-class-v2.mjs";

const scenarios=[1,2,3,4].map(rank=>({macroScenarioId:`W${rank}`,scenarioRank:rank}));
const rows=[];
for(let i=1;i<=15;i++){
  const scenarioRank=i<=6?1:i<=10?2:i<=13?3:4;
  rows.push({order:[Math.ceil(i/3),((i+1)%7)+1,((i+3)%7)+1],macroScenarioId:`W${scenarioRank}`,scenarioTicketRank:scenarioRank===1?i:scenarioRank===2?i-6:scenarioRank===3?i-10:i-13,rankWithinEvent:i<=3?1:2,naturalConvergenceScore:i<=3?.7:.4,directMainBranchSupport:i<=3,branchHeadMatched:true,betClass:i===1?"MAIN":"COVER",purchaseStatus:"購入採用",globalRank:i,thickQualified:i===2});
}
rows[7]={...rows[7],order:[3,5,4],macroScenarioId:"W2",scenarioTicketRank:2};
const prediction={multiWorldScenario:{scenarios},standardPurchasePlan:rows,purchasePlan:rows,terminals:rows,audit:{multiWorldPurchase:{enabled:true,totalTickets:15}}};
const before=JSON.stringify(rows.map(row=>({order:row.order,macroScenarioId:row.macroScenarioId,globalRank:row.globalRank,scenarioTicketRank:row.scenarioTicketRank})));
const beforeHash=crypto.createHash("sha256").update(before).digest("hex");
const output=attachCanonicalMultiWorldTicketClasses(prediction,{enabled:true});
const after=JSON.stringify(output.standardPurchasePlan.map(row=>({order:row.order,macroScenarioId:row.macroScenarioId,globalRank:row.globalRank,scenarioTicketRank:row.scenarioTicketRank})));

assert.equal(output.standardPurchasePlan.length,15);
assert.equal(crypto.createHash("sha256").update(after).digest("hex"),beforeHash,"classification must not change the ticket/rank fingerprint");
assert.deepEqual(Object.fromEntries(["MAIN","SECONDARY","SCENARIO_BREAK"].map(key=>[key,output.standardPurchasePlan.filter(row=>row.worldClass===key).length])),{MAIN:6,SECONDARY:4,SCENARIO_BREAK:5});
assert.ok(output.standardPurchasePlan.filter(row=>row.worldClass==="MAIN"&&row.ticketClass==="MAIN").length>1,"MAIN world permits multiple MAIN tickets");
assert.ok(output.standardPurchasePlan.filter(row=>row.worldClass==="MAIN"&&row.ticketClass==="COVER").length>0,"MAIN world can mix MAIN/COVER");
assert.ok(output.standardPurchasePlan.filter(row=>row.worldClass==="SECONDARY").every(row=>row.ticketClass==="COVER"),"SECONDARY is retained and displayed as COVER");
assert.ok(output.standardPurchasePlan.filter(row=>row.worldClass==="SCENARIO_BREAK").every(row=>row.ticketClass==="SCENARIO_BREAK"),"only structural break worlds use BREAK ticket class");
assert.ok(output.standardPurchasePlan.every(row=>row.ticketClassVersion===MULTI_WORLD_TICKET_CLASS_VERSION&&row.classificationSource==="CANONICAL_V2"&&row.classificationResultDataUsed===false));
assert.equal(output.standardPurchasePlan.find(row=>row.order.join("-")==="3-5-4").worldClass,"SECONDARY");
assert.equal(output.standardPurchasePlan.find(row=>row.order.join("-")==="3-5-4").scenarioTicketRank,2);
assert.equal(output.standardPurchasePlan.find(row=>row.thick).ticketClass,"MAIN","THICK stays an independent attribute");
assert.equal(attachCanonicalMultiWorldTicketClasses(prediction,{enabled:false}),prediction,"flag OFF is exact legacy parity");
assert.equal(classifyMultiWorldTicketV2({rankWithinEvent:1},1).ticketClass,"MAIN");
assert.equal(classifyMultiWorldTicketV2({},2).worldClass,"SECONDARY");
assert.equal(classifyMultiWorldTicketV2({},3).ticketClass,"SCENARIO_BREAK");
const missing=attachCanonicalMultiWorldTicketClasses({...prediction,standardPurchasePlan:[{...rows[0],macroScenarioId:"UNKNOWN"}]},{enabled:true}).standardPurchasePlan[0];
assert.equal(missing.classificationSource,"CANONICAL_V2_INVALID");assert.equal(missing.ticketClass,null);assert.equal(missing.worldClass,null);
assert.deepEqual(output.purchasePlan.map(row=>row.ticketClass),output.standardPurchasePlan.map(row=>row.ticketClass));
assert.deepEqual(output.terminals.map(row=>row.worldClass),output.standardPurchasePlan.map(row=>row.worldClass));
assert.equal(output.audit.multiWorldPurchase.totalTickets,15);
assert.equal(output.audit.multiWorldPurchase.classificationSource,"CANONICAL_V2");
assert.equal(output.audit.multiWorldPurchase.ticketClassVersion,MULTI_WORLD_TICKET_CLASS_VERSION);
assert.equal(prediction.standardPurchasePlan[0].ticketClass,undefined,"input stays immutable");
console.log(JSON.stringify({ok:true,cases:20,ticketCount:output.standardPurchasePlan.length,worldDistribution:{MAIN:6,SECONDARY:4,SCENARIO_BREAK:5},winningTicket:{order:"3-5-4",worldClass:"SECONDARY",scenarioRank:2,scenarioTicketRank:2},selectionFingerprint:beforeHash}));
