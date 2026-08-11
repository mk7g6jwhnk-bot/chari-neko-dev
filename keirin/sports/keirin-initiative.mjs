const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
const clamp=(v,min=0,max=10)=>Math.min(max,Math.max(min,Number(v)));

export function buildKeirinInitiativeAssessment({scored=[],lines=[],raceCategory="standard"}={}){
  if(raceCategory==="girls")return buildGirls(scored);
  const lineRows=(lines||[]).filter(line=>line?.type==="ライン"&&line?.leader);
  const leaderScores=lineRows.map(line=>finite(line?.leader?.officialScore)?Number(line.leader.officialScore):null).filter(Number.isFinite);
  const scoreCenter=median(leaderScores);
  const candidates=lineRows.map(line=>buildCandidate(line.leader,line,{scoreCenter}));
  return finalize(candidates,{raceCategory});
}

function buildGirls(scored=[]){
  const scores=(scored||[]).map(r=>finite(r?.officialScore)?Number(r.officialScore):null).filter(Number.isFinite);
  const scoreCenter=median(scores);
  return finalize((scored||[]).map(rider=>buildCandidate(rider,null,{scoreCenter})),{raceCategory:"girls"});
}

function buildCandidate(rider,line,{scoreCenter=null}={}){
  const ev=rider?.startPowerEvidence||{};
  const bScore=finite(ev?.bPercentileScore)?Number(ev.bPercentileScore):null;
  const hScore=finite(ev?.hPercentileScore)?Number(ev.hPercentileScore):null;
  const rawB=finite(ev?.rawBackCount)?Number(ev.rawBackCount):null;
  const rawH=finite(ev?.rawHomeCount)?Number(ev.rawHomeCount):null;
  const starts=finite(ev?.officialTotalStarts)?Number(ev.officialTotalStarts):null;
  const startsQuality=finite(ev?.startsQuality)?Number(ev.startsQuality):(finite(starts)?starts/(starts+15):null);
  const sampleScore=startsQuality===null?null:clamp(startsQuality*10);
  const finalControlScore=rawB===null||rawH===null||(rawB+rawH)<=0?null:clamp(5+5*((rawB-rawH)/(rawB+rawH)));
  const officialScore=finite(rider?.officialScore)?Number(rider.officialScore):null;
  const strengthScore=officialScore===null||!finite(scoreCenter)?null:strengthGapScore(officialScore-Number(scoreCenter));
  const lineLength=line&&Array.isArray(line.members)?line.members.length:line&&Array.isArray(line.riders)?line.riders.length:null;
  const lineSupportScore=lineLength===null?null:clamp(lineLength<=1?3:lineLength===2?5:lineLength===3?7:8);

  // Initiative order is deliberately B-led. H is supporting evidence only.
  // A large official-score gap may matter as a capped strength correction, but
  // ordinary score differences live inside a dead zone and cannot dominate B evidence.
  const parts=[
    part("backFrequency",bScore,.55),
    part("homeFrequency",hScore,.10),
    part("finalControlBalance",finalControlScore,.10),
    part("sampleReliability",sampleScore,.05),
    part("largeAbilityGap",strengthScore,.15),
    part("lineSupport",lineSupportScore,.05)
  ];
  const score=weighted(parts);
  const validWeight=parts.filter(x=>x.available).reduce((s,x)=>s+x.weight,0);
  const scoreTrace=parts.map(p=>({...p,effectiveWeight:p.available&&validWeight?p.weight/validWeight:0,contribution:p.available&&validWeight?p.value*(p.weight/validWeight):0}));
  return{
    riderId:rider?.id||null,
    riderNumber:Number(rider?.number),
    riderName:rider?.name||null,
    lineId:line?.id||null,
    lineLength,
    score,
    scoreTrace,
    evidence:{
      startPower:finite(rider?.evidence?.start)?Number(rider.evidence.start):finite(rider?.startPower)?Number(rider.startPower):null,
      backCount:rawB,homeCount:rawH,officialTotalStarts:starts,
      bFrequency:finite(ev?.bFrequency)?Number(ev.bFrequency):null,
      hFrequency:finite(ev?.hFrequency)?Number(ev.hFrequency):null,
      shrunkBFrequency:finite(ev?.shrunkBFrequency)?Number(ev.shrunkBFrequency):null,
      shrunkHFrequency:finite(ev?.shrunkHFrequency)?Number(ev.shrunkHFrequency):null,
      bPercentileScore:bScore,hPercentileScore:hScore,
      finalControlScore,sampleScore,officialScore,scoreCenter,strengthScore,lineLength,lineSupportScore,
      confidence:ev?.confidence||null,usable:ev?.usable!==false&&finite(bScore)
    },
    excludedInputs:["roleScores.first","recentForm","finishPower","trackingSkill","rolePrior","purchaseData","odds","escapeMechanism","banteSashiMechanism"],
    allowedInputs:["bPercentileScore","hPercentileScore","rawBackCount","rawHomeCount","startsQuality","officialScore.largeGapOnly","lineLength"]
  };
}

function strengthGapScore(gap){
  const abs=Math.abs(Number(gap));
  if(abs<=3)return 5;
  const scaled=Math.min(5,(abs-3)*(5/7));
  return clamp(5+Math.sign(gap)*scaled);
}

function finalize(candidates,{raceCategory}){
  const usable=(candidates||[]).filter(c=>Number.isFinite(c.score)).sort((a,b)=>b.score-a.score||a.riderNumber-b.riderNumber);
  const raw=usable.map(c=>Math.exp((c.score-5)/1.6));
  const total=raw.reduce((s,v)=>s+v,0);
  const ranked=usable.map((c,i)=>({...c,rank:i+1,probability:total>0?raw[i]/total:0}));
  return{
    version:"INITIATIVE-ENGINE-1.1-B-LED-STRENGTH-GUARD",
    policy:"INITIATIVE_FIRST; B_LED; H_SUPPORT_ONLY; LARGE_OFFICIAL_SCORE_GAP_CAPPED; LINE_SUPPORT_CAPPED; NO_PLACEMENT_OR_FINISH_CONTEXT",
    raceCategory,candidates:ranked,top:ranked[0]||null,
    probabilitySum:ranked.reduce((s,c)=>s+c.probability,0),
    excludedInputs:["roleScores.first","recentForm","finishPower","trackingSkill","rolePrior","purchaseData","odds","escapeMechanism","banteSashiMechanism"],
    passed:ranked.length>0&&Math.abs(ranked.reduce((s,c)=>s+c.probability,0)-1)<1e-9
  };
}

function part(key,value,weight){return{key,value:finite(value)?Number(value):null,weight,available:finite(value)}}
function weighted(parts){const valid=parts.filter(p=>p.available);const total=valid.reduce((s,p)=>s+p.weight,0);return total?valid.reduce((s,p)=>s+p.value*p.weight,0)/total:null}
function median(values){const xs=(values||[]).filter(Number.isFinite).sort((a,b)=>a-b);if(!xs.length)return null;const m=Math.floor(xs.length/2);return xs.length%2?xs[m]:(xs[m-1]+xs[m])/2}
