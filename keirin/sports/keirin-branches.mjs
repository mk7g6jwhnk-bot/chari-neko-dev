export function generateKeirinBranches({scored,lines,lineConfidence}){
  const branches=[];
  const lineEnabled=lineConfidence==="高";

  for(const line of lines.filter(item=>item.type==="ライン")){
    const leader=line.leader,bante=line.bante;
    if(leader){
      branches.push(make({
        id:`LEAD-${line.id}`,label:`${line.id}先行押し切り`,scenario:"先行押し切り",branchType:"LEADER_HOLD",primaryLineId:line.id,requiredFirstNumber:leader.number,enabled:lineEnabled,
        scoreParts:[part("first",leader.roleScores.first,.40),part("startPower",leader.evidence.start,.35),part("recentForm",leader.evidence.recent,.15),part("finishPower",leader.evidence.finish,.10)],
        firstCandidateScores:{[leader.id]:leader.roleScores.first||0}
      }));
      branches.push(make({
        id:`MAKURI-${line.id}`,label:`${line.id}まくり`,scenario:"別線まくり",branchType:"MAKURI_SUCCESS",primaryLineId:line.id,requiredFirstNumber:leader.number,enabled:lineEnabled,
        scoreParts:[part("first",leader.roleScores.first,.32),part("sprintPower",leader.evidence.sprint,.42),part("finishPower",leader.evidence.finish,.16),part("recentForm",leader.evidence.recent,.10)],
        firstCandidateScores:{[leader.id]:leader.roleScores.first||0}
      }));
    }
    if(bante){
      branches.push(make({
        id:`BANTE-${line.id}`,label:`${line.id}番手差し`,scenario:"番手差し",branchType:"BANTE_SASHI",primaryLineId:line.id,requiredFirstNumber:bante.number,enabled:lineEnabled,
        scoreParts:[part("first",bante.roleScores.first,.32),part("finishPower",bante.evidence.finish,.34),part("trackingSkill",bante.evidence.tracking,.24),part("recentForm",bante.evidence.recent,.10)],
        firstCandidateScores:{[bante.id]:bante.roleScores.first||0}
      }));
    }
  }

  const battleScores=Object.fromEntries(scored.map(p=>[p.id,(p.roleScores.first||0)*.32+(p.evidence.finish||0)*.26+(p.evidence.tracking||0)*.22+(p.evidence.start||0)*.10+(p.evidence.recent||0)*.10]));
  branches.push(make({id:"BATTLE",label:"踏み合い消耗戦",scenario:"踏み合い",branchType:"LEAD_BATTLE",scoreParts:[part("candidateMean",avg(Object.values(battleScores)),1)],firstCandidateScores:battleScores,enabled:true}));

  const soloScores=Object.fromEntries(scored.filter(p=>p.role==="単騎").map(p=>[p.id,(p.roleScores.first||0)*.38+(p.evidence.finish||0)*.26+(p.evidence.sprint||0)*.22+(p.evidence.recent||0)*.14]));
  branches.push(make({id:"SOLO",label:"単騎浮上",scenario:"単騎浮上",branchType:"SOLO_RISE",scoreParts:[part("candidateMean",avg(Object.values(soloScores)),1)],firstCandidateScores:soloScores,enabled:Object.keys(soloScores).length>0}));

  const separationScores=Object.fromEntries(scored.map(p=>[p.id,(p.roleScores.first||0)*.28+(p.evidence.finish||0)*.28+(p.evidence.tracking||0)*.30+(p.evidence.recent||0)*.14]));
  branches.push(make({id:"SEPARATION",label:"番手離れ・繰り上がり",scenario:"番手離れ",branchType:"LINE_SEPARATION",scoreParts:[part("candidateMean",lineEnabled?avg(Object.values(separationScores)):0,1)],firstCandidateScores:separationScores,enabled:lineEnabled}));

  const enabled=branches.filter(branch=>branch.firstCandidates.length&&branch.enabled).sort(compareBranch);
  const structured=enabled.filter(branch=>["LEADER_HOLD","BANTE_SASHI","MAKURI_SUCCESS"].includes(branch.branchType));
  const tiers=selectNaturalBranchTiers(structured);
  const mainIds=new Set(tiers.main.map(branch=>branch.id));
  const contenderIds=new Set(tiers.contender.map(branch=>branch.id));

  return enabled.map(branch=>({
    ...branch,
    // Structured branches are no longer forced into one upper/lower 2-cluster split.
    // A uniquely highest (or exact-tied highest) branch is the core scenario.
    // Remaining structural branches are only split into contender/sub tiers when the
    // lower tail contains a robust natural gap; otherwise no artificial lower cutoff is invented.
    priority:structured.includes(branch)
      ?mainIds.has(branch.id)?"main":contenderIds.has(branch.id)?"contender":"sub"
      :"risk"
  }));
}

