const STAGES=['GENERATED','MEANINGFUL','PURCHASE_CANDIDATE','FINAL_PURCHASE','FINAL_CLASS'];
const DROPS=['DROP_AT_MEANINGFUL','DROP_AT_PURCHASE_CANDIDATE','DROP_AT_FINAL_PURCHASE','PURCHASE_INELIGIBLE','EXACT_PURCHASE_HIT','UNKNOWN'];
const REASONS=['PAIR_DIRECTION_OR_RANK','THIRD_CONDITIONAL','TERMINAL_RELATIVE_RANK','CLIFF_BOUNDARY','PURCHASE_COMPRESSION','PURCHASE_INELIGIBLE','CLASSIFICATION_ONLY','UNKNOWN'];
const parts=value=>(Array.isArray(value)?value:String(value||'').match(/\d+/g)||[]).map(Number);
const tally=(values,names)=>Object.fromEntries(names.map(name=>[name,values.filter(value=>value===name).length]));

function directReason(row,diagnosis,dropStage){
  const code=String(diagnosis.terminal.purchaseRejectCode||'');
  const reason=String(diagnosis.terminal.purchaseReason||'');
  if(dropStage==='PURCHASE_INELIGIBLE')return'PURCHASE_INELIGIBLE';
  if(dropStage==='DROP_AT_FINAL_PURCHASE')return'PURCHASE_COMPRESSION';
  if(!diagnosis.pair.meaningful&&(diagnosis.pair.reverseMeaningful||diagnosis.pair.generated))return'PAIR_DIRECTION_OR_RANK';
  if(/THIRD_VARIANT_BOUNDARY|CLIFF/i.test(`${code} ${reason}`))return'CLIFF_BOUNDARY';
  if(/THIRD/i.test(`${code} ${reason}`)||diagnosis.pair.meaningful&&!diagnosis.terminal.meaningful)return'THIRD_CONDITIONAL';
  if(diagnosis.terminal.globalRank!=null||diagnosis.terminal.scenarioFamilyRank!=null||/RANK/i.test(`${code} ${reason}`))return'TERMINAL_RELATIVE_RANK';
  if(diagnosis.terminal.meaningful&&!diagnosis.terminal.purchaseCandidate)return'CLASSIFICATION_ONLY';
  return'UNKNOWN';
}

