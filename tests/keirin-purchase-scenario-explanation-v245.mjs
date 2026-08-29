import assert from"node:assert/strict";
import fs from"node:fs";
import{attachPurchaseScenarioExplanations}from"../keirin/engine/purchase-scenario-explanation.mjs";
import{createSnapshot}from"../public/prediction-store.mjs";

const scored=[
  rider(1,"A","自力",{start:8.8,sprint:7.1,finish:6.9,tracking:5.2,recent:7.4}),rider(2,"A","番手",{start:4.8,sprint:5.5,finish:8.4,tracking:8.7,recent:7.8}),
  rider(3,"B","自力",{start:7.3,sprint:9.1,finish:8.2,tracking:5.4,recent:8.0}),rider(4,"B","番手",{start:4.2,sprint:5.1,finish:7.6,tracking:8.5,recent:7.2}),
  rider(5,"solo-5","単騎",{start:5.4,sprint:8.3,finish:8.8,tracking:7.4,recent:7.9}),rider(6,"C","自力",{start:8.1,sprint:6.8,finish:6.4,tracking:4.9,recent:6.7}),
  rider(7,"C","番手",{start:4.1,sprint:4.8,finish:7.1,tracking:8.1,recent:6.9})
];
const lines=[line("A",1,2),line("B",3,4),line("C",6,7)];
const cases=[
  {name:"先行押し切り＋番手＋別線3着",type:"LEADER_HOLD",order:[1,2,4],line:"A",need:["主導権","同じライン","残る3着争い"]},
  {name:"番手差し＋先行残り",type:"BANTE_SASHI",order:[2,1,4],line:"A",need:["番手","直線で交わす","先行した1番"]},
  {name:"捲り1着＋追走2着",type:"MAKURI_SUCCESS",order:[3,4,2],line:"B",need:["まくりを仕掛け","同じ仕掛けに続き","残る3着争い"]},
  {name:"単騎浮上",type:"SOLO_RISE",order:[5,2,4],line:null,need:["単騎","仕掛け","残る3着争い"]},
  {name:"ライン分断・別線残り",type:"LINE_SEPARATION",order:[2,4,7],line:"A",need:["隊列が乱れ","空いた位置","残る3着争い"]}
];
for(const fixture of cases){
  const branch={id:`B-${fixture.type}`,label:`${fixture.name}枝`,branchType:fixture.type,primaryLineId:fixture.line,requiredFirstNumber:fixture.order[0],initiative:{rank:1}};
  const alternate={order:[fixture.order[0],fixture.order[1],6],probability:.09,nodeTrace:trace(fixture.order[0],fixture.order[1],6),branchContributions:[contribution(branch,.09)]};
  const terminal={order:fixture.order,probability:.16,nodeTrace:trace(...fixture.order),branchContributions:[contribution(branch,.12),{...contribution(branch,.04),branchId:`S-${fixture.type}`,branchLabel:`${fixture.name}補助枝`}],dominantBranchId:branch.id,dominantBranchLabel:branch.label};
  const original={order:fixture.order,betClass:"MAIN",probability:.16,purchaseStatus:"購入採用",stake:300};
  const [result]=attachPurchaseScenarioExplanations({plans:[original],classified:[terminal,alternate],scored,lines,branches:[branch]});
  const text=result.scenarioExplanation;
  for(const phrase of fixture.need)assert.ok(text.includes(phrase),`${fixture.name}: ${phrase}`);
  assert.ok(text.includes("まで成立すると"));assert.ok(text.includes("も同じ1-2着からの3着候補"));assert.ok(text.includes("この目が崩れるのは"));
  assert.ok(text.split("\n\n").length>=3&&text.split("\n\n").length<=4);
  for(const banned of["自然な並びです","確率上位なので有力です","番手なので2着です","3着として自然です","オッズ妙味があります","この組み合わせが成立しやすいです"]){assert.equal(text.includes(banned),false)}
  for(const key of["order","betClass","probability","purchaseStatus","stake"])assert.deepEqual(result[key],original[key],`${key} changed`);
  assert.ok(result.explanationContext.primaryBranch.id);assert.ok(result.explanationContext.supportingBranches.length===1);
}

const girlsScored=scored.slice(0,5).map(rider=>({...rider,lineId:null,role:null,evidence:{...rider.evidence,finish:rider.number===5?0:rider.evidence.finish}}));
const girlsBranch={id:"BATTLE",label:"主導権争い・消耗",branchType:"LEAD_BATTLE",requiredFirstNumber:2};
const girlsTerminal={order:[2,1,5],probability:.02,nodeTrace:[],branchContributions:[contribution(girlsBranch,.02)]};
const [girlsResult]=attachPurchaseScenarioExplanations({plans:[{order:[2,1,5],betClass:"MAIN",probability:.02}],classified:[girlsTerminal,{order:[2,1,3],probability:.019,nodeTrace:[],branchContributions:[contribution(girlsBranch,.019)]}],scored:girlsScored,lines:[{id:"provisional",type:"仮ライン"}],branches:[girlsBranch]});
assert.equal(girlsResult.scenarioExplanation.includes("別線から"),false,"ライン入力なしで別線を創作しない");
assert.equal(girlsResult.scenarioExplanation.includes("0.00"),false,"欠損相当のゼロ値を根拠表示しない");
assert.ok(girlsResult.scenarioExplanation.includes("競合条件が前面に出ると3着が入れ替わる"));

const [sealedPlan]=attachPurchaseScenarioExplanations({plans:[{order:[1,2,4],betClass:"MAIN",probability:.16}],classified:[{order:[1,2,4],probability:.16,nodeTrace:trace(1,2,4),branchContributions:[{branchId:"L",branchLabel:"A先行押し切り",branchType:"LEADER_HOLD",primaryLineId:"A",requiredFirstNumber:1,probability:.16}]}],scored,lines,branches:[]});
const snapshot=createSnapshot({race:{date:"20260829",venueCode:"24",venue:"宇都宮",raceNo:1,participants:scored},prediction:{engineVersion:"TEST",standardPurchasePlan:[sealedPlan],purchasePlan:[sealedPlan]}},new Date("2026-08-29T00:00:00Z"));
assert.equal(snapshot.betSelections[0].scenarioExplanation,sealedPlan.scenarioExplanation,"new seal/snapshot path must preserve scenario");
const appSource=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
assert.ok(appSource.includes('if(snapshot?.sealedPrediction?.immutable)return "OLD_SEAL_NO_SCENARIO_EXPLANATION";'),"old immutable seal marker missing");
console.log("PASS purchase scenario explanation v245: 5 patterns + immutable seal compatibility");

function rider(number,lineId,role,evidence){return{number,id:String(number),name:`選手${number}`,lineId,role,evidence,roleScores:{first:evidence.finish,second:evidence.tracking,third:(evidence.tracking+evidence.finish)/2}}}
function line(id,leader,bante){return{id,type:"ライン",leader:scored[leader-1],bante:scored[bante-1],members:[scored[leader-1],scored[bante-1]]}}
function contribution(branch,probability){return{branchId:branch.id,branchLabel:branch.label,branchType:branch.branchType,primaryLineId:branch.primaryLineId,requiredFirstNumber:branch.requiredFirstNumber,probability}}
function trace(first,second,third){return[{stage:"FIRST",event:{participantNumber:first},newRequiredConditions:[{label:"主導権確保"}]},{stage:"SECOND",event:{participantNumber:second},newRequiredConditions:[{label:"追走位置維持"}]},{stage:"THIRD",event:{participantNumber:third},newRequiredConditions:[{label:`${third}番の位置残り`}]}]}
