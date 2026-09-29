import crypto from "node:crypto";

export const MULTI_WORLD_SCHEMA_VERSION="SCENARIO_EVENT_TERMINAL_V1";
export const MULTI_WORLD_PURCHASE_VERSION="KEIRIN_MULTI_WORLD_SCENARIO_PURCHASE_V1";
export const DEFAULT_MULTI_WORLD_PURCHASE_CONFIG=Object.freeze({mainScenarioCap:6,secondaryScenarioCap:4,scenarioBreakCap:3,totalCap:15,minimumScenarioCoverage:2});

const n=value=>Number.isFinite(Number(value))?Number(value):0;
const keyOrder=item=>(item?.order||[]).map(Number).join("-");
const stable=(prefix,value)=>`${prefix}-${crypto.createHash("sha256").update(value).digest("hex").slice(0,12).toUpperCase()}`;
const lineKey=value=>String(value||"UNKNOWN").replace(/[^A-Za-z0-9_-]/g,"_").toUpperCase();

function structuralDescriptor(branch,lines=[]){
  if(branch?.structuralContext){
    const s=branch.structuralContext;
    const competition=Boolean(s.competition||(s.contestLines||[]).length>1);
    return{
      kind:String(s.kind||"UNKNOWN"),
      contestLines:[...(s.contestLines||[])].map(lineKey).sort(),
      dominantLine:competition?"UNRESOLVED":lineKey(s.dominantLine),
      attackMode:String(s.attackMode||"UNKNOWN"),
      competition,split:Boolean(s.split),separation:Boolean(s.separation)
    };
  }
  const active=lines.filter(x=>x?.type==="ライン").map(x=>lineKey(x.id)).sort();
  const primary=lineKey(branch?.primaryLineId);
  switch(branch?.branchType){
    case"LEAD_BATTLE":return{kind:"LEAD_BATTLE",contestLines:active,dominantLine:"UNRESOLVED",attackMode:"LEAD",competition:true,split:false,separation:false};
    case"LINE_SEPARATION":return{kind:"LINE_SEPARATION",contestLines:active,dominantLine:"UNRESOLVED",attackMode:"SPLIT",competition:false,split:true,separation:true};
    case"MAKURI_SUCCESS":return{kind:"MAKURI",contestLines:[],dominantLine:primary,attackMode:"MAKURI",competition:false,split:false,separation:false};
    case"SOLO_RISE":return{kind:"SOLO_RISE",contestLines:[],dominantLine:"SOLO",attackMode:"SOLO",competition:false,split:false,separation:false};
    default:return{kind:"LINE_CONTROL",contestLines:[],dominantLine:primary,attackMode:"LEAD",competition:false,split:false,separation:false};
  }
}

export function macroScenarioSignature(branch,lines=[]){return JSON.stringify(structuralDescriptor(branch,lines));}
export function sameMacroWorld(a,b,lines=[]){return macroScenarioSignature(a,lines)===macroScenarioSignature(b,lines);}

