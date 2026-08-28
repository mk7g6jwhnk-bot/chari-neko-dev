export function validateReusableSeal(response,race,compatibleVersion){
  const expected=`${String(race?.date||"").replace(/\D/g,"")}-${String(race?.venueCode||"").padStart(2,"0")}-${Number(race?.raceNo)}`;
  const reasons=[];
  if(!response?.ok)reasons.push("response_not_ok");
  if(response?.raceKey!==expected)reasons.push("race_key_mismatch");
  if(response?.immutable!==true)reasons.push("not_immutable");
  if(response?.integrityStatus!=="VALID")reasons.push("integrity_invalid");
  if(response?.temporalStatus!=="VALID")reasons.push("temporal_invalid");
  if(response?.predictionVersion!==compatibleVersion)reasons.push("prediction_version_incompatible");
  if(!response?.predictionPayload?.prediction||!response?.predictionPayload?.race)reasons.push("display_payload_missing");
  return{passed:reasons.length===0,reasons,expectedRaceKey:expected};
}
