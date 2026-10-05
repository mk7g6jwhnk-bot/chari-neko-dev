export const DETAIL_PREDICTION_ACTIONS=Object.freeze({
  VIEW_SAVED:"VIEW_SAVED",
  RELOAD_SAVED:"RELOAD_SAVED",
  UPDATE_PREDICTION:"UPDATE_PREDICTION",
  CREATE_PREDICTION:"CREATE_PREDICTION",
  CHECK_RESULT:"CHECK_RESULT",
  NONE:"NONE"
});

export function detailPredictionActionModel({hasSnapshot=false,hasSavedHash=false,canonicalStatus=null,lookupBusy=false,predictionBusy=false,ended=false,timeKnown=true,hasResult=false}={}){
  const busy=Boolean(lookupBusy||predictionBusy);
  if(hasSnapshot)return{state:"SAVED_VALID",primary:{action:DETAIL_PREDICTION_ACTIONS.VIEW_SAVED,label:"予想を見る",disabled:busy},secondary:{action:DETAIL_PREDICTION_ACTIONS.UPDATE_PREDICTION,label:predictionBusy?"予想更新中…":"予想を更新",disabled:busy,visible:!ended}};
  if(hasSavedHash){
    const stale=canonicalStatus==="UNAVAILABLE"||canonicalStatus==="SAVED_STALE"||canonicalStatus==="SAVED_READ_FAILED";
    const checking=lookupBusy||canonicalStatus==="CHECKING";
    return{state:stale?"SAVED_STALE":checking?"SAVED_CHECKING":"SAVED_AVAILABLE",primary:{action:stale?DETAIL_PREDICTION_ACTIONS.RELOAD_SAVED:DETAIL_PREDICTION_ACTIONS.VIEW_SAVED,label:checking?"再読み込み中…":stale?"再読み込み":"予想を見る",disabled:busy},secondary:{action:DETAIL_PREDICTION_ACTIONS.UPDATE_PREDICTION,label:predictionBusy?"予想更新中…":"予想を更新",disabled:busy||ended,visible:stale||!ended}};
  }
  if(ended||!timeKnown)return{state:"RESULT_ONLY",primary:{action:DETAIL_PREDICTION_ACTIONS.CHECK_RESULT,label:hasResult?"公式結果を更新":"公式結果を見る",disabled:busy},secondary:{action:timeKnown?DETAIL_PREDICTION_ACTIONS.NONE:DETAIL_PREDICTION_ACTIONS.CREATE_PREDICTION,label:"予想する",disabled:busy,visible:!timeKnown&&!ended}};
  return{state:"UNSEALED",primary:{action:DETAIL_PREDICTION_ACTIONS.CREATE_PREDICTION,label:predictionBusy?"予想作成中…":"予想する",disabled:busy},secondary:{action:DETAIL_PREDICTION_ACTIONS.NONE,label:"",disabled:false,visible:false}};
}