export function buildMultiWorldScenarioStructure({branches=[],terminals=[],lines=[]}={}){
  const branchById=new Map(branches.map(x=>[String(x.id),x]));
  const groups=new Map();
  for(const branch of branches){
    const signature=macroScenarioSignature(branch,lines),descriptor=structuralDescriptor(branch,lines);
    const row=groups.get(signature)||{signature,descriptor,branches:[],score:0};
    row.branches.push(branch);row.score+=n(branch.probability)||n(branch.score);groups.set(signature,row);
  }
  const scenarios=[...groups.values()].sort((a,b)=>b.score-a.score||a.signature.localeCompare(b.signature));
  const scoreSum=scenarios.reduce((s,x)=>s+x.score,0)||1;
  const branchMeta=new Map();
  scenarios.forEach((scenario,scenarioIndex)=>{
    scenario.macroScenarioId=stable("MS",scenario.signature);
    scenario.relativeScenarioScore=scenario.score/scoreSum;
    scenario.scenarioRank=scenarioIndex+1;
    const events=[...scenario.branches].sort((a,b)=>(n(b.probability)||n(b.score))-(n(a.probability)||n(a.score))||String(a.id).localeCompare(String(b.id)));
    const eventSum=events.reduce((s,x)=>s+(n(x.probability)||n(x.score)),0)||1;
    scenario.events=events.map((branch,eventIndex)=>{
      const eventId=`${scenario.macroScenarioId}:E${String(eventIndex+1).padStart(2,"0")}`;
      const event={eventId,branchId:branch.id,branchType:branch.branchType,label:branch.label,eventRelativeScore:(n(branch.probability)||n(branch.score))/eventSum,eventRank:eventIndex+1};
      branchMeta.set(String(branch.id),{scenario,event});return event;
    });
  });
  const rows=terminals.map((terminal,globalIndex)=>{
    const branchId=String(terminal.dominantBranchId||terminal.branchId||terminal.branchContributions?.[0]?.branchId||terminal.contributingBranches?.[0]||"");
    const meta=branchMeta.get(branchId)||branchMeta.get(String(branchById.get(branchId)?.id))||null;
    return{terminal,globalIndex,meta,order:keyOrder(terminal)};
  });
  for(const scenario of scenarios){
    const withinScenario=rows.filter(x=>x.meta?.scenario===scenario).sort((a,b)=>n(b.terminal.terminalScore||b.terminal.score)-n(a.terminal.terminalScore||a.terminal.score)||a.order.localeCompare(b.order));
    withinScenario.forEach((row,index)=>row.rankWithinScenario=index+1);
    for(const event of scenario.events){
      const withinEvent=withinScenario.filter(x=>x.meta?.event===event);
      withinEvent.forEach((row,index)=>row.rankWithinEvent=index+1);
    }
  }
  const terminalMetadata=new Map(rows.map(row=>{
    const scenario=row.meta?.scenario,event=row.meta?.event;
    const metadata={schemaVersion:MULTI_WORLD_SCHEMA_VERSION,macroScenarioId:scenario?.macroScenarioId||null,eventId:event?.eventId||null,terminalId:event?`${event.eventId}:T${String(row.rankWithinEvent||1).padStart(3,"0")}`:null,scenarioRelativeScore:scenario?.relativeScenarioScore??null,eventRelativeScore:event?.eventRelativeScore??null,terminalRelativeScore:n(row.terminal.terminalScore||row.terminal.score||row.terminal.probability),rankWithinEvent:row.rankWithinEvent||null,rankWithinScenario:row.rankWithinScenario||null,globalRank:row.globalIndex+1,structuralSignature:scenario?.signature||null};
    return[row.order,metadata];
  }));
  return{schemaVersion:MULTI_WORLD_SCHEMA_VERSION,scenarios:scenarios.map(x=>({macroScenarioId:x.macroScenarioId,structuralSignature:x.signature,structure:x.descriptor,relativeScenarioScore:x.relativeScenarioScore,scenarioRank:x.scenarioRank,events:x.events})),terminalMetadata,audit:{macroScenarioCount:scenarios.length,duplicateStructuralWorlds:0,structurallyExclusive:true,winnerOrOrderUsedInSignature:false}};
}

export function attachMultiWorldMetadata(terminals,structure){return terminals.map(item=>({...item,...(structure.terminalMetadata.get(keyOrder(item))||{})}));}

