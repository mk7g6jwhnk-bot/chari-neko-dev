import{assertShadowSealUnchanged}from"./shadow-seal-store.mjs";

export function inventorySealedSnapshots(records=[]){
  const rows=Array.isArray(records)?records:[];
  const details=rows.map(record=>{
    const integrity=assertShadowSealUnchanged(record);
    const inputAt=Date.parse(record.inputObservedAt||"");
    const sealedAt=Date.parse(record.predictionSealedAt||"");
    const resultAt=Date.parse(record.resultObservedAt||"");
    const temporalValid=Number.isFinite(inputAt)&&Number.isFinite(sealedAt)&&inputAt<=sealedAt&&(!Number.isFinite(resultAt)||resultAt>sealedAt);
    const comparable=integrity.valid&&temporalValid&&Array.isArray(record.current?.terminals)&&Array.isArray(record.research?.terminals);
    return{raceKey:record.raceKey||null,shadowSealId:record.shadowSealId||null,integrityValid:integrity.valid,temporalValid,hasCurrent:Boolean(record.current?.terminals?.length),hasResearch:Boolean(record.research?.terminals?.length),hasResult:Boolean(record.result),comparable,calibrationStatus:record.research?.calibrationStatus||null};
  });
  return{
    version:"SEALED-SNAPSHOT-INVENTORY-1.0",total:details.length,
    integrityValidCount:details.filter(row=>row.integrityValid).length,
    temporalValidCount:details.filter(row=>row.temporalValid).length,
    comparableSealedCount:details.filter(row=>row.comparable).length,
    resultAttachedCount:details.filter(row=>row.comparable&&row.hasResult).length,
    pendingResultCount:details.filter(row=>row.comparable&&!row.hasResult).length,
    rejectedCount:details.filter(row=>!row.comparable).length,
    historicalInputReconstructionAllowed:false,details
  };
}
