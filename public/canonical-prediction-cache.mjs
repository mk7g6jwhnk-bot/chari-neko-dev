function text(value){return value==null?null:String(value)}
function orderOf(row){return Array.isArray(row?.order)?row.order.map(Number).join("-"):String(row?.order||"")}
function standardPlan(prediction){return prediction?.canonicalPurchasePlan?.standardTickets||prediction?.standardPurchasePlan||prediction?.purchasePlan||[]}

export function canonicalPurchaseIdentity(response){
  const prediction=response?.predictionPayload?.prediction||response?.prediction||{};
  const tickets=(Array.isArray(response?.tickets)?response.tickets:standardPlan(prediction)).map(row=>({order:orderOf(row),macroScenarioId:text(row?.macroScenarioId),eventId:text(row?.eventId),terminalId:text(row?.terminalId),ticketClass:text(row?.ticketClass||row?.betClass),scenarioPurchaseClass:text(row?.scenarioPurchaseClass)}));
  return{predictionHash:text(response?.predictionHash||response?.predictionIdentity?.predictionHash),predictionVersion:text(response?.predictionVersion||prediction?.engineVersion),purchaseVersion:text(response?.purchaseVersion||prediction?.purchase?.purchaseVersion),predictionHashVersion:text(response?.predictionHashVersion||response?.predictionIdentity?.predictionHashVersion),purchasePlanHash:JSON.stringify(tickets),ticketCount:tickets.length,tickets,worldCount:new Set(tickets.map(row=>row.macroScenarioId).filter(Boolean)).size};
}

export function snapshotPurchaseIdentity(snapshot){
  const tickets=(snapshot?.betSelections||[]).map(row=>({order:orderOf(row),macroScenarioId:text(row?.macroScenarioId),eventId:text(row?.eventId),terminalId:text(row?.terminalId),ticketClass:text(row?.ticketClass||row?.category),scenarioPurchaseClass:text(row?.scenarioPurchaseClass)}));
  return{predictionHash:text(snapshot?.sealedPrediction?.predictionHash),predictionVersion:text(snapshot?.predictionVersion),purchaseVersion:text(snapshot?.purchaseVersion),predictionHashVersion:text(snapshot?.predictionHashVersion),purchasePlanHash:JSON.stringify(tickets),ticketCount:tickets.length,tickets,worldCount:new Set(tickets.map(row=>row.macroScenarioId).filter(Boolean)).size};
}

export function validateCanonicalSnapshot(snapshot,canonical){
  const local=snapshotPurchaseIdentity(snapshot),remote=canonical?.tickets?canonical:canonicalPurchaseIdentity(canonical),reasons=[];
  if(!local.predictionHash||!local.purchaseVersion||!local.predictionHashVersion||!local.tickets.every(row=>row.macroScenarioId&&row.ticketClass&&row.scenarioPurchaseClass))reasons.push("LOCAL_SNAPSHOT_STALE");
  for(const key of["predictionHash","predictionVersion","purchaseVersion","predictionHashVersion","purchasePlanHash","ticketCount"]){if(local[key]!==remote[key])reasons.push(`${key.toUpperCase()}_MISMATCH`)}
  return{passed:reasons.length===0,reasons:[...new Set(reasons)],local,canonical:remote};
}

export function attachCanonicalIdentity(snapshot,response,snapshotCreatedAt=new Date().toISOString()){
  const identity=canonicalPurchaseIdentity(response),sealedAt=response?.predictionSealedAt||response?.predictionIdentity?.sealedAt||null;
  return{...snapshot,createdAt:snapshotCreatedAt,snapshotCreatedAt,sealedAt,predictionVersion:identity.predictionVersion,purchaseVersion:identity.purchaseVersion,predictionHashVersion:identity.predictionHashVersion,canonicalPurchaseIdentity:identity,sealedPrediction:{source:response?.source,predictionHash:identity.predictionHash,inputHash:response?.inputHash||null,predictionSealedAt:sealedAt,integrityStatus:response?.integrityStatus,temporalStatus:response?.temporalStatus,immutable:true}};
}
