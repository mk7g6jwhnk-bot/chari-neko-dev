export const PREDICTION_ENGINE_VERSION="KEIRIN-0.5.20-girls-evidence-gate";
export const PURCHASE_ENGINE_VERSION="v250";
export const ENGINE_PAIR_ID=`${PREDICTION_ENGINE_VERSION}__${PURCHASE_ENGINE_VERSION}`;

export function buildEnginePairAudit(){
  return{
    predictionEngineVersion:PREDICTION_ENGINE_VERSION,
    purchaseEngineVersion:PURCHASE_ENGINE_VERSION,
    enginePairId:ENGINE_PAIR_ID,
    pairFixed:true,
    passed:Boolean(PREDICTION_ENGINE_VERSION&&PURCHASE_ENGINE_VERSION&&ENGINE_PAIR_ID)
  };
}
