export function generateKeirinTerminals({scored,branches}){
  const byId=new Map(scored.map(x=>[x.id,x]));
  const lineById=new Map(scored.map(x=>[x.id,x.lineId]));
  const raw=[];

  for(const branch of branches){
    const firstPool=branch.firstCandidates
      .map(id=>byId.get(id)).filter(Boolean)
      .map(first=>({first,score:positionScore(branch,first,"first")}))
      .filter(x=>x.score>0);

    for(const {first,score:firstScore} of firstPool){
      const secondPool=scored.filter(p=>p.id!==first.id)
        .map(second=>({second,score:positionScore(branch,second,"second",first)}))
        .filter(x=>x.score>0);

      for(const {second,score:secondScore} of secondPool){
        const thirdPool=scored.filter(p=>p.id!==first.id&&p.id!==second.id)
          .map(third=>({third,score:positionScore(branch,third,"third",first,second)}))
          .filter(x=>x.score>0);

        for(const {third,score:thirdScore} of thirdPool){
          raw.push({
            order:[first.number,second.number,third.number],
            branchId:branch.id,branchLabel:branch.label,
            branchPriority:"hypothesis",branchType:branch.branchType,
            primaryLineId:branch.primaryLineId||null,
            requiredFirstNumber:null,
            branchScore:branch.probability||branch.score,
            pathScore:firstScore*secondScore*thirdScore,
            decisionRatios:{first:1,second:1,third:1},
            positionScores:{first:firstScore,second:secondScore,third:thirdScore},
            positionEvidence:{
              first:evidence(first,"first"),second:evidence(second,"second"),third:evidence(third,"third")
            },
            holdReason:"全終端を同一土俵で生成し、枝名による着順固定を行わない"
          });
        }
      }
    }
  }

  const map=new Map();
  for(const t of raw){
    const key=t.order.join("-");
    const weighted=t.branchScore*t.pathScore;
    const c={
      branchId:t.branchId,branchLabel:t.branchLabel,branchPriority:"hypothesis",
      branchType:t.branchType,primaryLineId:t.primaryLineId,
      requiredFirstNumber:null,branchScore:t.branchScore,
      weightedScore:weighted,pathScore:t.pathScore,
      positionScores:t.positionScores,positionEvidence:t.positionEvidence,
      decisionRatios:t.decisionRatios
    };
    if(!map.has(key)){
      map.set(key,{order:t.order,score:weighted,branchId:t.branchId,branchLabel:t.branchLabel,
        branchPriority:"hypothesis",branchType:t.branchType,holdReason:t.holdReason,
        contributingBranches:[t.branchId],branchContributions:[c]});
    }else{
      const x=map.get(key); x.score+=weighted;
      x.contributingBranches=[...new Set([...x.contributingBranches,t.branchId])];
      x.branchContributions.push(c);
    }
  }

  const terminals=[...map.values()];
  const total=terminals.reduce((s,x)=>s+x.score,0)||1;
  for(const t of terminals){
    t.probability=t.score/total;
    t.branchContributions=t.branchContributions
      .map(c=>({...c,probability:c.weightedScore/total}))
      .sort((a,b)=>b.probability-a.probability||a.branchId.localeCompare(b.branchId));
    const d=t.branchContributions[0];
    t.branchId=d?.branchId||t.branchId;
    t.branchLabel=d?.branchLabel||t.branchLabel;
    t.branchPriority="hypothesis";
    t.branchType=d?.branchType||t.branchType;
  }
  return terminals.sort((a,b)=>b.probability-a.probability||a.order.join("-").localeCompare(b.order.join("-")));
}

function positionScore(branch,p,target,first,second){
  const e=p.evidence||{}, r=p.roleScores||{};
  const base=.24*(r.first||5)+.18*(r.second||5)+.18*(r.third||5)+
    .14*(e.finish||5)+.12*(e.tracking||5)+.08*(e.recent||5)+.06*(e.stamina||5);
  const relation=relationScore(branch,p,first,second);
  return Math.max(.01,base*(.75+.25*relation));
}
function relationScore(branch,p,first,second){
  let v=1;
  if(branch.primaryLineId && p.lineId===branch.primaryLineId)v+=.05;
  if(branch.branchType==="SOLO_RISE" && p.role==="単騎")v+=.12;
  if(branch.branchType==="LINE_SEPARATION" && first && p.lineId!==first.lineId)v+=.06;
  if(branch.branchType==="BANTE_SASHI" && first && p.lineId===first.lineId && p.role==="番手")v+=.06;
  return v;
}
function evidence(p,target){
  const e=p.evidence||{}, r=p.roleScores||{};
  return {number:p.number,id:p.id,role:p.role,target,
    roleScore:r[target]||5,
    drivers:{
      first:r.first||5,second:r.second||5,third:r.third||5,
      start:e.start||5,sprint:e.sprint||5,finish:e.finish||5,
      tracking:e.tracking||5,recent:e.recent||5,lineTrust:e.lineTrust||5
    }};
}
