const V2_TICKET_CLASS_VERSION="MULTI_WORLD_TICKET_CLASS_V2";
const V2_CLASSIFICATION_SOURCE="CANONICAL_V2";
function text(value){return value==null?null:String(value)}
function orderOf(row){return Array.isArray(row?.order)?row.order.map(Number).join("-"):String(row?.order||"")}
function standardPlan(prediction){return prediction?.canonicalPurchasePlan?.standardTickets||prediction?.standardPurchasePlan||prediction?.purchasePlan||[]}
function scenarioPurchaseClassOf(row){const explicit=text(row?.scenarioPurchaseClass);if(explicit)return explicit;const ticketClass=text(row?.ticketClass||row?.betClass);return ticketClass==="MAIN"||ticketClass==="SCENARIO_BREAK"?ticketClass:null}
function ticketIdentity(row){return{order:orderOf(row),macroScenarioId:text(row?.macroScenarioId),eventId:text(row?.eventId),terminalId:text(row?.terminalId),ticketClass:text(row?.ticketClass||row?.betClass||row?.category),worldClass:text(row?.worldClass),ticketClassVersion:text(row?.ticketClassVersion),classificationSource:text(row?.classificationSource),scenarioPurchaseClass:scenarioPurchaseClassOf(row),thick:Boolean(row?.thick??row?.thickQualified)}}
function snapshotRaceKey(snapshot){const race=snapshot?.targetRace||{};return race?.date&&race?.venueCode&&race?.raceNo!=null?`${String(race.date).replace(/\D/g,"")}-${String(race.venueCode).padStart(2,"0")}-${Number(race.raceNo)}`:null}
function v2IdentityComplete(identity){return identity.tickets.length>0&&identity.tickets.every(row=>row.order&&row.macroScenarioId&&row.eventId&&row.terminalId&&row.ticketClass&&row.worldClass&&row.scenarioPurchaseClass&&row.ticketClassVersion===V2_TICKET_CLASS_VERSION&&row.classificationSource===V2_CLASSIFICATION_SOURCE&&typeof row.thick==="boolean")}

export function canonicalPurchaseIdentity(response){
  const prediction=response?.predictionPayload?.prediction||response?.prediction||{};
  const tickets=(Array.isArray(response?.tickets)?response.tickets:standardPlan(prediction)).map(ticketIdentity);
  return{raceKey:text(response?.raceKey),sealedAt:text(response?.predictionSealedAt||response?.predictionIdentity?.sealedAt),predictionHash:text(response?.predictionHash||response?.predictionIdentity?.predictionHash),predictionVersion:text(response?.predictionVersion||prediction?.engineVersion),purchaseVersion:text(response?.purchaseVersion||prediction?.purchase?.purchaseVersion),predictionHashVersion:text(response?.predictionHashVersion||response?.predictionIdentity?.predictionHashVersion),integrityStatus:text(response?.integrityStatus),temporalStatus:text(response?.temporalStatus),immutable:response?.immutable===true,purchasePlanHash:JSON.stringify(tickets),ticketCount:tickets.length,tickets,worldCount:new Set(tickets.map(row=>row.macroScenarioId).filter(Boolean)).size};
}

export function snapshotPurchaseIdentity(snapshot){
  const tickets=(snapshot?.betSelections||[]).map(ticketIdentity);
  return{raceKey:snapshotRaceKey(snapshot),sealedAt:text(snapshot?.sealedAt||snapshot?.sealedPrediction?.predictionSealedAt),predictionHash:text(snapshot?.sealedPrediction?.predictionHash),predictionVersion:text(snapshot?.predictionVersion),purchaseVersion:text(snapshot?.purchaseVersion),predictionHashVersion:text(snapshot?.predictionHashVersion),integrityStatus:text(snapshot?.sealedPrediction?.integrityStatus),temporalStatus:text(snapshot?.sealedPrediction?.temporalStatus),immutable:snapshot?.sealedPrediction?.immutable===true,purchasePlanHash:JSON.stringify(tickets),ticketCount:tickets.length,tickets,worldCount:new Set(tickets.map(row=>row.macroScenarioId).filter(Boolean)).size};
}

export function validateCanonicalSnapshot(snapshot,canonical){
  const local=snapshotPurchaseIdentity(snapshot),remote=canonical?.tickets?canonical:canonicalPurchaseIdentity(canonical),errors=[];
  if(!local.predictionHash||!local.predictionVersion||!local.purchaseVersion||!local.raceKey||!local.sealedAt||!local.tickets.every(row=>row.order&&row.macroScenarioId&&row.eventId&&row.terminalId&&row.ticketClass&&row.scenarioPurchaseClass))errors.push("CANONICAL_IDENTITY_MISMATCH");
  if(local.predictionHash!==remote.predictionHash)errors.push("PREDICTION_HASH_MISMATCH");
  if(local.predictionVersion!==remote.predictionVersion)errors.push("PREDICTION_VERSION_MISMATCH");
  if(local.purchaseVersion!==remote.purchaseVersion)errors.push("PURCHASE_VERSION_MISMATCH");
  if(local.ticketCount!==remote.ticketCount)errors.push("TICKET_COUNT_MISMATCH");
  if(local.purchasePlanHash!==remote.purchasePlanHash)errors.push("CANONICAL_IDENTITY_MISMATCH");
  if(local.raceKey!==remote.raceKey)errors.push("RACE_KEY_MISMATCH");
  if(local.sealedAt!==remote.sealedAt)errors.push("SEALED_AT_MISMATCH");
  if(remote.integrityStatus!=="VALID"||local.integrityStatus!=="VALID"||!remote.immutable||!local.immutable)errors.push("INTEGRITY_INVALID");
  if(remote.temporalStatus!=="VALID"||local.temporalStatus!=="VALID")errors.push("TEMPORAL_INVALID");
  const localVersion=local.predictionHashVersion,remoteVersion=remote.predictionHashVersion;let compatibilityStatus="STRICT_VERSIONED",notices=[];
  if(localVersion&&remoteVersion){if(localVersion!==remoteVersion)errors.push("PREDICTION_HASH_VERSION_MISMATCH")}
  else if(localVersion||remoteVersion)errors.push("HASH_VERSION_MISSING_INCOMPATIBLE");
  else{const compatible=errors.length===0&&v2IdentityComplete(local)&&v2IdentityComplete(remote);if(compatible){compatibilityStatus="LEGACY_HASH_VERSION_COMPATIBLE";notices=["HASH_VERSION_MISSING_COMPATIBLE"]}else errors.push("HASH_VERSION_MISSING_INCOMPATIBLE")}
  return{passed:errors.length===0,compatibilityStatus,reasons:[...new Set([...errors,...notices])],errors:[...new Set(errors)],notices,local,canonical:remote};
}

export function attachCanonicalIdentity(snapshot,response,snapshotCreatedAt=new Date().toISOString()){
  const identity=canonicalPurchaseIdentity(response),sealedAt=identity.sealedAt;
  return{...snapshot,createdAt:snapshotCreatedAt,snapshotCreatedAt,sealedAt,predictionVersion:identity.predictionVersion,purchaseVersion:identity.purchaseVersion,predictionHashVersion:identity.predictionHashVersion,canonicalPurchaseIdentity:identity,sealedPrediction:{source:response?.source,predictionHash:identity.predictionHash,inputHash:response?.inputHash||null,predictionSealedAt:sealedAt,integrityStatus:identity.integrityStatus,temporalStatus:identity.temporalStatus,immutable:identity.immutable}};
}
