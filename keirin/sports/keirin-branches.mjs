export function generateKeirinBranches({scored,lines,lineConfidence,raceCategory="standard",initiativeAssessment=null}){
  if(raceCategory==="girls")return generateGirlsBranches(scored);
  const branches=[];
  const lineEnabled=lineConfidence==="高";
  const initiativeByLine=new Map((initiativeAssessment?.candidates||[]).filter(x=>x?.lineId).map(x=>[String(x.lineId),x]));
  const topInitiative=initiativeAssessment?.top||null;
  const topInitiativeLineId=topInitiative?.lineId?String(topInitiative.lineId):null;

  for(const line of lines.filter(item=>item.type==="ライン")){
    const leader=line.leader,bante=line.bante;
    if(leader){
      branches.push(make({
        id:`LEAD-${line.id}`,label:`${line.id}先行押し切り`,scenario:"先行押し切り",branchType:"LEADER_HOLD",primaryLineId:line.id,requiredFirstNumber:leader.number,enabled:lineEnabled&&hasUsableStartPower(leader),initiative:initiativeByLine.get(String(line.id))||null,
        scoreParts:[part("firstPlacement",leader.roleScores.first,.22),part("escapeMechanism",leader.riderEvaluationV2?.firstMechanisms?.escape,.43),part("startPower",leader.evidence.start,.20),part("recentForm",leader.evidence.recent,.10),part("finishPower",leader.evidence.finish,.05)],
        firstCandidateScores:{[leader.id]:leader.roleScores.first||0}
      }));
      branches.push(make({
        id:`MAKURI-${line.id}`,label:`${line.id}まくり`,scenario:"別線まくり",branchType:"MAKURI_SUCCESS",primaryLineId:line.id,requiredFirstNumber:leader.number,enabled:lineEnabled,initiative:initiativeByLine.get(String(line.id))||null,
        scoreParts:[part("firstPlacement",leader.roleScores.first,.22),part("makuriMechanism",leader.riderEvaluationV2?.firstMechanisms?.makuri,.46),part("sprintPower",leader.evidence.sprint,.17),part("finishPower",leader.evidence.finish,.10),part("recentForm",leader.evidence.recent,.05)],
        firstCandidateScores:{[leader.id]:leader.roleScores.first||0}
      }));
    }
    if(bante){
      branches.push(make({
        id:`BANTE-${line.id}`,label:`${line.id}番手差し`,scenario:"番手差し",branchType:"BANTE_SASHI",primaryLineId:line.id,requiredFirstNumber:bante.number,enabled:lineEnabled,initiative:initiativeByLine.get(String(line.id))||null,
        scoreParts:[part("firstPlacement",bante.roleScores.first,.22),part("banteSashiMechanism",bante.riderEvaluationV2?.firstMechanisms?.banteSashi,.46),part("finishPower",bante.evidence.finish,.14),part("trackingSkill",bante.evidence.tracking,.13),part("recentForm",bante.evidence.recent,.05)],
        firstCandidateScores:{[bante.id]:bante.roleScores.first||0}
      }));
    }
  }


  if(!lineEnabled){
    for(const rider of scored){
      const id=rider.id;
      branches.push(make({
        id:`UNRESOLVED-LEAD-${rider.number}`,label:`${rider.number}先行残り（並び未取得）`,
        scenario:"先行残り（並び未取得）",branchType:"LEADER_HOLD",
        primaryLineId:null,requiredFirstNumber:rider.number,enabled:hasUsableStartPower(rider),lineIndependentFallback:true,
        scoreParts:[part("firstPlacement",rider.roleScores.first,.24),part("escapeMechanism",rider.riderEvaluationV2?.firstMechanisms?.escape,.40),part("startPower",rider.evidence.start,.20),part("recentForm",rider.evidence.recent,.10),part("finishPower",rider.evidence.finish,.06)],
        firstCandidateScores:{[id]:rider.roleScores.first||0}
      }));
      branches.push(make({
        id:`UNRESOLVED-MAKURI-${rider.number}`,label:`${rider.number}まくり（並び未取得）`,
        scenario:"まくり（並び未取得）",branchType:"MAKURI_SUCCESS",
        primaryLineId:null,requiredFirstNumber:rider.number,enabled:true,lineIndependentFallback:true,
        scoreParts:[part("firstPlacement",rider.roleScores.first,.24),part("makuriMechanism",rider.riderEvaluationV2?.firstMechanisms?.makuri,.43),part("sprintPower",rider.evidence.sprint,.18),part("finishPower",rider.evidence.finish,.10),part("recentForm",rider.evidence.recent,.05)],
        firstCandidateScores:{[id]:rider.roleScores.first||0}
      }));
    }
  }

  const battleScores=Object.fromEntries(scored.map(p=>[p.id,weightedAvailable([[p.roleScores.first,.32],[p.evidence.finish,.26],[p.evidence.tracking,.22],[p.evidence.start,.10],[p.evidence.recent,.10]])]));
  branches.push(make({id:"BATTLE",label:"踏み合い消耗戦",scenario:"踏み合い",branchType:"LEAD_BATTLE",scoreParts:[part("candidateMean",avg(Object.values(battleScores)),1)],firstCandidateScores:battleScores,enabled:true}));

  const soloScores=Object.fromEntries(scored.filter(p=>p.role==="単騎").map(p=>[p.id,weightedAvailable([[p.roleScores.first,.38],[p.evidence.finish,.26],[p.evidence.sprint,.22],[p.evidence.recent,.14]])]));
  branches.push(make({id:"SOLO",label:"単騎浮上",scenario:"単騎浮上",branchType:"SOLO_RISE",scoreParts:[part("candidateMean",avg(Object.values(soloScores)),1)],firstCandidateScores:soloScores,enabled:Object.keys(soloScores).length>0}));

  const separationScores=Object.fromEntries(scored.map(p=>[p.id,weightedAvailable([[p.roleScores.first,.28],[p.evidence.finish,.28],[p.evidence.tracking,.30],[p.evidence.recent,.14]])]));
  branches.push(make({id:"SEPARATION",label:"番手離れ・繰り上がり",scenario:"番手離れ",branchType:"LINE_SEPARATION",scoreParts:[part("candidateMean",lineEnabled?avg(Object.values(separationScores)):0,1)],firstCandidateScores:separationScores,enabled:lineEnabled}));

  const enabled=branches.filter(branch=>branch.firstCandidates.length&&branch.enabled).sort(compareBranch);
  const structured=enabled.filter(branch=>["LEADER_HOLD","BANTE_SASHI","MAKURI_SUCCESS"].includes(branch.branchType));
  const tiers=selectNaturalBranchTiers(structured);
  const initiativeLineBranches=topInitiativeLineId?structured.filter(branch=>String(branch.primaryLineId)===topInitiativeLineId&&["LEADER_HOLD","BANTE_SASHI"].includes(branch.branchType)):[];
  const initiativeMain=initiativeLineBranches.length?[...initiativeLineBranches].sort(compareBranch).slice(0,1):[];
  const mainIds=new Set((initiativeMain.length?initiativeMain:tiers.main).map(branch=>branch.id));
  const contenderIds=new Set(tiers.contender.filter(branch=>!mainIds.has(branch.id)).map(branch=>branch.id));

  // LEADER_HOLD と BANTE_SASHI は、同じラインの「先行残り / 番手差し」
  // という頭折り返しであり、片方が中心展開ならもう片方を能力順位だけで
  // 別シナリオ扱いして消さない。priority自体は自然tierを保持しつつ、
  // sameScenarioMainSibling で中心シナリオ・クラスターへ接続する。
  const mainReversalLineIds=new Set(
    structured
      .filter(branch=>mainIds.has(branch.id))
      .filter(branch=>["LEADER_HOLD","BANTE_SASHI"].includes(branch.branchType))
      .map(branch=>branch.primaryLineId)
      .filter(Boolean)
  );

  return enabled.map(branch=>{
    const naturalPriority=structured.includes(branch)
      ?mainIds.has(branch.id)?"main":contenderIds.has(branch.id)?"contender":"sub"
      :"risk";
    const sameScenarioMainSibling=Boolean(
      branch.primaryLineId &&
      mainReversalLineIds.has(branch.primaryLineId) &&
      ["LEADER_HOLD","BANTE_SASHI"].includes(branch.branchType) &&
      !mainIds.has(branch.id)
    );
    return{
      ...branch,
      priority:naturalPriority,
      forecastRole:structured.includes(branch)
        ?mainIds.has(branch.id)?"CENTER":sameScenarioMainSibling?"CENTER_SIBLING":contenderIds.has(branch.id)?"SECONDARY":"POSSIBLE"
        :"RISK",
      sameScenarioMainSibling,
      initiativeScore:Number(branch?.initiative?.score)||null,
      initiativeProbability:Number(branch?.initiative?.probability)||null,
      initiativeRank:Number(branch?.initiative?.rank)||null,
      initiativePrimaryLine:Boolean(topInitiativeLineId&&String(branch.primaryLineId)===topInitiativeLineId),
      initiativeSelectionPolicy:"INITIATIVE_LINE_FIRST_THEN_OUTCOME_BRANCH",
      sameScenarioClusterId:sameScenarioMainSibling||mainIds.has(branch.id)
        ?(branch.primaryLineId&&["LEADER_HOLD","BANTE_SASHI"].includes(branch.branchType)?`LINE-REVERSAL-${branch.primaryLineId}`:null)
        :null
    };
  });
}