export function auditTerminalSurvival(row,diagnosis){
  const actual=parts(row.result.finishOrder),actualKey=actual.join('-'),tickets=row.purchase.tickets||[];
  const exactTicket=tickets.find(ticket=>parts(ticket.order).join('-')===actualKey);
  const finalRiders=new Set(tickets.flatMap(ticket=>parts(ticket.order)));
  const exactPairFinal=tickets.some(ticket=>{const p=parts(ticket.order);return p[0]===actual[0]&&p[1]===actual[1]});
  const reversePairFinal=tickets.some(ticket=>{const p=parts(ticket.order);return p[0]===actual[1]&&p[1]===actual[0]});
  const sameRidersFinal=tickets.some(ticket=>parts(ticket.order).slice().sort((a,b)=>a-b).join('-')===actual.slice().sort((a,b)=>a-b).join('-'));
  const sameRidersMeaningful=(row.prediction?.terminals||[]).some(terminal=>(terminal.representativeTerminal===true||['ADOPTED','THIRD_VARIANT_AMBIGUITY','THIRD_VARIANT_BOUNDARY'].includes(terminal.purchaseRejectCode))&&parts(terminal.order).slice().sort((a,b)=>a-b).join('-')===actual.slice().sort((a,b)=>a-b).join('-'));
  const eligible=row.purchase.eligibility==='PURCHASE_ALLOWED';
  let dropStage='UNKNOWN';
  if(diagnosis.terminal.purchased)dropStage='EXACT_PURCHASE_HIT';
  else if(!eligible)dropStage='PURCHASE_INELIGIBLE';
  else if(!diagnosis.terminal.generated||!diagnosis.terminal.meaningful)dropStage='DROP_AT_MEANINGFUL';
  else if(!diagnosis.terminal.purchaseCandidate)dropStage='DROP_AT_PURCHASE_CANDIDATE';
  else if(!diagnosis.terminal.purchased)dropStage='DROP_AT_FINAL_PURCHASE';
  const reason=diagnosis.terminal.purchased?null:directReason(row,diagnosis,dropStage);
  const stages={GENERATED:diagnosis.terminal.generated,MEANINGFUL:diagnosis.terminal.meaningful,PURCHASE_CANDIDATE:diagnosis.terminal.purchaseCandidate,FINAL_PURCHASE:diagnosis.terminal.purchased,FINAL_CLASS:exactTicket?.class||null};
  return{schemaVersion:'TERMINAL_SURVIVAL_AUDIT_V1',reconstruction:'FULL',raceKey:row.raceKey,actualOrder:actualKey,stages,deepestStage:diagnosis.terminal.purchased?'FINAL_CLASS':diagnosis.terminal.purchaseCandidate?'PURCHASE_CANDIDATE':diagnosis.terminal.meaningful?'MEANINGFUL':diagnosis.terminal.generated?'GENERATED':'UNKNOWN',dropStage,reason,
    pair:{generated:diagnosis.pair.generated,meaningful:diagnosis.pair.meaningful,purchaseCandidate:diagnosis.pair.purchaseCandidate,finalPurchase:diagnosis.pair.finalPurchase,reverseMeaningful:diagnosis.pair.reverseMeaningful,exactFinal:exactPairFinal,reverseFinal:reversePairFinal,reverseOnly:!exactPairFinal&&reversePairFinal},
    third:{generated:diagnosis.third.generated,meaningful:diagnosis.pair.meaningful&&diagnosis.terminal.meaningful,purchaseCandidate:diagnosis.pair.purchaseCandidate&&diagnosis.terminal.purchaseCandidate,rank:diagnosis.third.rank,conditionalMiss:diagnosis.pair.meaningful&&!diagnosis.terminal.meaningful},
    finalRiderCoverage:{count:actual.filter(rider=>finalRiders.has(rider)).length,winner:finalRiders.has(actual[0]),winnerFirst:tickets.some(ticket=>parts(ticket.order)[0]===actual[0]),exactPair:exactPairFinal,exactThreeRiders:sameRidersFinal,exactTrifecta:diagnosis.terminal.purchased},
    trio:{exactMeaningful:sameRidersMeaningful,purchaseDerivedHit:sameRidersFinal,trifectaMissTrioHit:sameRidersFinal&&!diagnosis.terminal.purchased},
    evidence:{purchaseEligibility:row.purchase.eligibility,purchaseRejectCode:diagnosis.terminal.purchaseRejectCode,purchaseReason:diagnosis.terminal.purchaseReason,globalRank:diagnosis.terminal.globalRank,scenarioFamilyRank:diagnosis.terminal.scenarioFamilyRank}};
}

export function auditSavedTerminalDiagnosis(diagnosis){
  let dropStage='UNKNOWN';if(diagnosis.terminal?.purchased)dropStage='EXACT_PURCHASE_HIT';else if(!diagnosis.terminal?.generated||!diagnosis.terminal?.meaningful)dropStage='DROP_AT_MEANINGFUL';else if(!diagnosis.terminal?.purchaseCandidate)dropStage='DROP_AT_PURCHASE_CANDIDATE';else if(diagnosis.primaryCause==='PURCHASE_INELIGIBLE')dropStage='PURCHASE_INELIGIBLE';else dropStage='DROP_AT_FINAL_PURCHASE';
  let reason='UNKNOWN';if(dropStage==='EXACT_PURCHASE_HIT')reason=null;else if(dropStage==='PURCHASE_INELIGIBLE')reason='PURCHASE_INELIGIBLE';else if(!diagnosis.pair?.meaningful&&(diagnosis.pair?.reverseMeaningful||diagnosis.pair?.generated))reason='PAIR_DIRECTION_OR_RANK';else if(diagnosis.primaryCause==='THIRD_CONDITIONAL_MISS')reason='THIRD_CONDITIONAL';else if(dropStage==='DROP_AT_FINAL_PURCHASE')reason='PURCHASE_COMPRESSION';else if(diagnosis.terminal?.globalRank!=null||diagnosis.terminal?.scenarioFamilyRank!=null)reason='TERMINAL_RELATIVE_RANK';
  return{schemaVersion:'TERMINAL_SURVIVAL_AUDIT_V1',reconstruction:'PARTIAL',raceKey:diagnosis.raceKey,actualOrder:diagnosis.actualOrder,stages:{GENERATED:Boolean(diagnosis.terminal?.generated),MEANINGFUL:Boolean(diagnosis.terminal?.meaningful),PURCHASE_CANDIDATE:Boolean(diagnosis.terminal?.purchaseCandidate),FINAL_PURCHASE:Boolean(diagnosis.terminal?.purchased),FINAL_CLASS:null},deepestStage:diagnosis.terminal?.purchased?'FINAL_PURCHASE':diagnosis.terminal?.purchaseCandidate?'PURCHASE_CANDIDATE':diagnosis.terminal?.meaningful?'MEANINGFUL':diagnosis.terminal?.generated?'GENERATED':'UNKNOWN',dropStage,reason,pair:{...diagnosis.pair,exactFinal:null,reverseFinal:null,reverseOnly:null},third:{...diagnosis.third,conditionalMiss:diagnosis.pair?.meaningful&&!diagnosis.terminal?.meaningful},finalRiderCoverage:{count:null,winner:null,winnerFirst:null,exactPair:null,exactThreeRiders:null,exactTrifecta:Boolean(diagnosis.terminal?.purchased)},trio:{exactMeaningful:null,purchaseDerivedHit:null,trifectaMissTrioHit:null},evidence:{source:'SAVED_PREDICTION_DISTANCE_DIAGNOSIS',limitations:['PURCHASE_ELIGIBILITY_NOT_PERSISTED_PER_RACE','FINAL_TICKET_RIDER_SET_NOT_PERSISTED']}};
}

