export function comparePredictionLedgers({currentTerminals=[],researchTerminals=[],officialOrder,observedStateOutcomes=null}){
  const order=(officialOrder||[]).map(Number).slice(0,3);
  if(order.length<3)throw new Error("officialOrder requires confirmed top three");
  const current=evaluateLedger(currentTerminals,order,row=>Number(row.probability)||0);
  const research=evaluateLedger(researchTerminals,order,row=>Number(row.terminalProbability??row.probability)||0);
  return{
    version:"CURRENT-RESEARCH-RANK-COMPARATOR-1.0",officialOrder:order,
    current,research,
    delta:{exactTerminalRank:rankDelta(current.exactTerminalRank,research.exactTerminalRank),firstRank:rankDelta(current.firstRank,research.firstRank),pairRank:rankDelta(current.pairRank,research.pairRank),thirdWithinPairRank:rankDelta(current.thirdWithinPairRank,research.thirdWithinPairRank)},
    firstDropState:findFirstDropState(researchTerminals,order,observedStateOutcomes),
    purchaseDataUsed:false,oddsUsed:false
  };
}

export function summarizeRankComparisons(rows=[]){
  const rate=(predicate)=>rows.length?rows.filter(predicate).length/rows.length:null;
  return{
    raceCount:rows.length,
    current:metrics(rows.map(row=>row.current)),research:metrics(rows.map(row=>row.research)),
    exactTerminalGeneratedRate:{current:rate(row=>row.current.exactTerminalGenerated),research:rate(row=>row.research.exactTerminalGenerated)},
    stateVerification:{verified:rows.filter(row=>row.firstDropState.status!=="UNVERIFIED").length,unverified:rows.filter(row=>row.firstDropState.status==="UNVERIFIED").length}
  };
}

function evaluateLedger(ledger,order,probabilityOf){
  const rows=(ledger||[]).map(row=>({...row,_p:probabilityOf(row)})).sort((a,b)=>b._p-a._p||a.order.join("-").localeCompare(b.order.join("-"),"en"));
  const exact=rows.findIndex(row=>same(row.order,order));
  const firstMass=group(rows,row=>String(row.order?.[0]));
  const pairMass=group(rows.filter(row=>Number(row.order?.[0])===order[0]),row=>`${row.order?.[0]}-${row.order?.[1]}`);
  const thirdMass=group(rows.filter(row=>Number(row.order?.[0])===order[0]&&Number(row.order?.[1])===order[1]),row=>String(row.order?.[2]));
  return{
    exactTerminalGenerated:exact>=0,exactTerminalRank:exact>=0?exact+1:null,
    firstRank:rankGroup(firstMass,String(order[0])),pairRank:rankGroup(pairMass,`${order[0]}-${order[1]}`),thirdWithinPairRank:rankGroup(thirdMass,String(order[2])),
    exactTerminalProbability:exact>=0?rows[exact]._p:0
  };
}
function findFirstDropState(terminals,order,observed){
  if(!observed||typeof observed!=="object")return{status:"UNVERIFIED",stateType:null,reason:"STATE_OUTCOMES_NOT_INDEPENDENTLY_OBSERVED"};
  const terminal=(terminals||[]).find(row=>same(row.order,order));
  if(!terminal)return{status:"TERMINAL_NOT_GENERATED",stateType:"TERMINAL",reason:"EXACT_TERMINAL_ABSENT"};
  const stages=["INITIATIVE","ATTACK_OUTCOME","LINE_TRACKING","OTHER_LINE_SURVIVAL","FOURTH_CORNER_POSITION"];
  for(const stage of stages){
    if(!Object.hasOwn(observed,stage))continue;
    const supported=(terminal.contributions||[]).some(contribution=>(contribution.transitionProbabilities||[]).some(node=>node.stateType===stage&&node.outcomeCode===observed[stage]));
    if(!supported)return{status:"FIRST_DROP_IDENTIFIED",stateType:stage,expectedOutcome:observed[stage],reason:"NO_EXACT_TERMINAL_PATH_RETAINED_OBSERVED_STATE"};
  }
  return{status:"NO_STATE_DROP",stateType:null,reason:"ALL_INDEPENDENTLY_OBSERVED_STATES_RETAINED"};
}
function metrics(rows){const within=(key,n)=>rows.length?rows.filter(row=>Number(row[key])>0&&Number(row[key])<=n).length/rows.length:null;return{exactTop10:within("exactTerminalRank",10),exactTop20:within("exactTerminalRank",20),exactTop30:within("exactTerminalRank",30),firstTop1:within("firstRank",1),firstTop3:within("firstRank",3),pairTop3:within("pairRank",3),pairTop5:within("pairRank",5),thirdTop3:within("thirdWithinPairRank",3),thirdTop5:within("thirdWithinPairRank",5),terminalNotGeneratedRate:rows.length?rows.filter(row=>!row.exactTerminalGenerated).length/rows.length:null}}
function group(rows,keyOf){const map=new Map();for(const row of rows){const key=keyOf(row);map.set(key,(map.get(key)||0)+row._p)}return[...map].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"en"))}
function rankGroup(groups,key){const index=groups.findIndex(([candidate])=>candidate===key);return index>=0?index+1:null}
function rankDelta(current,research){return Number.isFinite(current)&&Number.isFinite(research)?current-research:null}
function same(a,b){return Array.isArray(a)&&a.slice(0,3).map(Number).join("-")===b.join("-")}