export function selectNaturalBranchTiers(structuredBranches=[]){
  const sorted=[...structuredBranches].sort(compareBranch);
  if(!sorted.length)return emptyTierResult();

  const scores=sorted.map(branch=>Number(branch.score)||0);
  const topScore=scores[0];
  const bottomScore=scores[scores.length-1];
  const eps=Math.max(1e-9,Math.abs(topScore)*1e-12);

  // If every structural branch has the same score, there is no evidence for a
  // central forecast. Keep all branches as POSSIBLE only; do not promote mere
  // logical possibility into a forecast contender.
  if(Math.abs(topScore-bottomScore)<=eps){
    return{
      main:[],contender:[],sub:sorted,
      diagnostics:{mode:"NO_CENTRAL_SEPARATION",topScore,topTieCount:sorted.length,tailMedianGap:0,tailMadGap:0,contenderCutGap:null,contenderCutDetected:false}
    };
  }

  let topTieCount=1;
  while(topTieCount<sorted.length&&Math.abs(scores[topTieCount]-topScore)<=eps)topTieCount+=1;
  const main=sorted.slice(0,topTieCount);
  const tail=sorted.slice(topTieCount);
  if(!tail.length){
    return{main,contender:[],sub:[],diagnostics:{mode:"TOP_ONLY",topScore,topTieCount,tailMedianGap:null,tailMadGap:null,contenderCutGap:null,contenderCutDetected:false}};
  }
  if(tail.length===1){
    return{main,contender:[],sub:tail,diagnostics:{mode:"CORE_ONLY_SINGLE_TAIL_POSSIBLE",topScore,topTieCount,tailMedianGap:null,tailMadGap:null,contenderCutGap:null,contenderCutDetected:false}};
  }

  const tailScores=tail.map(branch=>Number(branch.score)||0);
  const gaps=[];
  for(let i=0;i<tailScores.length-1;i+=1)gaps.push(Math.max(0,tailScores[i]-tailScores[i+1]));
  const tailMedianGap=median(gaps);
  const deviations=gaps.map(gap=>Math.abs(gap-tailMedianGap));
  const tailMadGap=median(deviations);
  let maxGap=-Infinity,maxGapIndex=-1;
  for(let i=0;i<gaps.length;i+=1){
    if(gaps[i]>maxGap){maxGap=gaps[i];maxGapIndex=i;}
  }

  // Robust, distribution-derived lower boundary. This does not compare against a
  // fixed percentage of the top score and does not require two groups to exist.
  const naturalGapFloor=tailMedianGap+tailMadGap;
  const contenderCutDetected=maxGapIndex>=0&&maxGap>naturalGapFloor+eps&&maxGap>eps;
  // Only call a non-core branch a forecast contender when the score distribution
  // itself supplies a clear boundary separating an upper secondary group from
  // weaker possibilities. If no such boundary exists, all non-core branches stay
  // POSSIBLE (sub) rather than being treated as predictions to cover.
  const contender=contenderCutDetected?tail.slice(0,maxGapIndex+1):[];
  const sub=contenderCutDetected?tail.slice(maxGapIndex+1):tail;

  return{
    main,contender,sub,
    diagnostics:{
      mode:contenderCutDetected?"CORE_PLUS_NATURAL_SECONDARY_GROUP":"CORE_ONLY_TAIL_POSSIBLE",
      topScore,topTieCount,tailMedianGap,tailMadGap,
      contenderCutGap:contenderCutDetected?maxGap:null,
      contenderCutDetected
    }
  };
}

