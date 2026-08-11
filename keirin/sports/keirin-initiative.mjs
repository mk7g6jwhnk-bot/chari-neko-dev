const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
const clamp=(v,min=0,max=10)=>Math.min(max,Math.max(min,Number(v)));

export function buildKeirinInitiativeAssessment({scored=[],lines=[],raceCategory="standard"}={}){
  if(raceCategory==="girls")return buildGirls(scored);
  const candidates=(lines||[])
    .filter(line=>line?.type==="ライン"&&line?.leader)
    .map(line=>buildCandidate(line.leader,line.id));
  return finalize(candidates,{raceCategory});
}

function buildGirls(scored=[]){
  return finalize((scored||[]).map(rider=>buildCandidate(rider,null)),{raceCategory:"girls"});
}

function buildCandidate(rider,lineId){
  const start=finite(rider?.evidence?.start)?Number(rider.evidence.start):finite(rider?.startPower)?Number(rider.startPower):null;
  const ev=rider?.startPowerEvidence||{};
  const bScore=finite(ev?.bPercentileScore)?Number(ev.bPercentileScore):null;
  const hScore=finite(ev?.hPercentileScore)?Number(ev.hPercentileScore):null;
  const escapeRate=normalizeShare(ev?.escapeRate ?? rider?.officialProfileEvidence?.winningStyleRates?.escape);
  const escapeRateScore=escapeRate===null?null:clamp(escapeRate*10);

  // Initiative is intentionally isolated from finish/placement/context priors.
  // B/H-derived startPower is the core signal. Escape-rate is only a secondary
  // direct early-position/escape signal when official evidence exists.
  const parts=[
    part("bhInitiative",start,.75),
    part("backFrequency",bScore,.10),
    part("homeFrequency",hScore,.10),
    part("escapeRate",escapeRateScore,.05)
  ];
  const score=weighted(parts);
  return{
    riderId:rider?.id||null,
    riderNumber:Number(rider?.number),
    riderName:rider?.name||null,
    lineId:lineId||null,
    score,
    scoreTrace:parts.map(p=>({...p,effectiveWeight:p.available?p.weight/parts.filter(x=>x.available).reduce((s,x)=>s+x.weight,0):0,contribution:0})).map(p=>({...p,contribution:p.available?p.value*p.effectiveWeight:0})),
    evidence:{
      startPower:start,
      backCount:finite(ev?.rawBackCount)?Number(ev.rawBackCount):null,
      homeCount:finite(ev?.rawHomeCount)?Number(ev.rawHomeCount):null,
      officialTotalStarts:finite(ev?.officialTotalStarts)?Number(ev.officialTotalStarts):null,
      bFrequency:finite(ev?.bFrequency)?Number(ev.bFrequency):null,
      hFrequency:finite(ev?.hFrequency)?Number(ev.hFrequency):null,
      escapeRate,
      confidence:ev?.confidence||null,
      usable:ev?.usable!==false&&finite(start)
    },
    excludedInputs:["roleScores.first","recentForm","finishPower","trackingSkill","lineTrust","rolePrior","purchaseData","odds"]
  };
}

function finalize(candidates,{raceCategory}){
  const usable=(candidates||[]).filter(c=>Number.isFinite(c.score)).sort((a,b)=>b.score-a.score||a.riderNumber-b.riderNumber);
  const raw=usable.map(c=>Math.exp((c.score-5)/1.6));
  const total=raw.reduce((s,v)=>s+v,0);
  const ranked=usable.map((c,i)=>({...c,rank:i+1,probability:total>0?raw[i]/total:0}));
  return{
    version:"INITIATIVE-ENGINE-1.0-INDEPENDENT",
    policy:"INITIATIVE_FIRST; USE_ONLY_DIRECT_INITIATIVE_EVIDENCE; NO_PLACEMENT_OR_FINISH_CONTEXT",
    raceCategory,
    candidates:ranked,
    top:ranked[0]||null,
    probabilitySum:ranked.reduce((s,c)=>s+c.probability,0),
    excludedInputs:["roleScores.first","recentForm","finishPower","trackingSkill","lineTrust","rolePrior","purchaseData","odds"],
    passed:ranked.length>0&&Math.abs(ranked.reduce((s,c)=>s+c.probability,0)-1)<1e-9
  };
}

function part(key,value,weight){return{key,value:finite(value)?Number(value):null,weight,available:finite(value)}}
function weighted(parts){const valid=parts.filter(p=>p.available);const total=valid.reduce((s,p)=>s+p.weight,0);return total?valid.reduce((s,p)=>s+p.value*p.weight,0)/total:null}
function normalizeShare(v){if(!finite(v)||Number(v)<0)return null;const n=Number(v);const share=n>1?n/100:n;return share>=0&&share<=1?share:null}
