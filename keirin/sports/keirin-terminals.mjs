export function generateKeirinTerminals({scored,branches}){
  const byId=new Map(scored.map(x=>[x.id,x]));
  const lineById=new Map(scored.map(x=>[x.id,x.lineId]));
  const raw=[];

  for(const branch of branches){
    const firstPool=branch.firstCandidates
      .map(id=>byId.get(id)).filter(Boolean)
      .map(first=>conditionalRow(branch,first,"first"))
      .filter(x=>x.conditionalScore>0);
    const firstTotal=sumConditional(firstPool);

    for(const firstRow of firstPool){
      const {participant:first,baseScore:firstScore,conditionalScore:firstConditionalScore}=firstRow;
      const firstRatio=firstConditionalScore/firstTotal;
      const secondPool=scored.filter(p=>p.id!==first.id)
        .map(second=>conditionalRow(branch,second,"second",first))
        .filter(x=>x.conditionalScore>0);
      const secondTotal=sumConditional(secondPool);

      for(const secondRow of secondPool){
        const {participant:second,baseScore:secondScore,conditionalScore:secondConditionalScore}=secondRow;
        const secondRatio=secondConditionalScore/secondTotal;
        const thirdPool=scored.filter(p=>p.id!==first.id&&p.id!==second.id)
          .map(third=>conditionalRow(branch,third,"third",first,second))
          .filter(x=>x.conditionalScore>0);
        const thirdTotal=sumConditional(thirdPool);

        for(const thirdRow of thirdPool){
          const {participant:third,baseScore:thirdScore,conditionalScore:thirdConditionalScore}=thirdRow;
          const thirdRatio=thirdConditionalScore/thirdTotal;
          raw.push({
            order:[first.number,second.number,third.number],
            branchId:branch.id,branchLabel:branch.label,
            branchPriority:"hypothesis",branchType:branch.branchType,
            primaryLineId:branch.primaryLineId||null,
            requiredFirstNumber:first.number,
            branchScore:branch.probability||branch.score,
            pathScore:firstRatio*secondRatio*thirdRatio,
            decisionRatios:{first:firstRatio,second:secondRatio,third:thirdRatio},
            positionScores:{first:firstScore,second:secondScore,third:thirdScore},
            conditionalScores:{
              firstBaseScore:firstScore,firstConditionalScore,
              secondBaseScore:secondScore,secondConditionalScore,
              thirdBaseScore:thirdScore,thirdConditionalScore
            },
            conditionalEvaluation:{
              model:"SEQUENTIAL-CONDITIONAL-NORMALIZATION-V1",
              first:firstRow.compatibility,
              second:secondRow.compatibility,
              third:thirdRow.compatibility
            },
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
      conditionalScores:t.conditionalScores,conditionalEvaluation:t.conditionalEvaluation,
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
    t.conditionalScores=d?.conditionalScores||null;
    t.conditionalEvaluation=d?.conditionalEvaluation||null;
    t.branchContributions=t.branchContributions.map(({conditionalScores,conditionalEvaluation,...rest})=>rest);
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
  const available=axes.filter(value=>value!==null&&value!==undefined&&value!=="").map(Number).filter(Number.isFinite);
  const ability=available.length?geometricMean(available):role;
  // Branch probability already represents the scenario hypothesis. Do not add a
  // second template bonus merely for being on the initiative line or in bante.
  return Math.max(.01,role*.72+ability*.28);
}
function conditionalRow(branch,participant,target,first=null,second=null){
  const baseScore=positionScore(branch,participant,target,first,second);
  const compatibility=conditionalCompatibility(branch,participant,target,first,second);
  return {participant,baseScore,conditionalScore:baseScore*compatibility.factor,compatibility};
}
function conditionalCompatibility(branch,p,target,first,second){
  const duplicateFirst=Boolean(first&&p.id===first.id);
  const duplicateSecond=Boolean(second&&p.id===second.id);
  const branchFirstMismatch=target==="first"&&!branch.firstCandidates.includes(p.id);
  const contradictions=[];
  if(duplicateFirst||duplicateSecond)contradictions.push("duplicate-rider-in-terminal");
  if(branchFirstMismatch)contradictions.push("branch-first-candidate-mismatch");
  const sameFirst=Boolean(first?.lineId&&p.lineId===first.lineId);
  const sameSecond=Boolean(second?.lineId&&p.lineId===second.lineId);
  return {
    factor:contradictions.length?0:1,
    classification:contradictions.length?"LOGICALLY_CONTRADICTORY":"NEUTRAL_UNCALIBRATED",
    branchType:branch.branchType,primaryLineId:branch.primaryLineId||null,
    relationToFirst:first?(sameFirst?"SAME_LINE":"OTHER_OR_UNKNOWN_LINE"):null,
    relationToSecond:second?(sameSecond?"SAME_LINE":"OTHER_OR_UNKNOWN_LINE"):null,
    roles:[first?.role||null,second?.role||null,p.role||null],
    evidenceCode:"BRANCH_PROVENANCE+LINE_ID+ROLE",
    contradictions,
    insufficientEvidenceCode:"NO_EMPIRICAL_CONDITIONAL_LINE_SURVIVAL_OR_TRACKING_RATE"
  };
}
function sumConditional(rows){return rows.reduce((sum,row)=>sum+row.conditionalScore,0)||1}
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