// Kept as a compatibility export for older audit/tests. v28 semantics return only
// the core branch tier; use selectNaturalBranchTiers for full classification.
export function selectAdaptiveMainCluster(structuredBranches=[]){
  return selectNaturalBranchTiers(structuredBranches).main;
}

function generateGirlsBranches(scored=[]){
  const branches=[];
  for(const rider of scored){
    const id=rider.id;
    branches.push(make({
      id:`GIRLS-LEAD-${rider.number}`,label:`${rider.number}主導権先行`,scenario:"主導権先行",branchType:"LEADER_HOLD",primaryLineId:null,requiredFirstNumber:rider.number,enabled:hasUsableStartPower(rider),
      scoreParts:[part("startPower",rider.evidence.start,.45),part("first",rider.roleScores.first,.25),part("stamina",rider.evidence.stamina,.15),part("recentForm",rider.evidence.recent,.15)],
      firstCandidateScores:{[id]:rider.roleScores.first||0}
    }));
    branches.push(make({
      id:`GIRLS-MAKURI-${rider.number}`,label:`${rider.number}まくり`,scenario:"まくり",branchType:"MAKURI_SUCCESS",primaryLineId:null,requiredFirstNumber:rider.number,enabled:true,
      scoreParts:[part("sprintPower",rider.evidence.sprint,.42),part("first",rider.roleScores.first,.24),part("finishPower",rider.evidence.finish,.20),part("recentForm",rider.evidence.recent,.14)],
      firstCandidateScores:{[id]:rider.roleScores.first||0}
    }));
  }
  const battleScores=Object.fromEntries(scored.map(p=>[p.id,weightedAvailable([[p.roleScores.first,.28],[p.evidence.start,.24],[p.evidence.finish,.20],[p.evidence.tracking,.16],[p.evidence.recent,.12]])]));
  branches.push(make({id:"GIRLS-POSITION",label:"位置取り・仕掛け競合",scenario:"位置取り競合",branchType:"LEAD_BATTLE",scoreParts:[part("candidateMean",avg(Object.values(battleScores)),1)],firstCandidateScores:battleScores,enabled:true}));
  const structured=branches.filter(branch=>["LEADER_HOLD","MAKURI_SUCCESS"].includes(branch.branchType)).sort(compareBranch);
  const tiers=selectNaturalBranchTiers(structured);
  const mainIds=new Set(tiers.main.map(branch=>branch.id)),contenderIds=new Set(tiers.contender.map(branch=>branch.id));
  return branches.filter(branch=>branch.firstCandidates.length&&branch.enabled).sort(compareBranch).map(branch=>({
    ...branch,
    priority:structured.includes(branch)?mainIds.has(branch.id)?"main":contenderIds.has(branch.id)?"contender":"sub":"risk",
    forecastRole:structured.includes(branch)?mainIds.has(branch.id)?"CENTER":contenderIds.has(branch.id)?"SECONDARY":"POSSIBLE":"RISK"
  }));
}

