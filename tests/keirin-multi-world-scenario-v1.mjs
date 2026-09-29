import assert from"node:assert/strict";
import{applyMultiWorldPurchaseSelection,attachMultiWorldMetadata,buildMultiWorldResultDiagnostic,buildMultiWorldScenarioStructure,sameMacroWorld}from"../keirin/engine/multi-world-scenario.mjs";
import{runKeirinEngine}from"../keirin/engine/keirin-engine.mjs";

const lines=[{id:"L1",type:"ライン"},{id:"L2",type:"ライン"},{id:"L3",type:"ライン"}];
const branch=(id,kind,contestLines,dominantLine,probability=.3)=>({id,label:id,branchType:id,probability,score:probability,structuralContext:{kind,contestLines,dominantLine,attackMode:kind.includes("MAKURI")?"MAKURI":"LEAD",competition:contestLines.length>1}});
const a1=branch("A1","LEAD_BATTLE",["L1","L2"],"L1",.3),a2=branch("A2","LEAD_BATTLE",["L2","L1"],"L2",.25),b1=branch("B1","ALT_LEADER",[],"L3",.2);
assert.equal(sameMacroWorld(a1,a2,lines),true,"same lead contest must be one macro world");
assert.equal(sameMacroWorld(a1,b1,lines),false,"structurally separate leader must be another macro world");

const orders=[[1,2,3],[1,3,2],[1,2,4],[1,4,2],[2,1,3],[2,3,1],[2,1,4],[3,1,2],[3,2,1],[3,1,4],[3,4,1],[4,1,2],[4,2,1],[4,1,3]];
const terminals=[];
for(let i=0;i<14;i++){const id=i<7?"A1":i<11?"B1":"C1";terminals.push({order:orders[i],branchId:id,dominantBranchId:id,probability:.1-i*.002,score:1-i*.02,terminalScore:1-i*.02,purchaseStatus:"購入採用",purchaseRejectCode:"ADOPTED",betClass:i===0?"MAIN":"COVER"});}
const c1=branch("C1","MAKURI_WORLD",[],"L2",.1);
const structure=buildMultiWorldScenarioStructure({branches:[a1,a2,b1,c1],terminals,lines});
assert.equal(structure.scenarios.length,3);
assert.equal(structure.audit.duplicateStructuralWorlds,0);
const enriched=attachMultiWorldMetadata(terminals,structure);
const on=applyMultiWorldPurchaseSelection(enriched,{enabled:true});
assert.equal(on.multiWorldPurchase.totalTickets,13,"6+4+3 is permitted");
assert.equal(on.multiWorldPurchase.scenarioCountSelected,3);
assert.equal(on.multiWorldPurchase.multipleAxisAllowed,true,"multiple axes are permitted and never a rejection reason");
assert.ok(new Set(on.terminals.filter(x=>x.purchaseStatus==="購入採用").map(x=>x.order[0])).size>1,"different worlds may use different axes");
assert.equal(on.terminals.filter(x=>x.macroScenarioId===structure.scenarios[0].macroScenarioId&&x.purchaseStatus==="購入採用").length,6,"one scenario cannot consume 13 tickets");
assert.ok(on.terminals.some(x=>x.scenarioPurchaseClass==="SCENARIO_BREAK"));
const oneWorldOrders=[];for(let b=2;b<=7;b++)for(let c=2;c<=7;c++)if(b!==c&&oneWorldOrders.length<13)oneWorldOrders.push([1,b,c]);
const oneWorld=applyMultiWorldPurchaseSelection(oneWorldOrders.map((order,i)=>({...enriched[0],order,terminalRelativeScore:13-i,purchaseStatus:"購入採用",purchaseRejectCode:"ADOPTED"})),{enabled:true});
assert.equal(oneWorld.terminals.filter(x=>x.purchaseStatus==="購入採用").length,6,"a single world cannot consume thirteen tickets");

const off=applyMultiWorldPurchaseSelection(enriched,{enabled:false});
assert.deepEqual(off.terminals,enriched,"feature flag OFF must preserve legacy selection exactly");
assert.equal(off.multiWorldPurchase.legacyParity,true);

const capped=on.terminals.find(x=>x.rankWithinScenario===7);
const diag=buildMultiWorldResultDiagnostic({terminals:on.terminals,standardPurchasePlan:on.terminals.filter(x=>x.purchaseStatus==="購入採用"),finishOrder:capped.order});
assert.equal(diag.dropReason,"OUTSIDE_SCENARIO_CAP");
const absent=buildMultiWorldResultDiagnostic({terminals:on.terminals,standardPurchasePlan:[],finishOrder:[9,8,7]});
assert.equal(absent.classification,"CORRECT_SCENARIO_NOT_GENERATED");

const participants=Array.from({length:7},(_,i)=>({id:String(i+1),number:i+1,name:`R${i+1}`,lineId:`L${Math.floor(i/2)+1}`,lineOrder:i%2+1,recentForm:7-i/3,startPower:8-i/4,sprintPower:7-i/5,finishPower:6+i/4,trackingSkill:6+i/5}));
delete process.env.KEIRIN_MULTI_WORLD_SCENARIO_PURCHASE_V1;const legacy=runKeirinEngine({race:{id:"legacy-parity",participants,lineConfidence:"高"},budget:3000});
process.env.KEIRIN_MULTI_WORLD_SCENARIO_PURCHASE_V1="1";const integrated=runKeirinEngine({race:{id:"multi-world",participants,lineConfidence:"高"},budget:3000});delete process.env.KEIRIN_MULTI_WORLD_SCENARIO_PURCHASE_V1;
assert.equal(legacy.audit.multiWorldPurchase.legacyParity,true);
assert.equal(integrated.audit.multiWorldPurchase.enabled,true);
assert.ok(integrated.multiWorldScenario.scenarios.length>=2);
assert.ok(integrated.prediction.terminals.every(x=>x.macroScenarioId&&x.eventId&&x.terminalId));
assert.ok(integrated.standardPurchasePlan.length<=15);
assert.equal(integrated.audit.predictionPurchaseBoundaryAudit.predictionSnapshotUnchanged,true);

console.log(JSON.stringify({passed:true,cases:9,macroScenarioCount:structure.scenarios.length,tickets:on.multiWorldPurchase.totalTickets,integratedScenarios:integrated.multiWorldScenario.scenarios.length,integratedTickets:integrated.standardPurchasePlan.length}));