export function summarizeTerminalSurvival(races,{unreconstructable=0}={}){
  const at=stage=>races.filter(race=>race.stages?.[stage]===true||stage==='FINAL_CLASS'&&race.stages?.FINAL_CLASS).length;
  const partial=races.filter(race=>race.reconstruction==='PARTIAL').length,coverage=Object.fromEntries([3,2,1,0].map(n=>[`P${n}`,races.filter(race=>race.finalRiderCoverage?.count===n).length]));coverage.UNKNOWN=races.filter(race=>race.finalRiderCoverage?.count==null).length+unreconstructable;
  const stages=Object.fromEntries(STAGES.map(stage=>[stage,at(stage)])),total=races.length+unreconstructable,drops=tally(races.map(race=>race.dropStage),DROPS),reasons=tally(races.map(race=>race.reason),REASONS);drops.UNKNOWN+=unreconstructable;reasons.UNKNOWN+=unreconstructable;
  return{schemaVersion:'TERMINAL_SURVIVAL_SUMMARY_V1',races:total,reconstructed:races.length-partial,partiallyReconstructed:partial,unreconstructable,stages,stageRates:Object.fromEntries(STAGES.map(stage=>[stage,total?stages[stage]/total:null])),drops,reasons,finalRiderCoverage:coverage,pair:{exactFinal:races.filter(r=>r.pair.exactFinal===true).length,reverseFinal:races.filter(r=>r.pair.reverseFinal===true).length,reverseOnly:races.filter(r=>r.pair.reverseOnly===true).length,purchaseSelectionMiss:races.filter(r=>r.dropStage==='DROP_AT_FINAL_PURCHASE').length},thirdConditionalMiss:races.filter(r=>r.third.conditionalMiss).length,trio:{exactMeaningful:races.filter(r=>r.trio.exactMeaningful===true).length,purchaseDerivedHit:races.filter(r=>r.trio.purchaseDerivedHit===true).length,trifectaMissTrioHit:races.filter(r=>r.trio.trifectaMissTrioHit===true).length}};
}

export function mergeTerminalSurvivalSummaries(...summaries){
  const valid=summaries.filter(Boolean),sum=(path)=>valid.reduce((total,item)=>total+path.reduce((value,key)=>value?.[key],item)||total,0);
  const mergeNames=(key,names)=>Object.fromEntries(names.map(name=>[name,valid.reduce((total,item)=>total+(Number(item?.[key]?.[name])||0),0)]));
  const stages=mergeNames('stages',STAGES),races=sum(['races']);return{schemaVersion:'TERMINAL_SURVIVAL_SUMMARY_V1',races,reconstructed:sum(['reconstructed']),partiallyReconstructed:sum(['partiallyReconstructed']),unreconstructable:sum(['unreconstructable']),stages,stageRates:Object.fromEntries(STAGES.map(stage=>[stage,races?stages[stage]/races:null])),drops:mergeNames('drops',DROPS),reasons:mergeNames('reasons',REASONS),finalRiderCoverage:mergeNames('finalRiderCoverage',['P3','P2','P1','P0','UNKNOWN']),pair:{exactFinal:sum(['pair','exactFinal']),reverseFinal:sum(['pair','reverseFinal']),reverseOnly:sum(['pair','reverseOnly']),purchaseSelectionMiss:sum(['pair','purchaseSelectionMiss'])},thirdConditionalMiss:sum(['thirdConditionalMiss']),trio:{exactMeaningful:sum(['trio','exactMeaningful']),purchaseDerivedHit:sum(['trio','purchaseDerivedHit']),trifectaMissTrioHit:sum(['trio','trifectaMissTrioHit'])}};
}
