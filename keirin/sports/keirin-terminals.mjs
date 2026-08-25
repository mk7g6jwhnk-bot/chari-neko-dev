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
            requiredFirstNumber:first.number,
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
      requiredFirstNumber:t.requiredFirstNumber,branchScore:t.branchScore,
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
  const role=Math.max(.01,Number(r[target])||5);
  const axes=target==="first"
    ?[e.recent,e.start,e.sprint,e.timing,e.stamina]
    :target==="second"
      ?[e.recent,e.finish,e.tracking,e.sprint,e.timing]
      :[e.recent,e.finish,e.tracking,e.stamina,e.lineTrust];
  const available=axes.map(Number).filter(Number.isFinite);
  const ability=available.length?geometricMean(available):role;
  // Branch probability already represents the scenario hypothesis. Do not add a
  // second template bonus merely for being on the initiative line or in bante.
  return Math.max(.01,role*.72+ability*.28);
}
function geometricMean(values){return Math.exp(values.reduce((sum,value)=>sum+Math.log(Math.max(.01,value)),0)/values.length)}
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