function hasUsableStartPower(rider){
  const evidence=rider?.startPowerEvidence;
  if(evidence){
    if(evidence?.usable===false)return false;
    if(Array.isArray(evidence?.missingInputs)&&evidence.missingInputs.length)return false;
    if(Number(evidence?.officialTotalStarts)===0)return false;
  }
  return rider?.evidence?.start!==null&&rider?.evidence?.start!==undefined&&Number.isFinite(Number(rider.evidence.start));
}

function emptyTierResult(){return{main:[],contender:[],sub:[],diagnostics:{mode:"EMPTY",topScore:null,topTieCount:0,tailMedianGap:null,tailMadGap:null,contenderCutGap:null,contenderCutDetected:false}}}
function part(key,value,weight){const available=value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value));return{key,value:available?Number(value):null,weight,available,contribution:0}}
function make({id,label,scenario,branchType,scoreParts=[],firstCandidateScores={},primaryLineId=null,requiredFirstNumber=null,enabled,lineIndependentFallback=false,initiative=null}){
  const availableWeight=scoreParts.filter(item=>item.available).reduce((sum,item)=>sum+item.weight,0);
  const normalizedParts=scoreParts.map(item=>({...item,effectiveWeight:item.available&&availableWeight>0?item.weight/availableWeight:0,contribution:item.available&&availableWeight>0?item.value*(item.weight/availableWeight):0,missing:!item.available}));
  const score=normalizedParts.reduce((sum,item)=>sum+item.contribution,0);
  const entries=Object.entries(firstCandidateScores).filter(([id,value])=>id&&Number.isFinite(value)&&value>0).sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),"en"));
  return{id,label,scenario,branchType,primaryLineId,requiredFirstNumber,lineIndependentFallback:Boolean(lineIndependentFallback),initiative,score,scoreTrace:[...normalizedParts].sort((a,b)=>b.contribution-a.contribution),firstCandidates:entries.map(([id])=>id),firstCandidateScores:Object.fromEntries(entries),enabled:Boolean(enabled)&&score>=2.2,priority:"risk"};
}
function compareBranch(a,b){return(b.score-a.score)||a.id.localeCompare(b.id,"en")}
function avg(values){const valid=values.filter(Number.isFinite);return valid.length?valid.reduce((sum,value)=>sum+value,0)/valid.length:0}
function weightedAvailable(items){const valid=items.filter(([value,weight])=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value))&&weight>0);const total=valid.reduce((sum,[,weight])=>sum+weight,0);return total>0?valid.reduce((sum,[value,weight])=>sum+Number(value)*weight,0)/total:5}
function median(values){const valid=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!valid.length)return 0;const mid=Math.floor(valid.length/2);return valid.length%2?valid[mid]:(valid[mid-1]+valid[mid])/2}
