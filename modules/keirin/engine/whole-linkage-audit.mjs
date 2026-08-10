const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
const pct=v=>finite(v)?`${(Number(v)*100).toFixed(1)}%`:"-";

export function buildWholeLinkageAudit({scored=[],lines=[],branches=[],terminals=[]}){
  const riderMap=new Map(scored.map(r=>[Number(r.number),r]));
  const branchMap=new Map(branches.map(b=>[String(b.id),b]));
  const purchased=terminals.filter(t=>t?.purchaseStatus==="購入採用");
  const traces=purchased.slice().sort((a,b)=>(Number(b.probability)||0)-(Number(a.probability)||0))
    .map(t=>buildTrace(t,riderMap,lines,branchMap));

  const warnings=traces.flatMap(t=>t.warnings);
  const firstFamilyRanks=rankFirstFamilies(terminals);
  const top=topFirstScore(riderMap);
  for(const [n,rider] of riderMap){
    const firstScore=Number(rider?.roleScores?.first),rank=firstFamilyRanks.get(n);
    if(Number.isFinite(firstScore)&&rank&&rank>3&&top>0&&firstScore>=top*.88){
      warnings.push({type:"ABILITY_TO_HEAD_PROBABILITY_DRIFT",stage:"ABILITY_TO_SCENARIO",severity:"medium",number:n,message:`${n}番は1着能力が上位圏ですが、1着ファミリー確率は${rank}位です。能力→展開→1着確率の接続を確認。`});
    }
  }

  const stageChecks=[
    stage("ABILITY_TO_SCENARIO","能力→1着シナリオ",warnings.filter(w=>w.stage==="ABILITY_TO_SCENARIO")),
    stage("SCENARIO_TO_SECOND","1着シナリオ→2着",warnings.filter(w=>w.stage==="SCENARIO_TO_SECOND")),
    stage("SECOND_TO_THIRD","1-2着条件→3着",warnings.filter(w=>w.stage==="SECOND_TO_THIRD")),
    stage("CONVERGENCE_TO_PROBABILITY","自然収束→終端確率",warnings.filter(w=>w.stage==="CONVERGENCE_TO_PROBABILITY")),
    stage("PROBABILITY_TO_PURCHASE","確率・妙味→購入採否",warnings.filter(w=>w.stage==="PROBABILITY_TO_PURCHASE"))
  ];

  const severe=warnings.filter(w=>w.severity==="high");
  return{
    version:"WHOLE-LINKAGE-AUDIT-v1",
    status:severe.length?"WARN":warnings.length?"CHECK":"OK",
    purchasedCount:purchased.length,
    traceCount:traces.length,
    warningCount:warnings.length,
    severeWarningCount:severe.length,
    stageChecks,warnings,traces
  };
}

