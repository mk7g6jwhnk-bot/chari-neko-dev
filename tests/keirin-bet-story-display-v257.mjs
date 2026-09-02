import assert from"node:assert/strict";
import{buildBetStory,storyInputFingerprint}from"../public/bet-story.mjs";

const riders={one:{number:1,name:"一郎"},two:{number:2,name:"次郎"},three:{number:3,name:"三郎"},four:{number:4,name:"四郎"},six:{number:6,name:"六郎"},seven:{number:7,name:"七郎"}};
const baseContext={hasLineContext:true,initiativeOwner:6,primaryBranch:{id:"F-7",label:"6先行→7番手差し",branchType:"BANTE_SASHI"},first:riders.seven,second:riders.one,third:riders.three,lineRelation12:"different-line",lineRelation23:"different-line",failureConditions:["6番が主導権を取れない","7番の仕掛けが遅れる"]};
const mainA=ticket([7,1,3],"MAIN",baseContext),mainB=ticket([7,1,4],"MAIN",{...baseContext,third:riders.four}),cover=ticket([6,2,7],"COVER",{...baseContext,first:riders.six,second:riders.two,third:riders.seven,initiativeOwner:6,primaryBranch:{id:"F-6-HOLD",label:"6先行残り",branchType:"LEADER_HOLD"},failureConditions:["6番が主導権を取れない"]},{originatingScenarioFamily:"F-6-HOLD",mainDifferenceReason:"6番が先行から粘って前残りになる"});
const standard={targetRace:{raceCategory:"standard"}},girls={targetRace:{raceCategory:"girls"}},unknown={targetRace:{raceCategory:"standard"}};

