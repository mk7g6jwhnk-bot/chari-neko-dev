const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
const structuredTypes=new Set(["LEADER_HOLD","MAKURI_SUCCESS","BANTE_SASHI"]);
export function buildRiderBranchLinkAudit({scored=[],branches=[]}={}){
  const riders=new Map(scored.map(r=>[Number(r.number),r]));
  const rows=branches.filter(b=>structuredTypes.has(b.branchType)).map(b=>{
    const rider=riders.get(Number(b.requiredFirstNumber));
    const mechanism=mechanismFor(b,rider);
    return{branchId:b.id,branchLabel:b.label,branchType:b.branchType,priority:b.priority,firstNumber:Number(b.requiredFirstNumber),branchScore:Number(b.score)||0,firstPlacement:finite(rider?.roleScores?.first)?Number(rider.roleScores.first):null,mechanismName:mechanism.name,mechanismScore:finite(mechanism.score)?Number(mechanism.score):null,riderRole:rider?.riderEvaluationV2?.role||rider?.role||null};
  }).sort((a,b)=>b.branchScore-a.branchScore||a.branchId.localeCompare(b.branchId,"en"));
  const firstRank=new Map([...scored].filter(r=>finite(r?.roleScores?.first)).sort((a,b)=>Number(b.roleScores.first)-Number(a.roleScores.first)||Number(a.number)-Number(b.number)).map((r,i)=>[Number(r.number),i+1]));
  const warnings=[];
  for(const rider of scored){
    const n=Number(rider.number),rank=firstRank.get(n),own=rows.filter(r=>r.firstNumber===n);
    if(rank===1&&own.length&&!own.some(r=>r.priority==="main"))warnings.push({type:"TOP_FIRST_RIDER_NO_MAIN_BRANCH",severity:"high",number:n,message:`${n}番は1着能力1位ですが、対応する逃げ・捲り・番手差し枝がMAINにありません。選手評価v2→主展開の接続を確認。`});
    if(rank<=2&&own.length&&!own.some(r=>["main","contender"].includes(r.priority)))warnings.push({type:"TOP_FIRST_RIDER_ONLY_POSSIBLE_BRANCH",severity:"medium",number:n,message:`${n}番は1着能力${rank}位ですが、対応枝がPOSSIBLE止まりです。今回のライン位置・機構別能力による減点根拠が必要です。`});
  }
  for(const row of rows.filter(r=>r.priority==="main")){
    const rank=firstRank.get(row.firstNumber);
    if(rank&&rank>=5)warnings.push({type:"LOW_FIRST_RANK_MAIN_BRANCH",severity:"medium",number:row.firstNumber,branchId:row.branchId,message:`${row.branchLabel}はMAINですが、${row.firstNumber}番の1着能力は${rank}位です。${row.mechanismName} ${fmt(row.mechanismScore)} が順位を逆転させた根拠として十分か確認。`});
  }
  return{version:"RIDER-BRANCH-LINK-v1",status:warnings.some(w=>w.severity==="high")?"WARN":warnings.length?"CHECK":"OK",warnings,rows,firstRank:Object.fromEntries(firstRank)};
}
function mechanismFor(branch,rider){const fm=rider?.riderEvaluationV2?.firstMechanisms||{};if(branch.branchType==="LEADER_HOLD")return{name:"逃げ",score:fm.escape};if(branch.branchType==="MAKURI_SUCCESS")return{name:"捲り",score:fm.makuri};if(branch.branchType==="BANTE_SASHI")return{name:"番手差し",score:fm.banteSashi};return{name:"1着総合",score:rider?.roleScores?.first}}
function fmt(v){return finite(v)?Number(v).toFixed(2):"未取得"}
