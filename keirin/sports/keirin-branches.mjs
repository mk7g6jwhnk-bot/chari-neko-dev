export function generateKeirinBranches({scored,lines,lineConfidence,raceCategory="standard"}){
  if(raceCategory==="girls") return generateGirlsBranches(scored);

  const activeLines=lines.filter(x=>x.type==="ライン");
  const branches=[];

  // Templates are hypotheses only. No branch is assigned main/contender/sub here.
  for(const line of activeLines){
    const leader=line.leader, bante=line.bante;
    if(leader){
      branches.push(makeEvent({
        id:`LEAD-${line.id}`, label:`${line.id}主導権`, branchType:"LEADER_HOLD",
        primaryLineId:line.id, candidates:[leader.id],
        eventEvidence:scoreLeader(leader)
      }));
      branches.push(makeEvent({
        id:`MAKURI-${line.id}`, label:`${line.id}仕掛け成功`, branchType:"MAKURI_SUCCESS",
        primaryLineId:line.id, candidates:[leader.id],
        eventEvidence:scoreAttack(leader)
      }));
    }
    if(bante){
      branches.push(makeEvent({
        id:`BANTE-${line.id}`, label:`${line.id}番手優位`, branchType:"BANTE_SASHI",
        primaryLineId:line.id, candidates:[bante.id],
        eventEvidence:scoreBante(bante)
      }));
    }
  }

  const all=scored.map(p=>p.id);
  if(all.length){
    branches.push(makeEvent({
      id:"BATTLE",label:"主導権争い・消耗",branchType:"LEAD_BATTLE",
      candidates:all,eventEvidence:scoreBattle(scored)
    }));
    branches.push(makeEvent({
      id:"SEPARATION",label:"ライン崩れ・番手離れ",branchType:"LINE_SEPARATION",
      candidates:all,eventEvidence:scoreSeparation(scored)
    }));
  }

  const solo=scored.filter(p=>p.role==="単騎").map(p=>p.id);
  if(solo.length){
    branches.push(makeEvent({
      id:"SOLO",label:"単騎浮上",branchType:"SOLO_RISE",
      candidates:solo,eventEvidence:Object.fromEntries(scored.filter(p=>solo.includes(p.id)).map(p=>[
        p.id,weightedKnown(p,["first","start","finish","recent","tracking"],[.30,.20,.20,.15,.15])
      ]))
    }));
  }

  // Every enabled hypothesis enters the same probability pool.
  const enabled=branches.filter(b=>b.enabled && b.firstCandidates.length);
  const total=enabled.reduce((s,b)=>s+b.score,0)||1;
  return enabled.map(b=>({
    ...b,
    probability:b.score/total,
    // compatibility only; purchase code must not use this as a tier.
    priority:"hypothesis"
  }));
}

function makeEvent({id,label,branchType,primaryLineId=null,candidates,eventEvidence}){
  const values=Object.values(eventEvidence||{}).filter(Number.isFinite);
  const score=values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
  const firstCandidates=[...new Set(candidates.filter(Boolean))];
  return {
    id,label,scenario:label,branchType,primaryLineId,
    requiredFirstNumber:null,
    score,
    scoreTrace:[{key:"eventEvidence",value:score,weight:1,contribution:score}],
    firstCandidates,
    firstCandidateScores:Object.fromEntries(firstCandidates.map(id=>[id,Number(eventEvidence?.[id])||score])),
    enabled:score>0,
    priority:"hypothesis"
  };
}

function scoreLeader(r){
  return {[r.id]:common(r,.30,.25,.20,.15,.10)};
}
function scoreAttack(r){
  return {[r.id]:common(r,.22,.34,.20,.14,.10)};
}
function scoreBante(r){
  return {[r.id]:common(r,.20,.25,.30,.15,.10)};
}
function common(p,a,b,c,d,e){
  return weightedKnown(p,["first","start","finish","recent","tracking"],[a,b,c,d,e]);
}
function scoreBattle(scored){
  return Object.fromEntries(scored.map(p=>[p.id,weightedKnown(p,["first","start","finish","tracking","recent"],[.24,.24,.24,.18,.10])]));
}
function scoreSeparation(scored){
  return Object.fromEntries(scored.map(p=>[p.id,weightedKnown(p,["first","tracking","finish","recent","lineTrust"],[.22,.30,.26,.14,.08])]));
}
function weightedKnown(p,keys,weights){
  const values=keys.map(key=>key==="first"?p.roleScores?.first:p.evidence?.[key]);
  const available=values.map((value,index)=>({value,index})).filter(({value})=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value)));
  const total=available.reduce((sum,{index})=>sum+weights[index],0);
  return total?available.reduce((sum,{value,index})=>sum+Number(value)*weights[index],0)/total:0;
}
function generateGirlsBranches(scored){
  return generateKeirinBranches({scored,lines:[],lineConfidence:"高",raceCategory:"standard"});
}