function buildTrace(t,riderMap,lines,branchMap){
  const order=(t.order||[]).map(Number),[first,second,third]=order;
  const rider1=riderMap.get(first),rider2=riderMap.get(second),rider3=riderMap.get(third);
  const branch=branchMap.get(String(t.dominantBranchId||t.branchId||t.chatSupportingBranchIds?.[0]||""))||null;
  const line=findLine(lines,first);
  const follower=line?.members?.[line.index+1]??null;
  const thirdLine=line?.members?.[line.index+2]??null;
  const reasons=Array.isArray(t.naturalConvergenceReasons)?t.naturalConvergenceReasons:[];
  const warnings=[];

  if(t.branchHeadMatched===false)
    warnings.push(warn("ABILITY_TO_SCENARIO","high",order,`${first}番1着の終端に、別の1着条件の展開枝が紐付いています。購入根拠として使用禁止です。`));
  if(t.betClass==="MAIN" && t.chatForecastRole && t.chatForecastRole!=="main")
    warnings.push(warn("ABILITY_TO_SCENARIO","high",order,"本線ですが中心予測枝ではありません。"));

  if(follower!=null && second!==Number(follower)){
    const hasReason=reasons.some(x=>String(x).includes("追走失敗")||String(x).includes("3番手")||String(x).includes("別線"));
    if(!hasReason)warnings.push(warn("SCENARIO_TO_SECOND","high",order,`${first}番頭で本来の直後${follower}番を飛ばして${second}番2着ですが、追加条件の記録がありません。`));
    else if(Number(t.naturalConvergenceScore)<.62 && t.betClass==="MAIN")
      warnings.push(warn("SCENARIO_TO_SECOND","high",order,`${first}番頭で追走崩れを必要とする終端が本線に残っています。`));
  }

  if(thirdLine!=null && third!==Number(thirdLine) && second===Number(follower)){
    const hasThirdReason=reasons.some(x=>String(x).includes("別線残り")||String(x).includes("同ライン残り"));
    if(!hasThirdReason && Number(t.extraConditionCount)>0)
      warnings.push(warn("SECOND_TO_THIRD","medium",order,`${first}-${second}まで自然ですが、${third}番3着へ移る追加条件の説明が弱いです。`));
  }

  const conv=Number(t.naturalConvergenceScore),prob=Number(t.probability);
  if(Number.isFinite(conv)&&Number.isFinite(prob)){
    if(conv<.52 && prob>=.02)warnings.push(warn("CONVERGENCE_TO_PROBABILITY","medium",order,`自然収束度${pct(conv)}に対して終端確率${pct(prob)}が高めです。確率付与を確認。`));
    if(conv>=.70 && prob<.002)warnings.push(warn("CONVERGENCE_TO_PROBABILITY","low",order,"自然収束度は高い一方で終端確率がかなり低いです。過小評価の可能性を確認。"));
  }

  if(t.purchaseStatus==="購入採用"){
    if(t.betClass==="COVER"&&t.chatForecastRole==="sub")warnings.push(warn("PROBABILITY_TO_PURCHASE","high",order,"可能性枝が押さえへ昇格しています。"));
    if(Number(t.naturalConvergenceScore)<.46&&t.betClass!=="BUYABLE_HIGH")warnings.push(warn("PROBABILITY_TO_PURCHASE","high",order,"自然収束度が押さえ水準未満なのに購入採用されています。"));
  }

  return{
    order,category:t.betClass||"NONE",purchaseStatus:t.purchaseStatus||null,
    firstAbility:finite(rider1?.roleScores?.first)?Number(rider1.roleScores.first):null,
    secondAbility:finite(rider2?.roleScores?.second)?Number(rider2.roleScores.second):null,
    thirdAbility:finite(rider3?.roleScores?.third)?Number(rider3.roleScores.third):null,
    line:line?.members||[],expectedFollower:follower,expectedThirdLine:thirdLine,
    branchLabel:t.dominantBranchLabel||t.branchLabel||branch?.label||null,
    branchRole:t.chatForecastRole||t.dominantBranchPriority||branch?.priority||null,
    naturalConvergenceScore:finite(t.naturalConvergenceScore)?Number(t.naturalConvergenceScore):null,
    naturalConvergenceLevel:t.naturalConvergenceLevel||null,
    extraConditionCount:Number(t.extraConditionCount)||0,
    naturalConvergenceReasons:reasons,
    probability:finite(t.probability)?Number(t.probability):null,
    odds:finite(t.odds)?Number(t.odds):null,
    expectedValueIndex:finite(t.expectedValueIndex)?Number(t.expectedValueIndex):null,
    warnings
  };
}

function rankFirstFamilies(terminals){
  const map=new Map();
  for(const t of terminals){const n=Number(t?.order?.[0]),p=Number(t?.probability);if(Number.isFinite(n)&&Number.isFinite(p))map.set(n,(map.get(n)||0)+p)}
  return new Map([...map.entries()].sort((a,b)=>b[1]-a[1]).map(([n],i)=>[n,i+1]));
}
function topFirstScore(riderMap){return Math.max(0,...[...riderMap.values()].map(r=>Number(r?.roleScores?.first)||0))}
function findLine(lines,number){
  for(const line of Array.isArray(lines)?lines:[]){
    const raw=Array.isArray(line)?line:(Array.isArray(line?.members)?line.members:[]);
    const members=raw.map(m=>Number(m?.number??m)).filter(Number.isFinite);
    const index=members.indexOf(Number(number));
    if(index>=0)return{members,index};
  }
  return null;
}
function warn(stage,severity,order,message){return{stage,severity,order,message}}
function stage(id,label,rows){return{id,label,status:rows.some(r=>r.severity==="high")?"WARN":rows.length?"CHECK":"OK",warningCount:rows.length}}