const first=buildBetStory(standard,mainA),again=buildBetStory(standard,mainA);assert.deepEqual(first,again,"A deterministic");
const sibling=buildBetStory(standard,mainB);assert.equal(first.scenario.split("。 ")[0],sibling.scenario.split("。 ")[0],"B same family base");assert.equal(first.familyKey,sibling.familyKey);
const coverStory=buildBetStory(standard,cover);assert.match(coverStory.scenario,/MAIN.*COVER/);assert.match(coverStory.scenario,/前残り/);console.log("C COVER difference PASS");
const girlsTicket=ticket([7,3,4],"MAIN",{...baseContext,hasLineContext:false,first:riders.seven,second:riders.three,third:riders.four,primaryBranch:{id:"G",label:"位置取り",branchType:"LEAD_BATTLE"}});const girlsStory=buildBetStory(girls,girlsTicket);for(const banned of["番手","ライン","別線","同じ仕掛け","後位","外から","先に仕掛け","前へ出る"])assert.doesNotMatch(girlsStory.scenario,new RegExp(banned),`D girls invented ${banned}`);
const unknownTicket=ticket([3,4,1],"MAIN",{...baseContext,hasLineContext:false,first:riders.three,second:riders.four,third:riders.one,initiativeOwner:null,primaryBranch:{id:"UNKNOWN",label:"展開未確認",branchType:"LEAD_BATTLE"}});const unknownStory=buildBetStory(unknown,unknownTicket);for(const banned of["番手","ライン","別線","後位","外から","先に仕掛け","前へ出る"])assert.doesNotMatch(unknownStory.scenario,new RegExp(banned),`E unknown invented ${banned}`);
const before=buildBetStory({...standard,result:null},mainA),after=buildBetStory({...standard,result:{status:"confirmed",finishOrder:[3,2,1],payout:9999}},mainA);assert.deepEqual(before,after,"F/G result leakage");assert.equal(storyInputFingerprint({...standard,result:null},mainA),storyInputFingerprint({...standard,result:{status:"confirmed"}},mainA));
const compact={targetRace:{raceCategory:"standard"}},full={...standard,participants:Object.values(riders),result:{status:"confirmed"},predictionOutput:{audit:{huge:true}}};assert.deepEqual(buildBetStory(full,mainA),buildBetStory(compact,mainA),"H FULL/COMPACT mismatch");
const immutable=structuredClone(mainA),serialized=JSON.stringify(mainA);buildBetStory(standard,immutable);assert.equal(JSON.stringify(immutable),serialized,"I immutable mutation");
for(const story of[first,sibling,coverStory,girlsStory,unknownStory]){assert.ok(story.scenario.length>35);assert.ok(story.failureConditions.length>=1);for(const banned of["scenarioFamilyId","natural boundary","support score","branch ID","node"])assert.doesNotMatch(story.scenario,new RegExp(banned,"i"));}
const noFailure=ticket([1,2,3],"MAIN",{...baseContext,failureConditions:[]});assert.deepEqual(buildBetStory(standard,noFailure).failureConditions,[],"must not invent failure conditions");
const audited24=[
  spec([1,6,7],"MAIN","LEAD_BATTLE",false),spec([6,1,7],"COVER","LEAD_BATTLE",false),spec([4,5,1],"MAIN","MAKURI_SUCCESS",true,"same-line"),spec([4,1,5],"COVER","MAKURI_SUCCESS",true),
  spec([3,5,4],"MAIN","MAKURI_SUCCESS",true),spec([3,4,5],"COVER","MAKURI_SUCCESS",true,"same-line"),spec([5,3,4],"COVER","LEADER_HOLD",true),spec([2,5,1],"MAIN","MAKURI_SUCCESS",true,"same-line"),
  spec([2,3,1],"MAIN","MAKURI_SUCCESS",true),spec([2,3,5],"MAIN","MAKURI_SUCCESS",true),spec([3,5,1],"MAIN","MAKURI_SUCCESS",true),spec([3,1,5],"MAIN","MAKURI_SUCCESS",true,"same-line"),
  spec([3,7,1],"MAIN","MAKURI_SUCCESS",true,"same-line"),spec([4,2,1],"MAIN","MAKURI_SUCCESS",true),spec([5,1,7],"MAIN","LEADER_HOLD",true),spec([5,1,2],"MAIN","LEADER_HOLD",true),
  spec([5,4,7],"MAIN","MAKURI_SUCCESS",true,"same-line"),spec([5,7,4],"MAIN","MAKURI_SUCCESS",true),spec([4,2,5],"MAIN","MAKURI_SUCCESS",true,"same-line"),spec([4,5,2],"MAIN","MAKURI_SUCCESS",true),
  spec([6,2,7],"COVER","LEADER_HOLD",true),spec([3,4,1],"MAIN","LEAD_BATTLE",false),spec([7,3,4],"MAIN","LEAD_BATTLE",false),spec([7,1,3],"MAIN","BANTE_SASHI",true)
];
const forbidden=["別の位置から前団直後","前の踏み合いで浮上","後位から追走","外から伸び","先に仕掛けて前へ出る","直線で抜け出す","打鐘","最終ホーム","バック","3角","4角"];
for(const row of audited24){const story=buildBetStory(row.snapshot,row.ticket);for(const phrase of forbidden)assert.equal(story.scenario.includes(phrase),false,`${row.ticket.order.join("-")} invented ${phrase}`);assert.deepEqual(story.failureConditions,["保存済み失敗条件とこの着順は崩れる。"])}
console.log(JSON.stringify({samples:[first,sibling,coverStory,girlsStory,unknownStory]},null,2));
console.log("PASS bet story display A-I / FULL-COMPACT 5/5 / mutation 0 / result leakage 0");

function ticket(order,category,explanationContext,extra={}){return{order,category,originatingScenarioFamily:"F-7",scenarioFamilyLabel:"6先行→7抜け出し",naturalConvergenceScore:.72,scenarioFamilySupport:.64,probability:.014,terminalProbability:.014,scenarioFamilyProbability:.36,explanationContext,...extra}}
function spec(order,category,branchType,hasLine,lineRelation12="different-line"){const people=order.map(number=>({number,name:`選手${number}`})),context={hasLineContext:hasLine,initiativeOwner:order[0],primaryBranch:{id:`F-${branchType}`,label:branchType,branchType},first:people[0],second:people[1],third:people[2],lineRelation12,lineRelation23:"different-line",failureConditions:["保存済み失敗条件"]};return{snapshot:{targetRace:{raceCategory:hasLine?"standard":"girls"}},ticket:ticket(order,category,context,category==="COVER"?{mainDifferenceReason:"保存済み差分になる"}:{})}}