export function selectNaturalBranchTiers(structuredBranches=[]){
  const sorted=[...structuredBranches].sort(compareBranch);
  if(!sorted.length)return emptyTierResult();

  const scores=sorted.map(branch=>Number(branch.score)||0);
  const topScore=scores[0];
  const bottomScore=scores[scores.length-1];
  const eps=Math.max(1e-9,Math.abs(topScore)*1e-12);

  // If every structural branch has the same score, there is no evidence for a core
  // scenario. Keep them all as contenders instead of inventing a winner.
  if(Math.abs(topScore-bottomScore)<=eps){
    return{
      main:[],contender:sorted,sub:[],
      diagnostics:{mode:"NO_SEPARATION",topScore,topTieCount:sorted.length,tailMedianGap:0,tailMadGap:0,contenderCutGap:null,contenderCutDetected:false}
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
    return{main,contender:tail,sub:[],diagnostics:{mode:"NO_LOWER_CUT",topScore,topTieCount,tailMedianGap:null,tailMadGap:null,contenderCutGap:null,contenderCutDetected:false}};
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
  const contender=contenderCutDetected?tail.slice(0,maxGapIndex+1):tail;
  const sub=contenderCutDetected?tail.slice(maxGapIndex+1):[];

  return{
    main,contender,sub,
    diagnostics:{
      mode:contenderCutDetected?"CORE_PLUS_NATURAL_LOWER_BREAK":"CORE_WITHOUT_FORCED_LOWER_BREAK",
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

function emptyTierResult(){return{main:[],contender:[],sub:[],diagnostics:{mode:"EMPTY",topScore:null,topTieCount:0,tailMedianGap:null,tailMadGap:null,contenderCutGap:null,contenderCutDetected:false}}}
function part(key,value,weight){return{key,value:Number(value)||0,weight,contribution:(Number(value)||0)*weight}}
function make({id,label,scenario,branchType,scoreParts=[],firstCandidateScores={},primaryLineId=null,requiredFirstNumber=null,enabled}){
  const score=scoreParts.reduce((sum,item)=>sum+item.contribution,0);
  const entries=Object.entries(firstCandidateScores).filter(([id,value])=>id&&Number.isFinite(value)&&value>0).sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),"en"));
  return{id,label,scenario,branchType,primaryLineId,requiredFirstNumber,score,scoreTrace:[...scoreParts].sort((a,b)=>b.contribution-a.contribution),firstCandidates:entries.map(([id])=>id),firstCandidateScores:Object.fromEntries(entries),enabled:Boolean(enabled)&&score>=2.2,priority:"risk"};
}
function compareBranch(a,b){return(b.score-a.score)||a.id.localeCompare(b.id,"en")}
function avg(values){const valid=values.filter(Number.isFinite);return valid.length?valid.reduce((sum,value)=>sum+value,0)/valid.length:0}
function median(values){const valid=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!valid.length)return 0;const mid=Math.floor(valid.length/2);return valid.length%2?valid[mid]:(valid[mid-1]+valid[mid])/2}
