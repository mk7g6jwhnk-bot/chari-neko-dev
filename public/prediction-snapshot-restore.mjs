function normalizedDate(value){return String(value||"").replaceAll("-","")}

export function localSnapshotRaceKey(race){
  const date=normalizedDate(race?.date),venueCode=String(race?.venueCode||""),raceNo=Number(race?.raceNo);
  if(!/^\d{8}$/.test(date)||!/^\d{2}$/.test(venueCode)||!Number.isInteger(raceNo)||raceNo<1||raceNo>12)return null;
  return `${date}:${venueCode}:${raceNo}`;
}

export function snapshotRestorePlan(snapshot,expectedRace=null){
  const key=localSnapshotRaceKey(snapshot?.targetRace),expectedKey=expectedRace?localSnapshotRaceKey(expectedRace):key;
  if(!key||!expectedKey||key!==expectedKey)return{restorable:false,mode:"INVALID",raceKey:key,reason:"RACE_IDENTITY_MISMATCH"};
  const snapshotId=String(snapshot?.predictionSnapshotId||"");
  if(!snapshotId.startsWith(`${key}:`))return{restorable:false,mode:"INVALID",raceKey:key,reason:"SNAPSHOT_IDENTITY_MISMATCH"};
  const predictionHash=String(snapshot?.sealedPrediction?.predictionHash||"").trim().toLowerCase()||null;
  return{
    restorable:true,
    mode:predictionHash?"CANONICAL_SEALED":"LOCAL_UNSEALED",
    raceKey:key,
    predictionHash,
    reason:null
  };
}