export function applyMultiWorldPurchaseSelection(terminals,{enabled=false,config=DEFAULT_MULTI_WORLD_PURCHASE_CONFIG}={}){
  if(!enabled)return{terminals,multiWorldPurchase:{enabled:false,version:MULTI_WORLD_PURCHASE_VERSION,legacyParity:true,config}};
  const candidates=terminals.filter(x=>x.macroScenarioId&&n(x.probability)>0&&["ADOPTED","PURCHASE_CUTOFF","OUTSIDE_PURCHASE_CUTOFF"].includes(x.purchaseRejectCode));
  const scenarioIds=[...new Set(candidates.map(x=>x.macroScenarioId))].sort((a,b)=>n(candidates.find(x=>x.macroScenarioId===b)?.scenarioRelativeScore)-n(candidates.find(x=>x.macroScenarioId===a)?.scenarioRelativeScore)||a.localeCompare(b));
  const selected=new Map();
  const scenarioRanks=new Map();
  scenarioIds.forEach((id,index)=>{
    const cap=index===0?config.mainScenarioCap:index===1?config.secondaryScenarioCap:config.scenarioBreakCap;
    const ranked=candidates.filter(x=>x.macroScenarioId===id).sort((a,b)=>n(b.terminalRelativeScore)-n(a.terminalRelativeScore)||keyOrder(a).localeCompare(keyOrder(b)));
    ranked.forEach((x,rank)=>scenarioRanks.set(keyOrder(x),{scenarioIndex:index,scenarioTicketRank:rank+1,cap}));
    ranked.slice(0,cap).forEach((x,rank)=>selected.set(keyOrder(x),{scenarioIndex:index,scenarioTicketRank:rank+1}));
  });
  const ordered=[...selected.entries()].sort(([,a],[,b])=>a.scenarioIndex-b.scenarioIndex||a.scenarioTicketRank-b.scenarioTicketRank).slice(0,config.totalCap);
  const kept=new Map(ordered);
  const output=terminals.map(item=>{
    const selection=kept.get(keyOrder(item));
    if(!selection){const ranked=scenarioRanks.get(keyOrder(item));if(ranked)return{...item,betClass:"NONE",purchaseStatus:"購入不採用",purchaseRejectCode:ranked.scenarioTicketRank>ranked.cap?"OUTSIDE_SCENARIO_CAP":"OUTSIDE_TOTAL_CAP",dropReason:ranked.scenarioTicketRank>ranked.cap?"OUTSIDE_SCENARIO_CAP":"OUTSIDE_TOTAL_CAP",scenarioTicketRank:ranked.scenarioTicketRank};return item;}
    const scenarioPurchaseClass=selection.scenarioIndex===0?(selection.scenarioTicketRank===1?"MAIN":"COVER"):"SCENARIO_BREAK";
    return{...item,betClass:scenarioPurchaseClass==="MAIN"?"MAIN":"COVER",mainCoverClassification:scenarioPurchaseClass==="MAIN"?"MAIN":"COVER",scenarioPurchaseClass,purchaseStatus:"購入採用",purchaseRejectCode:"ADOPTED",scenarioTicketRank:selection.scenarioTicketRank};
  });
  return{terminals:output,multiWorldPurchase:{enabled:true,version:MULTI_WORLD_PURCHASE_VERSION,legacyParity:false,config,scenarioCountSelected:new Set(output.filter(x=>x.purchaseStatus==="購入採用").map(x=>x.macroScenarioId)).size,totalTickets:output.filter(x=>x.purchaseStatus==="購入採用").length,multipleAxisAllowed:true}};
}

export function buildMultiWorldResultDiagnostic({terminals=[],standardPurchasePlan=[],finishOrder=[]}={}){
  const order=finishOrder.slice(0,3).map(Number).join("-"),terminal=terminals.find(x=>keyOrder(x)===order)||null,purchased=standardPurchasePlan.some(x=>keyOrder(x)===order);
  if(!terminal)return{schemaVersion:"SCENARIO_EVENT_TERMINAL_RESULT_V1",correctTerminalGenerated:false,classification:"CORRECT_SCENARIO_NOT_GENERATED",dropReason:"TERMINAL_NOT_GENERATED",order};
  let dropReason=null;
  if(!purchased)dropReason=terminal.purchaseRejectCode==="OUTSIDE_TOTAL_CAP"?"OUTSIDE_TOTAL_CAP":terminal.rankWithinScenario>({MAIN:6,COVER:4,SCENARIO_BREAK:3}[terminal.scenarioPurchaseClass]||4)?"OUTSIDE_SCENARIO_CAP":terminal.purchaseStatus!=="購入採用"?"TERMINAL_RANK_TOO_LOW":null;
  return{schemaVersion:"SCENARIO_EVENT_TERMINAL_RESULT_V1",correctTerminalGenerated:true,correctMacroScenarioId:terminal.macroScenarioId,correctEventId:terminal.eventId,correctTerminalId:terminal.terminalId,scenarioRank:terminal.scenarioRelativeScore??null,eventRank:terminal.rankWithinEvent,terminalRank:terminal.rankWithinScenario,globalRank:terminal.globalRank,purchased,scenarioPurchaseClass:terminal.scenarioPurchaseClass||null,classification:purchased?"CORRECT_TERMINAL_PURCHASED":"CORRECT_TERMINAL_NOT_PURCHASED",dropReason};
}
