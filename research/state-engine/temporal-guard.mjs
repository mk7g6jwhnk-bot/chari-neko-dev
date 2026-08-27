export function assertTemporalIntegrity({inputObservedAt,predictionSealedAt,resultObservedAt=null}){
  const input=timestamp(inputObservedAt,"inputObservedAt");
  const sealed=timestamp(predictionSealedAt,"predictionSealedAt");
  if(input>sealed)throw temporalError("INPUT_AFTER_PREDICTION_SEAL",{inputObservedAt,predictionSealedAt});
  if(resultObservedAt!==null&&resultObservedAt!==undefined&&resultObservedAt!==""){
    const result=timestamp(resultObservedAt,"resultObservedAt");
    if(result<=sealed)throw temporalError("RESULT_NOT_STRICTLY_AFTER_PREDICTION_SEAL",{predictionSealedAt,resultObservedAt});
  }
  return{version:"RESEARCH-TEMPORAL-GUARD-1.0",passed:true,inputObservedAt:new Date(input).toISOString(),predictionSealedAt:new Date(sealed).toISOString(),resultObservedAt:resultObservedAt?new Date(Date.parse(resultObservedAt)).toISOString():null,resultUsedForPrediction:false};
}
function timestamp(value,name){const n=Date.parse(String(value||""));if(!Number.isFinite(n))throw temporalError(`INVALID_${name.toUpperCase()}`,{[name]:value});return n}
function temporalError(code,details){const error=new Error(code);error.code=code;error.details=details;return error}
