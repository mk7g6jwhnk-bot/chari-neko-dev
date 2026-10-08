function canonicalRaceIdentity(race){
  if(!race||typeof race!=="object")return null;
  const date=String(race.date||"").replace(/\D/g,"").slice(0,8),venueCode=String(race.venueCode||"").padStart(2,"0"),raceNo=Number(race.raceNo);
  if(!/^\d{8}$/.test(date)||!/^\d{2}$/.test(venueCode)||!Number.isInteger(raceNo)||raceNo<=0)return null;
  return`${date}-${venueCode}-${raceNo}`;
}

export function resolvePredictionResponse(response,requestedRace){
  const requestedRaceKey=canonicalRaceIdentity(requestedRace);
  if(!requestedRaceKey)throw new Error("選択したレースの識別情報を確認できません");
  const canonicalEnvelope=response?.predictionPayload&&typeof response.predictionPayload==="object"?response:null;
  const payload=canonicalEnvelope?.predictionPayload??response;
  const returnedRaceKey=canonicalRaceIdentity(payload?.race);
  if(!returnedRaceKey)throw new Error("保存済み予想のレース識別情報を確認できません");
  if(returnedRaceKey!==requestedRaceKey)throw new Error("取得したレースが選択内容と一致しません");
  return{payload,canonicalEnvelope,requestedRaceKey,returnedRaceKey};
}
