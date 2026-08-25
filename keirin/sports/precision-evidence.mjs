function axis(participant,key){
  const value=Number(participant?.evidence?.[key]);
  if(!Number.isFinite(value))return null;
  if(key==="recentForm" && participant?.recentFormEvidence?.selectedMetric==null)return null;
  if(key==="startPower" && participant?.startPowerEvidence?.usable!==true)return null;
  if(["sprintPower","finishPower","trackingSkill"].includes(key) &&
     participant?.kimariteAbilityEvidence?.adopted!==true)return null;
  return value;
}
function weighted(parts){
  const usable=parts.filter(item=>item.value!==null);
  const weight=usable.reduce((sum,item)=>sum+item.weight,0);
  if(weight<=0)return null;
  return usable.reduce((sum,item)=>sum+item.value*item.weight,0)/weight;
}
function roleScoreValue(participant,target){
  const value=Number(participant?.roleScores?.[target]);
  return Number.isFinite(value)?value:null;
}
function conditioned(parts){
  const usable=parts.filter(item=>item.value!==null);
  const total=usable.reduce((sum,item)=>sum+item.weight,0);
  return total>0?usable.reduce((sum,item)=>sum+item.value*item.weight,0)/total:null;
}
