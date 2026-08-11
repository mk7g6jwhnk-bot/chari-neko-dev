export function generateKeirinTerminals({scored,branches}){
  const byId=new Map(scored.map(item=>[item.id,item]));
  const topBranchScore=Math.max(...(branches||[]).map(branch=>Number(branch?.score)||0),0);
  const lineById=new Map(scored.map(item=>[item.id,item.lineId]));
  const raw=[];
  const generationEvents=[];
  const secondReevaluationRows=[];
  const thirdReevaluationRows=[];
  const thirdDedicatedGenerationRows=[];
  const mixedLineThirdRows=[];
  const placementEvaluationRows=[];

  for(const branch of branches){
    const paths=[];
    const firstEntries=[];
    for(const firstId of branch.firstCandidates||[]){
      const first=byId.get(firstId);
      if(!first){
        generationEvents.push({stage:"FIRST",branchId:branch.id,branchLabel:branch.label,participantId:firstId,action:"EXCLUDED",reasonGroup:"DATA_CONTRADICTION",reasonCode:"FIRST_CANDIDATE_NOT_FOUND",reason:"枝の1着候補IDが出走表に存在しない"});
        continue;
      }
      if(!branchFirstRoleCompatible(branch,first)){
        generationEvents.push({stage:"FIRST",branchId:branch.id,branchLabel:branch.label,number:first.number,action:"EXCLUDED",reasonGroup:"RULE_IMPOSSIBLE",reasonCode:"FIRST_ROLE_INCOMPATIBLE",reason:"展開枝が要求する1着役割と選手のライン役割が一致しない"});
        continue;
      }
      const firstScore=conditionedFirst(branch,first);
      firstEntries.push({first,score:firstScore});
      placementEvaluationRows.push(buildPlacementEvaluationRow({stage:"FIRST",branch,participant:first,score:firstScore,orderPrefix:[]}));
    }
    const bestFirst=Math.max(...firstEntries.map(item=>item.score),0);

    const firstTotal=firstEntries.reduce((sum,item)=>sum+item.score,0);
    const firstStageEntries=firstEntries.map(({first,score})=>({first,score,node:buildFirstNode(branch,first,score,firstTotal)}));
    const bestFirstConditional=Math.max(...firstStageEntries.map(item=>Number(item.node?.conditionalProbability)||0),0);
    const branchDifferential=buildDifferentialCondition({stage:"BRANCH",value:Number(branch.score)||0,bestValue:topBranchScore,label:branch.label||branch.id});

    for(const {first,score:firstScore,node:firstNode} of firstStageEntries){
      const firstDifferential=buildDifferentialCondition({stage:"FIRST",value:Number(firstNode?.conditionalProbability)||0,bestValue:bestFirstConditional,label:`${first.number}番1着`});

      // FIRST成立後はいったんライン序列を候補集合から外し、
      // 1着本人以外の全員をSECONDとして独立再評価する。
      const expectedSecondNumbers=scored.filter(second=>second.id!==first.id).map(second=>Number(second.number));
      const secondEntries=scored
        .filter(second=>second.id!==first.id)
        .map(second=>{
          const score=conditionedSecond(branch,first,second,lineById);
          placementEvaluationRows.push(buildPlacementEvaluationRow({stage:"SECOND",branch,participant:second,score,orderPrefix:[Number(first.number)]}));
          return{second,score};
        });
      const actualSecondNumbers=secondEntries.map(item=>Number(item.second.number));
      const missingSecondNumbers=expectedSecondNumbers.filter(number=>!actualSecondNumbers.includes(number));
      secondReevaluationRows.push({
        branchId:branch.id,branchLabel:branch.label,first:Number(first.number),
        expectedNumbers:expectedSecondNumbers,reevaluatedNumbers:actualSecondNumbers,
        missingNumbers:missingSecondNumbers,
        expectedCount:expectedSecondNumbers.length,reevaluatedCount:actualSecondNumbers.length,
        passed:missingSecondNumbers.length===0
      });
      if(missingSecondNumbers.length){
        generationEvents.push({stage:"SECOND",branchId:branch.id,branchLabel:branch.label,order:[first.number],action:"AUDIT_MISS",reasonGroup:"COVERAGE_MISS",reasonCode:"SECOND_REEVALUATION_COVERAGE_MISS",reason:`1着${first.number}成立後に2着再評価されていない選手: ${missingSecondNumbers.join(",")}`});
      }
      const bestSecond=Math.max(...secondEntries.map(item=>item.score),0);
      const secondTotal=secondEntries.reduce((sum,item)=>sum+item.score,0);
      const secondStageEntries=[];
      for(const {second,score} of secondEntries){
        const node=buildSecondNode(branch,firstNode,first,second,score,secondTotal,lineById);
        const conflict=stateConflict(node);
        if(conflict){
          generationEvents.push({stage:"SECOND",branchId:branch.id,branchLabel:branch.label,order:[first.number,second.number],action:"EXCLUDED",reasonGroup:"RULE_IMPOSSIBLE",reasonCode:"PARENT_STATE_CONTRADICTION",reason:conflict});
          continue;
        }
        secondStageEntries.push({second,score,node});
      }
      const bestSecondConditional=Math.max(...secondStageEntries.map(item=>Number(item.node?.conditionalProbability)||0),0);

      for(const {second,score:secondScore,node:secondNode} of secondStageEntries){
        const secondDifferential=buildDifferentialCondition({stage:"SECOND",value:Number(secondNode?.conditionalProbability)||0,bestValue:bestSecondConditional,label:`${second.number}番2着`});

        // THIRD専用工程:
        // 1-2着が成立した時点で、それまでの総合順位・頭評価を候補生成条件に使わない。
        // まず残り全員について「3着になる条件」を独立生成し、その後に初めて3着score/確率を付ける。
        const thirdCandidates=generateThirdCandidates({
          branch,first,second,scored,lineById
        });
        const expectedThirdNumbers=scored
          .filter(third=>third.id!==first.id&&third.id!==second.id)
          .map(third=>Number(third.number));
        const generatedThirdNumbers=thirdCandidates.map(item=>Number(item.third.number));
        const missingThirdNumbers=expectedThirdNumbers.filter(number=>!generatedThirdNumbers.includes(number));

        thirdDedicatedGenerationRows.push({
          branchId:branch.id,branchLabel:branch.label,order:[Number(first.number),Number(second.number)],
          candidateNumbers:generatedThirdNumbers,
          conditionSets:thirdCandidates.map(item=>({
            number:Number(item.third.number),
            conditionIds:item.requiredConditions.map(condition=>condition.id),
            conditionKinds:item.requiredConditions.map(condition=>condition.kind)
          })),
          probabilityAssignedAfterConditionGeneration:true,
          scoreBasedGenerationPruningApplied:false,
          passed:missingThirdNumbers.length===0
        });

        // 条件生成後にだけ3着scoreを計算。低scoreを理由に候補集合から削除しない。
        const thirdEntries=thirdCandidates.map(item=>{
          const score=conditionedThird(branch,first,second,item.third,lineById);
          placementEvaluationRows.push(buildPlacementEvaluationRow({stage:"THIRD",branch,participant:item.third,score,orderPrefix:[Number(first.number),Number(second.number)]}));
          return{...item,score};
        });
        const actualThirdNumbers=thirdEntries.map(item=>Number(item.third.number));
        thirdReevaluationRows.push({
          branchId:branch.id,branchLabel:branch.label,order:[Number(first.number),Number(second.number)],
          expectedNumbers:expectedThirdNumbers,reevaluatedNumbers:actualThirdNumbers,
          missingNumbers:missingThirdNumbers,
          expectedCount:expectedThirdNumbers.length,reevaluatedCount:actualThirdNumbers.length,
          passed:missingThirdNumbers.length===0
        });
        if(missingThirdNumbers.length){
          generationEvents.push({stage:"THIRD",branchId:branch.id,branchLabel:branch.label,order:[first.number,second.number],action:"AUDIT_MISS",reasonGroup:"COVERAGE_MISS",reasonCode:"THIRD_REEVALUATION_COVERAGE_MISS",reason:`${first.number}-${second.number}成立後に3着条件を独立生成されていない選手: ${missingThirdNumbers.join(",")}`});
        }

        const mixedExpected=thirdEntries
          .map(item=>item.third)
          .filter(third=>["番手","三番手"].includes(String(third.role||"")))
          .filter(third=>!sameLine(first,third,lineById)&&!sameLine(second,third,lineById))
          .map(third=>Number(third.number));
        mixedLineThirdRows.push({
          branchId:branch.id,branchLabel:branch.label,order:[Number(first.number),Number(second.number)],
          mixedRearNumbers:mixedExpected,
          evaluatedMixedRearNumbers:mixedExpected.filter(number=>actualThirdNumbers.includes(number)),
          passed:mixedExpected.every(number=>actualThirdNumbers.includes(number))
        });
        const bestThird=Math.max(...thirdEntries.map(item=>item.score),0);
        const thirdTotal=thirdEntries.reduce((sum,item)=>sum+Math.max(Number(item.score)||0,.000001),0);
        const thirdStageEntries=[];
        for(const {third,requiredConditions,score} of thirdEntries){
          const node=buildThirdNode(branch,secondNode,first,second,third,score,thirdTotal,lineById,requiredConditions);
          const conflict=stateConflict(node);
          if(conflict){
            generationEvents.push({stage:"THIRD",branchId:branch.id,branchLabel:branch.label,order:[first.number,second.number,third.number],action:"EXCLUDED",reasonGroup:"RULE_IMPOSSIBLE",reasonCode:"PARENT_STATE_CONTRADICTION",reason:conflict});
            continue;
          }
          thirdStageEntries.push({third,requiredConditions,score,node});
        }
        const bestThirdConditional=Math.max(...thirdStageEntries.map(item=>Number(item.node?.conditionalProbability)||0),0);

        for(const {third,requiredConditions,score:thirdScore,node:thirdNode} of thirdStageEntries){
          const thirdDifferential=buildDifferentialCondition({stage:"THIRD",value:Number(thirdNode?.conditionalProbability)||0,bestValue:bestThirdConditional,label:`${third.number}番3着`});
          const basePathScore=firstScore*secondScore*thirdScore;
          const relativeConditionTrace=[branchDifferential,firstDifferential,secondDifferential,thirdDifferential];
          const relativeConditionCount=relativeConditionTrace.reduce((total,row)=>total+(Number(row.count)||0),0);
          const relativeConditionPenalty=relativeConditionTrace.reduce((product,row)=>product*(Number(row.factor)||1),1);
          const pathScore=basePathScore*relativeConditionPenalty;
          if(!branchPathCompatible(branch,first,second,third)){
            generationEvents.push({stage:"PATH",branchId:branch.id,branchLabel:branch.label,order:[first.number,second.number,third.number],action:"EXCLUDED",reasonGroup:"RULE_IMPOSSIBLE",reasonCode:"BRANCH_PATH_INCOMPATIBLE",reason:"展開枝の役割条件と着順経路が両立しない"});
            continue;
          }
          paths.push({
            order:[first.number,second.number,third.number],
            branchId:branch.id,
            branchLabel:branch.label,
            branchPriority:branch.priority,
            branchType:branch.branchType,
            primaryLineId:branch.primaryLineId||null,
            requiredFirstNumber:branch.requiredFirstNumber??null,
            branchScore:branch.score,
            basePathScore,
            pathScore,
            relativeConditionCount,
            relativeConditionPenalty,
            relativeConditionTrace,
            probabilitySeparationPolicy:"BASE_PROBABILITY_FIRST_PLUS_LIGHT_DIFFERENTIAL_CONDITION_V1",
            nodeConditionalProbability:firstNode.conditionalProbability*secondNode.conditionalProbability*thirdNode.conditionalProbability,
            decisionRatios:{
              first:bestFirst>0?firstScore/bestFirst:0,
              second:bestSecond>0?secondScore/bestSecond:0,
              third:bestThird>0?thirdScore/bestThird:0
            },
            nodeTrace:[firstNode,secondNode,thirdNode],
            positionScores:{first:firstScore,second:secondScore,third:thirdScore},
            positionEvidence:{first:positionEvidence(branch,first,"first"),second:positionEvidence(branch,second,"second"),third:positionEvidence(branch,third,"third")},
            holdReason:"親状態を継承し、1ノード1事象で1着→2着→3着を条件付き再評価"
          });
        }
      }
    }

    const branchPathTotal=paths.reduce((sum,path)=>sum+path.pathScore,0);
    if(!(branchPathTotal>0))continue;
    for(const path of paths){
      raw.push({...path,weightedScore:branch.score*branchDifferential.factor*(path.pathScore/branchPathTotal)});
    }
  }

  const map=new Map();
  for(const terminal of raw){
    const key=terminal.order.join("-");
    const contribution={
      branchId:terminal.branchId,
      branchLabel:terminal.branchLabel,
      branchPriority:terminal.branchPriority,
      branchType:terminal.branchType,
      primaryLineId:terminal.primaryLineId||null,
      requiredFirstNumber:terminal.requiredFirstNumber??null,
      branchScore:terminal.branchScore,
      weightedScore:terminal.weightedScore,
      basePathScore:terminal.basePathScore,
      pathScore:terminal.pathScore,
      relativeConditionCount:terminal.relativeConditionCount??0,
      relativeConditionPenalty:terminal.relativeConditionPenalty??1,
      relativeConditionTrace:terminal.relativeConditionTrace||[],
      probabilitySeparationPolicy:terminal.probabilitySeparationPolicy||null,
      positionScores:terminal.positionScores,
      positionEvidence:terminal.positionEvidence,
      decisionRatios:terminal.decisionRatios,
      nodeConditionalProbability:terminal.nodeConditionalProbability,
      nodeTrace:terminal.nodeTrace
    };
    const existing=map.get(key);
    if(!existing){
      map.set(key,{
        order:terminal.order,
        score:terminal.weightedScore,
        branchId:terminal.branchId,
        branchLabel:terminal.branchLabel,
        branchPriority:terminal.branchPriority,
        branchType:terminal.branchType,
        holdReason:terminal.holdReason,
        contributingBranches:[terminal.branchId],
        branchContributions:[contribution]
      });
    }else{
      generationEvents.push({stage:"MERGE",branchId:terminal.branchId,branchLabel:terminal.branchLabel,order:terminal.order,action:"MERGED",reasonGroup:"DUPLICATE",reasonCode:"DUPLICATE_TERMINAL_MERGED",reason:"同一3連単終端を削除せず、別展開枝の寄与として統合"});
      existing.score+=terminal.weightedScore;
      existing.contributingBranches=[...new Set([...existing.contributingBranches,terminal.branchId])];
      existing.branchContributions.push(contribution);
    }
  }

  const terminals=[...map.values()];
  const total=terminals.reduce((sum,item)=>sum+item.score,0)||1;
  for(const terminal of terminals){
    terminal.probability=terminal.score/total;
    terminal.branchContributions=terminal.branchContributions
      .map(item=>({...item,probability:item.weightedScore/total}))
      .sort((a,b)=>b.probability-a.probability||a.branchId.localeCompare(b.branchId,"en"));
    const dominant=terminal.branchContributions[0];
    terminal.branchId=dominant?.branchId||terminal.branchId;
    terminal.branchLabel=dominant?.branchLabel||terminal.branchLabel;
    terminal.branchPriority=dominant?.branchPriority||terminal.branchPriority;
    terminal.branchType=dominant?.branchType||terminal.branchType;
    terminal.nodeTrace=dominant?.nodeTrace||[];
    terminal.nodeConditionalProbability=dominant?.nodeConditionalProbability??null;
    terminal.relativeConditionCount=dominant?.relativeConditionCount??0;
    terminal.relativeConditionPenalty=dominant?.relativeConditionPenalty??1;
    terminal.relativeConditionTrace=dominant?.relativeConditionTrace||[];
    terminal.probabilitySeparationPolicy=dominant?.probabilitySeparationPolicy||"BASE_PROBABILITY_FIRST_PLUS_LIGHT_DIFFERENTIAL_CONDITION_V1";
  }
  terminals.sort((a,b)=>(b.probability-a.probability)||a.order.join("-").localeCompare(b.order.join("-"),"en"));
  const excluded=generationEvents.filter(event=>event.action==="EXCLUDED");
  const merged=generationEvents.filter(event=>event.action==="MERGED");
  const allowedReasonGroups=new Set(["RULE_IMPOSSIBLE","DATA_CONTRADICTION","DUPLICATE"]);
  const unexplained=excluded.filter(event=>!allowedReasonGroups.has(event.reasonGroup)||!event.reasonCode||!event.reason);
  const nodeStateAudit=buildNodeStateAudit(raw);
  const secondCoverageMisses=secondReevaluationRows.filter(row=>!row.passed);
  const thirdCoverageMisses=thirdReevaluationRows.filter(row=>!row.passed);
  const mixedCoverageMisses=mixedLineThirdRows.filter(row=>!row.passed);
  const thirdDedicatedAudit={
    version:"THIRD-DEDICATED-GENERATION-1.0",
    policy:"GENERATE_ALL_REMAINING_THIRD_CONDITIONS_BEFORE_SCORE_AND_PROBABILITY",
    pairCount:thirdDedicatedGenerationRows.length,
    missingCandidatePairCount:thirdDedicatedGenerationRows.filter(row=>!row.passed).length,
    scoreBasedGenerationPruningCount:thirdDedicatedGenerationRows.filter(row=>row.scoreBasedGenerationPruningApplied===true).length,
    allConditionsGeneratedBeforeProbability:thirdDedicatedGenerationRows.every(row=>row.probabilityAssignedAfterConditionGeneration===true),
    rows:thirdDedicatedGenerationRows,
    passed:thirdDedicatedGenerationRows.every(row=>row.passed&&row.scoreBasedGenerationPruningApplied===false&&row.probabilityAssignedAfterConditionGeneration===true)
  };
  const positionTerminalConnectionAudit=buildPositionTerminalConnectionAudit({
    scored,branches,placementEvaluationRows,secondReevaluationRows,thirdReevaluationRows,raw,terminals
  });
  const reevaluationCoverageAudit={
    version:"REEVALUATION-COVERAGE-1.2-POSITION-TERMINAL-CONNECTED",
    policy:"POSITION_SPECIFIC_EVALUATION_FEEDS_EVERY_CHILD_THEN_COMPLETE_TERMINALS_BEFORE_FINAL_PROBABILITY",
    secondBranchCount:secondReevaluationRows.length,
    thirdPairCount:thirdReevaluationRows.length,
    secondCoverageMissCount:secondCoverageMisses.length,
    thirdCoverageMissCount:thirdCoverageMisses.length,
    mixedLineThirdCoverageMissCount:mixedCoverageMisses.length,
    secondRows:secondReevaluationRows,
    thirdRows:thirdReevaluationRows,
    mixedLineThirdRows,
    thirdDedicatedAudit,
    positionTerminalConnectionAudit,
    passed:secondCoverageMisses.length===0&&thirdCoverageMisses.length===0&&mixedCoverageMisses.length===0&&thirdDedicatedAudit.passed&&positionTerminalConnectionAudit.passed
  };
  Object.defineProperty(terminals,"generationAudit",{value:{
    policy:"ONE_NODE_ONE_EVENT_PLUS_DEDICATED_THIRD_CONDITION_GENERATION_BEFORE_PROBABILITY_PLUS_LIGHT_DIFFERENTIAL_CONDITION_SEPARATION",
    probabilitySeparationPolicy:"BASE_PROBABILITY_FIRST_PLUS_LIGHT_DIFFERENTIAL_CONDITION_V1",
    allowedExclusionReasonGroups:[...allowedReasonGroups],
    generatedUniqueTerminalCount:terminals.length,
    rawSupportedPathCount:raw.length,
    excludedCount:excluded.length,
    mergedDuplicateCount:merged.length,
    unexplainedExclusionCount:unexplained.length,
    nodeStateAudit,
    reevaluationCoverageAudit,
    positionTerminalConnectionAudit,
    passed:unexplained.length===0&&nodeStateAudit.passed&&reevaluationCoverageAudit.passed&&positionTerminalConnectionAudit.passed,
    events:generationEvents
  },enumerable:false});
  return terminals;
}

function buildFirstNode(branch,first,score,total){
  const event={type:"FINISH_POSITION",participantNumber:first.number,position:1,label:`${first.number}番が1着`};
  const required=firstConditions(branch,first);
  return{
    stage:"FIRST",
    event,
    inheritedState:{events:[],conditions:[],facts:{}},
    newRequiredConditions:required,
    resultingState:buildWorldState({events:[],conditions:[],facts:{}},event,required,{winner:first.number,branchType:branch.branchType,primaryLineId:branch.primaryLineId||null}).state,
    worldFactConflicts:buildWorldState({events:[],conditions:[],facts:{}},event,required,{winner:first.number,branchType:branch.branchType,primaryLineId:branch.primaryLineId||null}).conflicts,
    score,
    conditionalProbability:nodeConditionalProbability(score,total,required)
  };
}
function buildSecondNode(branch,parent,first,second,score,total,lineById){
  const event={type:"FINISH_POSITION",participantNumber:second.number,position:2,label:`${second.number}番が2着`};
  const required=secondConditions(branch,first,second,lineById);
  return{
    stage:"SECOND",
    event,
    inheritedState:cloneState(parent.resultingState),
    newRequiredConditions:required,
    resultingState:buildWorldState(parent.resultingState,event,required,{second:second.number}).state,
    worldFactConflicts:buildWorldState(parent.resultingState,event,required,{second:second.number}).conflicts,
    score,
    conditionalProbability:nodeConditionalProbability(score,total,required)
  };
}
function generateThirdCandidates({branch,first,second,scored,lineById}){
  return (Array.isArray(scored)?scored:[])
    .filter(third=>third.id!==first.id&&third.id!==second.id)
    .map(third=>({
      third,
      requiredConditions:thirdConditions(branch,first,second,third,lineById),
      generatedBeforeProbability:true
    }));
}
function buildThirdNode(branch,parent,first,second,third,score,total,lineById,preGeneratedConditions=null){
  const event={type:"FINISH_POSITION",participantNumber:third.number,position:3,label:`${third.number}番が3着`};
  const required=Array.isArray(preGeneratedConditions)?preGeneratedConditions:thirdConditions(branch,first,second,third,lineById);
  return{
    stage:"THIRD",
    event,
    inheritedState:cloneState(parent.resultingState),
    newRequiredConditions:required,
    resultingState:buildWorldState(parent.resultingState,event,required,{third:third.number}).state,
    worldFactConflicts:buildWorldState(parent.resultingState,event,required,{third:third.number}).conflicts,
    score,
    conditionalProbability:nodeConditionalProbability(score,total,required)
  };
}
function firstConditions(branch,first){
  if(branch.branchType==="LEADER_HOLD")return[
    condition(`LEADER_HOLD_${first.number}`,`${first.number}番が主導権を取れる`,"natural",.78,true,{sets:{initiativeLine:branch.primaryLineId||first.lineId||null,leadRider:first.number}}),
    condition(`LEADER_FINISH_${first.number}`,`${first.number}番が先行後も1着まで脚を残せる`,"natural",.72,true,{requires:{leadRider:first.number},sets:{winnerMechanism:"LEADER_HOLD"}})
  ];
  if(branch.branchType==="MAKURI_SUCCESS")return[
    condition(`MAKURI_POSITION_${first.number}`,`${first.number}番が捲りを打てる位置とタイミングを確保する`,"natural",.72,true,{sets:{attackLine:branch.primaryLineId||first.lineId||null,attacker:first.number}}),
    condition(`MAKURI_REACH_${first.number}`,`${first.number}番の捲りが前団を越えて1着まで届く`,"natural",.68,true,{requires:{attacker:first.number},sets:{winnerMechanism:"MAKURI_SUCCESS"}})
  ];
  if(branch.branchType==="BANTE_SASHI")return[
    condition(`BANTE_TRACK_${first.number}`,`${first.number}番が前を追走して番手位置を維持する`,"natural",.84,true,{sets:{trackedLine:branch.primaryLineId||first.lineId||null,trackedRider:first.number}}),
    condition(`BANTE_PASS_${first.number}`,`${first.number}番が直線で前を交わして1着になる`,"natural",.70,true,{requires:{trackedRider:first.number},sets:{winnerMechanism:"BANTE_SASHI"}})
  ];
  if(branch.branchType==="LINE_SEPARATION")return[
    condition(`SEPARATION_OCCURRED_${first.number}`,`前位の追走崩れ・離れが発生し${first.number}番に進路が生まれる`,"extra",.42,true,{sets:{separationOccurred:true}}),
    condition(`SEPARATION_USE_${first.number}`,`${first.number}番がその空いた位置を使って1着まで到達する`,"extra",.48,true,{requires:{separationOccurred:true},sets:{winnerMechanism:"LINE_SEPARATION"}})
  ];
  return[
    condition(`BRANCH_${branch.id}`,`${branch.label||branch.id}が${first.number}番1着まで成立する`,"scenario",.60,true)
  ];
}
function secondConditions(branch,first,second,lineById){
  const relation=lineRelation(first,second,lineById);
  const same=relation==="SAME";
  const mechanism=relation==="UNKNOWN"?{key:"unresolvedPosition",id:"UNRESOLVED_POSITION",label:"並び未取得での位置残り"}:selectSecondMechanism(branch,first,second,same);
  const score=mechanismScore(second,"second",mechanism.key);
  if(same){
    return[condition(`SECOND_MECHANISM_${mechanism.id}_${second.number}`,`${second.number}番が${mechanism.label}で、1着成立状態を壊さず2着へ残る`,"natural",mechanismAdjustedProbability(.80,score),true,{sets:{secondMechanism:mechanism.key},mechanism:{stage:"SECOND",key:mechanism.key,label:mechanism.label,score,baseProbability:.80}})];
  }
  if(relation==="UNKNOWN"){
    return[condition(`SECOND_MECHANISM_${mechanism.id}_${second.number}`,`${second.number}番を並び関係未確定のまま独立評価し、2着へ残る`,"uncertain",mechanismAdjustedProbability(.62,score),true,{sets:{secondMechanism:mechanism.key},mechanism:{stage:"SECOND",key:mechanism.key,label:mechanism.label,score,baseProbability:.62}})];
  }
  return[condition(`SECOND_MECHANISM_${mechanism.id}_${second.number}`,`${second.number}番が${mechanism.label}で、1着成立状態と両立したまま2着へ浮上・残存する`,"extra",mechanismAdjustedProbability(.52,score),true,{sets:{secondMechanism:mechanism.key},mechanism:{stage:"SECOND",key:mechanism.key,label:mechanism.label,score,baseProbability:.52}})];
}
function thirdConditions(branch,first,second,third,lineById){
  const relationFirst=lineRelation(first,third,lineById),relationSecond=lineRelation(second,third,lineById);
  const sameFirst=relationFirst==="SAME",sameSecond=relationSecond==="SAME",same=sameFirst||sameSecond;
  const unresolved=!same&&(relationFirst==="UNKNOWN"||relationSecond==="UNKNOWN");
  const mechanism=unresolved?{key:"unresolvedPosition",id:"UNRESOLVED_POSITION",label:"並び未取得での位置残り"}:selectThirdMechanism(branch,first,second,third,{sameFirst,sameSecond,same});
  const score=mechanismScore(third,"third",mechanism.key);
  if(same){
    return[condition(`THIRD_MECHANISM_${mechanism.id}_${third.number}`,`${third.number}番が${mechanism.label}で、1・2着成立状態を壊さず3着へ残る`,"natural",mechanismAdjustedProbability(.78,score),true,{sets:{thirdMechanism:mechanism.key},mechanism:{stage:"THIRD",key:mechanism.key,label:mechanism.label,score,baseProbability:.78}})];
  }
  if(unresolved){
    return[condition(`THIRD_MECHANISM_${mechanism.id}_${third.number}`,`${third.number}番を並び関係未確定のまま独立評価し、3着へ残る`,"uncertain",mechanismAdjustedProbability(.64,score),true,{sets:{thirdMechanism:mechanism.key},mechanism:{stage:"THIRD",key:mechanism.key,label:mechanism.label,score,baseProbability:.64}})];
  }
  return[condition(`THIRD_MECHANISM_${mechanism.id}_${third.number}`,`${third.number}番が${mechanism.label}で、1・2着成立状態と両立したまま3着へ浮上・残存する`,"extra",mechanismAdjustedProbability(.56,score),true,{sets:{thirdMechanism:mechanism.key},mechanism:{stage:"THIRD",key:mechanism.key,label:mechanism.label,score,baseProbability:.56}})];
}
function selectSecondMechanism(branch,first,second,same){
  if(branch?.branchType==="BANTE_SASHI"&&same&&second?.role==="自力")
    return{key:"leaderRemain",id:"LEADER_REMAIN",label:"先行残り"};
  if(same)
    return{key:"lineFollower",id:"LINE_FOLLOWER",label:"追走残り"};
  return{key:"otherLineRemain",id:"OTHER_LINE_REMAIN",label:"別線残り"};
}
function selectThirdMechanism(branch,first,second,third,{sameFirst,sameSecond,same}={}){
  if(same&&third?.role==="三番手")
    return{key:"lineThird",id:"LINE_THIRD",label:"ライン3番手残り"};
  if(same)
    return{key:"positionRemain",id:"POSITION_REMAIN",label:"位置残り"};
  return{key:"otherLineRemain",id:"OTHER_LINE_REMAIN",label:"別線残り"};
}
function mechanismScore(participant,stage,key){
  const bucket=stage==="second"
    ?participant?.riderEvaluationV2?.secondMechanisms
    :participant?.riderEvaluationV2?.thirdMechanisms;
  const value=Number(bucket?.[key]);
  return Number.isFinite(value)?value:null;
}
function mechanismAdjustedProbability(baseProbability,score){
  const base=Number(baseProbability);
  if(!finiteProbability(base)||!Number.isFinite(Number(score)))return base;
  // riderEvaluationV2 is on a roughly 0-10 scale. 5 is neutral.
  // Use a narrow bounded adjustment so mechanism evidence can rank otherwise-similar
  // child nodes without turning a heuristic rider score into a direct probability.
  const centered=(Number(score)-5)/5;
  const factor=1+Math.max(-.12,Math.min(.12,centered*.12));
  return Math.max(.12,Math.min(.95,base*factor));
}

function condition(id,label,kind,probability=null,critical=false,worldFacts={}){
  const defaultProbability=kind==="natural"?.82:kind==="conditional"?.70:kind==="extra"?.48:kind==="scenario"?.62:kind==="event"?.88:.65;
  return{
    id,label,kind,
    probability:finiteProbability(probability)?Number(probability):defaultProbability,
    critical:Boolean(critical),
    requires:cleanFacts(worldFacts.requires),
    sets:cleanFacts(worldFacts.sets),
    forbids:cleanFacts(worldFacts.forbids),
    mechanism:worldFacts?.mechanism?{
      stage:worldFacts.mechanism.stage||null,
      key:worldFacts.mechanism.key||null,
      label:worldFacts.mechanism.label||null,
      score:Number.isFinite(Number(worldFacts.mechanism.score))?Number(worldFacts.mechanism.score):null,
      baseProbability:finiteProbability(worldFacts.mechanism.baseProbability)?Number(worldFacts.mechanism.baseProbability):null,
      adjustedProbability:finiteProbability(probability)?Number(probability):defaultProbability
    }:null
  };
}
function cleanFacts(obj){const out={};for(const[k,v]of Object.entries(obj||{}))if(v!==null&&v!==undefined&&v!=="")out[k]=v;return out}
export function auditWorldFactTransition(parentFacts={},conditions=[],eventFacts={}){
  const facts={...(parentFacts||{})},conflicts=[];
  for(const c of conditions||[]){
    for(const[k,v]of Object.entries(c?.requires||{})){
      if(Object.prototype.hasOwnProperty.call(facts,k)&&facts[k]!==v)conflicts.push(`${c.id||"condition"}: ${k}=${String(v)} が必要だが親状態は ${String(facts[k])}`);
    }
    for(const[k,v]of Object.entries(c?.forbids||{})){
      if(Object.prototype.hasOwnProperty.call(facts,k)&&facts[k]===v)conflicts.push(`${c.id||"condition"}: ${k}=${String(v)} は親状態と両立不可`);
    }
    for(const[k,v]of Object.entries(c?.sets||{})){
      if(Object.prototype.hasOwnProperty.call(facts,k)&&facts[k]!==v)conflicts.push(`${c.id||"condition"}: ${k}=${String(v)} は親状態 ${String(facts[k])} を破壊`);
      else facts[k]=v;
    }
  }
  for(const[k,v]of Object.entries(cleanFacts(eventFacts))){
    if(Object.prototype.hasOwnProperty.call(facts,k)&&facts[k]!==v)conflicts.push(`event: ${k}=${String(v)} は親状態 ${String(facts[k])} と矛盾`);
    else facts[k]=v;
  }
  return{facts,conflicts,passed:conflicts.length===0};
}
function buildWorldState(parent,event,conditions,eventFacts={}){
  const transition=auditWorldFactTransition(parent?.facts||{},conditions,eventFacts);
  return{state:{events:[...(parent?.events||[]),event],conditions:[...(parent?.conditions||[]),...(conditions||[])],facts:transition.facts},conflicts:transition.conflicts};
}
function buildDifferentialCondition({stage,value,bestValue,label}){
  const current=Math.max(0,Number(value)||0),best=Math.max(0,Number(bestValue)||0);
  const eps=Math.max(1e-12,best*1e-10);
  if(!(best>0)||best-current<=eps)return{stage,label,count:0,ratio:best>0?Math.min(1,current/best):1,gap:0,factor:1,penalty:0};
  const ratio=Math.max(0,Math.min(1,current/best));
  const gap=1-ratio;
  // The base probability/score difference remains the primary signal.
  // A lower-probability alternative gets one small extra burden so even a
  // microscopic edge is never rounded back into practical equality.
  const penalty=Math.min(.03,.008+gap*.022);
  return{stage,label,count:1,ratio,gap,factor:1-penalty,penalty};
}

function nodeConditionalProbability(score,total,requiredConditions=[]){
  const base=total>0?score/total:0;
  const conds=(requiredConditions||[]).filter(c=>c?.kind!=="event");
  if(!conds.length)return base;
  let burden=1;
  for(const c of conds){
    const p=finiteProbability(c?.probability)?Number(c.probability):.65;
    // Do not multiply raw probabilities directly: several conditions are dependent.
    // Penalize only the incremental burden of the newly introduced node conditions.
    const softness=c?.critical?1:.55;
    burden*=Math.pow(Math.max(.12,Math.min(.98,p)),softness);
  }
  return Math.max(0,Math.min(1,base*burden));
}
function finiteProbability(v){return Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=1}
function cloneState(state){return{events:(state?.events||[]).map(x=>({...x})),conditions:(state?.conditions||[]).map(x=>({...x})),facts:{...(state?.facts||{})}}}
function stateConflict(node){
  const world=node?.worldFactConflicts||[];if(world.length)return `世界状態矛盾: ${world[0]}`;
  const events=node?.resultingState?.events||[],positions=new Map(),participants=new Map();
  for(const event of events){
    if(event?.type!=="FINISH_POSITION")continue;
    const n=Number(event.participantNumber),p=Number(event.position);
    if(positions.has(p)&&positions.get(p)!==n)return `${p}着が複数選手に同時確定するため親状態と矛盾`;
    if(participants.has(n)&&participants.get(n)!==p)return `${n}番が複数着順に同時確定するため親状態と矛盾`;
    positions.set(p,n);participants.set(n,p);
  }
  return null;
}
function buildNodeStateAudit(raw){
  let violations=0,inheritanceViolationCount=0,oneNodeOneEventViolationCount=0;
  const examples=[];
  for(const path of raw){
    const nodes=path.nodeTrace||[];
    if(nodes.length!==3){violations++;oneNodeOneEventViolationCount++;examples.push({order:path.order,reason:"着順ノードが3段階揃っていない"});continue}
    for(let i=0;i<nodes.length;i++){
      const node=nodes[i];
      if(!node.event||Array.isArray(node.event)){violations++;oneNodeOneEventViolationCount++;examples.push({order:path.order,stage:node.stage,reason:"1ノード1事象違反"})}
      if(i>0){
        const parent=nodes[i-1].resultingState||{},inherited=node.inheritedState||{};
        if(JSON.stringify(parent)!==JSON.stringify(inherited)){
          violations++;inheritanceViolationCount++;examples.push({order:path.order,stage:node.stage,reason:"親状態の完全継承違反"})
        }
      }
      const conflict=stateConflict(node);
      if(conflict){violations++;examples.push({order:path.order,stage:node.stage,reason:conflict})}
    }
  }
  const conditionStats={FIRST:{nodes:0,newConditions:0,critical:0,extra:0},SECOND:{nodes:0,newConditions:0,critical:0,extra:0},THIRD:{nodes:0,newConditions:0,critical:0,extra:0}};
  for(const path of raw){
    for(const node of path.nodeTrace||[]){
      const row=conditionStats[node.stage];
      if(!row)continue;
      row.nodes++;
      for(const c of node.newRequiredConditions||[]){
        row.newConditions++;
        if(c.critical)row.critical++;
        if(c.kind==="extra")row.extra++;
      }
    }
  }
  return{
    version:"NODE-STATE-1.2-WORLD-FACT-CONTRADICTION",
    policy:"PARENT_STATE_INHERIT_PLUS_ONE_NEW_EVENT_PLUS_WORLD_FACTS",
    checkedPathCount:raw.length,
    violationCount:violations,
    inheritanceViolationCount,
    oneNodeOneEventViolationCount,
    conditionStats,
    passed:violations===0,
    examples:examples.slice(0,20)
  };
}

function branchFirstRoleCompatible(branch,participant){
  if(!branch?.primaryLineId)return true;
  const samePrimaryLine=participant.lineId===branch.primaryLineId;
  switch(branch.branchType){
    case"LEADER_HOLD":
    case"MAKURI_SUCCESS":
      return samePrimaryLine&&participant.role==="自力";
    case"BANTE_SASHI":
      return samePrimaryLine&&participant.role==="番手";
    default:
      return true;
  }
}

function branchPathCompatible(branch,first,second,third){
  if(!branchFirstRoleCompatible(branch,first))return false;
  if(branch.branchType==="BANTE_SASHI"&&branch.primaryLineId){
    // 番手差しの1着は必ず当該ラインの番手。2着は先行車を最優先するが、
    // 先行車失速時の三番手/別線残りは確率評価で保持する。
    if(first.role!=="番手"||first.lineId!==branch.primaryLineId)return false;
  }
  if((branch.branchType==="LEADER_HOLD"||branch.branchType==="MAKURI_SUCCESS")&&branch.primaryLineId){
    if(first.role!=="自力"||first.lineId!==branch.primaryLineId)return false;
  }
  return Boolean(second&&third);
}

function conditionedFirst(branch,participant){
  const placementScore=placementScoreOf(participant,"first");
  const candidate=branch.firstCandidateScores?.[participant.id]??placementScore;
  const e=participant.evidence||{};
  let branchAbility=placementScore;
  switch(branch.branchType){
    case"LEADER_HOLD": branchAbility=weightedAvailable([[participant.roleScores.first,.30],[e.start,.28],[e.stamina,.22],[e.recent,.12],[e.finish,.08]]); break;
    case"BANTE_SASHI": branchAbility=weightedAvailable([[participant.roleScores.first,.28],[e.finish,.30],[e.tracking,.22],[e.recent,.12],[e.lineTrust,.08]]); break;
    case"MAKURI_SUCCESS": branchAbility=weightedAvailable([[participant.roleScores.first,.28],[e.sprint,.34],[e.finish,.18],[e.recent,.12],[e.start,.08]]); break;
    case"LEAD_BATTLE": branchAbility=weightedAvailable([[participant.roleScores.first,.24],[e.finish,.28],[e.tracking,.20],[e.recent,.16],[e.stamina,.12]]); break;
    case"LINE_SEPARATION": branchAbility=weightedAvailable([[participant.roleScores.first,.24],[e.finish,.30],[e.tracking,.26],[e.recent,.12],[e.lineTrust,.08]]); break;
    case"SOLO_RISE": branchAbility=weightedAvailable([[participant.roleScores.first,.30],[e.finish,.28],[e.sprint,.22],[e.recent,.12],[e.tracking,.08]]); break;
  }
  return positive(.45*candidate+.55*branchAbility)*branchRoleFactor(branch,participant,"first");
}

function conditionedSecond(branch,first,second,lineById){
  const same=sameLine(first,second,lineById),role=second.role,e=second.evidence||{};
  let score=placementScoreOf(second,"second");
  let factor=1;
  switch(branch.branchType){
    case"LEADER_HOLD":
      score=weightedAvailable([[score,.28],[e.tracking,.30],[e.finish,.18],[e.lineTrust,.14],[e.recent,.10]]);
      if(same&&role==="番手")factor=1.55; else if(same&&role==="三番手")factor=1.18; else if(role==="番手")factor=1.04; else if(role==="自力")factor=.78;
      break;
    case"BANTE_SASHI":
      score=weightedAvailable([[score,.30],[e.stamina,.24],[e.recent,.18],[e.tracking,.16],[e.finish,.12]]);
      if(same&&role==="自力")factor=1.48; else if(same&&role==="三番手")factor=1.16; else if(role==="自力")factor=.98;
      break;
    case"MAKURI_SUCCESS":
      score=weightedAvailable([[score,.26],[e.tracking,.28],[e.sprint,.18],[e.finish,.16],[e.recent,.12]]);
      if(same&&role==="番手")factor=1.42; else if(same&&role==="三番手")factor=1.16; else if(!same&&role==="番手")factor=1.08; else if(role==="自力")factor=.82;
      break;
    case"LEAD_BATTLE":
      score=weightedAvailable([[score,.24],[e.finish,.28],[e.tracking,.24],[e.recent,.14],[e.stamina,.10]]);
      if(role==="番手")factor=1.30; else if(role==="三番手")factor=1.14; else if(role==="自力")factor=.72;
      break;
    case"LINE_SEPARATION":
      score=weightedAvailable([[score,.22],[e.tracking,.32],[e.finish,.24],[e.recent,.14],[e.lineTrust,.08]]);
      if(!same&&role==="番手")factor=1.30; else if(role==="単騎")factor=1.14; else if(same)factor=.72;
      break;
    case"SOLO_RISE":
      score=weightedAvailable([[score,.28],[e.finish,.26],[e.tracking,.22],[e.recent,.14],[e.sprint,.10]]);
      if(role==="番手")factor=1.12; else if(role==="自力")factor=.88;
      break;
  }
  return positive(score)*factor;
}

function conditionedThird(branch,first,second,third,lineById){
  const sameFirst=sameLine(first,third,lineById),sameSecond=sameLine(second,third,lineById),role=third.role,e=third.evidence||{};
  let score=placementScoreOf(third,"third");
  let factor=1;
  switch(branch.branchType){
    case"LEADER_HOLD":
      score=weightedAvailable([[score,.26],[e.tracking,.34],[e.stamina,.16],[e.recent,.14],[e.finish,.10]]);
      if(sameFirst&&role==="三番手")factor=1.42; else if(sameFirst&&role==="番手")factor=1.18; else if(!sameFirst&&(role==="番手"||role==="三番手"))factor=1.08; else if(role==="自力")factor=.84;
      break;
    case"BANTE_SASHI":
      score=weightedAvailable([[score,.26],[e.tracking,.32],[e.stamina,.18],[e.recent,.14],[e.finish,.10]]);
      if(sameFirst&&role==="三番手")factor=1.38; else if(sameFirst&&role==="自力")factor=1.22; else if(role==="番手"||role==="三番手")factor=1.06;
      break;
    case"MAKURI_SUCCESS":
      score=weightedAvailable([[score,.24],[e.tracking,.30],[e.finish,.20],[e.recent,.14],[e.stamina,.12]]);
      if(sameFirst&&role==="三番手")factor=1.32; else if(sameFirst&&role==="番手")factor=1.26; else if(!sameFirst&&role==="番手")factor=1.12; else if(role==="自力")factor=.86;
      break;
    case"LEAD_BATTLE":
      score=weightedAvailable([[score,.22],[e.tracking,.34],[e.finish,.22],[e.recent,.12],[e.stamina,.10]]);
      if(role==="三番手")factor=1.28; else if(role==="番手")factor=1.20; else if(role==="自力")factor=.72;
      break;
    case"LINE_SEPARATION":
      score=weightedAvailable([[score,.22],[e.tracking,.36],[e.finish,.22],[e.recent,.12],[e.lineTrust,.08]]);
      if(!sameFirst&&!sameSecond&&(role==="番手"||role==="単騎"))factor=1.24; else if(sameFirst)factor=.74;
      break;
    case"SOLO_RISE":
      score=weightedAvailable([[score,.26],[e.tracking,.34],[e.finish,.18],[e.recent,.14],[e.stamina,.08]]);
      if(role==="番手"||role==="三番手")factor=1.12; else if(role==="自力")factor=.88;
      break;
  }
  return positive(score)*factor;
}

function placementScoreOf(participant,stage){
  const explicit=Number(participant?.riderEvaluationV2?.placementScores?.[stage]);
  if(Number.isFinite(explicit))return explicit;
  const legacy=Number(participant?.roleScores?.[stage]);
  return Number.isFinite(legacy)?legacy:5;
}
function buildPlacementEvaluationRow({stage,branch,participant,score,orderPrefix=[]}){
  const key=String(stage||"").toLowerCase();
  const evalv=participant?.riderEvaluationV2||{};
  return{
    stage,branchId:branch?.id||null,branchLabel:branch?.label||null,orderPrefix:[...(orderPrefix||[])],
    number:Number(participant?.number),
    rawAbilityScore:Number.isFinite(Number(evalv?.rawAbilityPlacementScores?.[key]))?Number(evalv.rawAbilityPlacementScores[key]):null,
    contextPriorScore:Number.isFinite(Number(evalv?.contextPriorScores?.[key]))?Number(evalv.contextPriorScores[key]):null,
    finalPlacementScore:Number.isFinite(Number(evalv?.placementScores?.[key]))?Number(evalv.placementScores[key]):placementScoreOf(participant,key),
    conditionedStageScore:Number(score),
    inputSource:"RIDER_EVAL_V3_PLACEMENT_SCORES",
    scorePruned:false
  };
}
function buildPositionTerminalConnectionAudit({scored=[],branches=[],placementEvaluationRows=[],secondReevaluationRows=[],thirdReevaluationRows=[],raw=[],terminals=[]}={}){
  const missingInputRows=placementEvaluationRows.filter(row=>!Number.isFinite(row.finalPlacementScore)||!Number.isFinite(row.conditionedStageScore));
  const scorePrunedRows=placementEvaluationRows.filter(row=>row.scorePruned===true);
  const secondMisses=secondReevaluationRows.filter(row=>!row.passed);
  const thirdMisses=thirdReevaluationRows.filter(row=>!row.passed);
  const rawOrders=new Set(raw.map(row=>(row.order||[]).join("-")));
  const terminalOrders=new Set(terminals.map(row=>(row.order||[]).join("-")));
  const mergeOnlyMissing=[...rawOrders].filter(order=>!terminalOrders.has(order));
  return{
    version:"POSITION-TERMINAL-CONNECTION-1.0",
    policy:"ABILITY_AND_CONTEXT_STAY_SEPARATE_THROUGH_POSITION_EVAL_ALL_SECOND_ALL_THIRD_NO_SCORE_PRUNE_FINAL_TERMINAL_PROBABILITY_AFTER_COMPLETION",
    riderCount:scored.length,branchCount:branches.length,evaluationRowCount:placementEvaluationRows.length,
    stageCounts:{
      first:placementEvaluationRows.filter(row=>row.stage==="FIRST").length,
      second:placementEvaluationRows.filter(row=>row.stage==="SECOND").length,
      third:placementEvaluationRows.filter(row=>row.stage==="THIRD").length
    },
    missingPlacementInputCount:missingInputRows.length,scoreBasedPruningCount:scorePrunedRows.length,
    secondCoverageMissCount:secondMisses.length,thirdCoverageMissCount:thirdMisses.length,
    completedRawPathCount:raw.length,uniqueTerminalCount:terminals.length,rawOrderMissingAfterMergeCount:mergeOnlyMissing.length,
    terminalProbabilityAssignedAfterPathCompletion:true,
    rows:placementEvaluationRows,
    passed:missingInputRows.length===0&&scorePrunedRows.length===0&&secondMisses.length===0&&thirdMisses.length===0&&mergeOnlyMissing.length===0&&terminals.every(row=>Number.isFinite(Number(row.probability)))
  };
}

function positionEvidence(branch,participant,target){
  const e=participant.evidence||{};
  const values={recentForm:e.recent??null,startPower:e.start??null,sprintPower:e.sprint??null,finishPower:e.finish??null,trackingSkill:e.tracking??null,roleScore:participant.roleScores?.[target]??null};
  const keys=branchKeys(branch.branchType,target);
  return {number:participant.number,id:participant.id,role:participant.role,target,roleScore:values.roleScore,drivers:keys.map(key=>({key,value:values[key],missing:values[key]===null||values[key]===undefined||values[key]===""||!Number.isFinite(Number(values[key]))})).sort((a,b)=>(Number.isFinite(Number(b.value))?Number(b.value):-1)-(Number.isFinite(Number(a.value))?Number(a.value):-1)||a.key.localeCompare(b.key,"en"))};
}
function branchKeys(type,target){
  if(target==="first"){
    if(type==="LEADER_HOLD")return["startPower","recentForm","finishPower","roleScore"];
    if(type==="BANTE_SASHI")return["finishPower","trackingSkill","recentForm","roleScore"];
    if(type==="MAKURI_SUCCESS")return["sprintPower","finishPower","recentForm","roleScore"];
    return["finishPower","trackingSkill","recentForm","roleScore"];
  }
  if(target==="second")return["trackingSkill","finishPower","recentForm","roleScore"];
  return["trackingSkill","finishPower","recentForm","roleScore"];
}

function branchRoleFactor(branch,participant,target){
  if(target!=="first")return 1;
  if(branch.branchType==="LEAD_BATTLE"){
    if(participant.role==="番手")return 1.08;
    if(participant.role==="自力")return .90;
  }
  if(branch.branchType==="LINE_SEPARATION"&&participant.role==="番手")return 1.12;
  return 1;
}
function lineRelation(a,b,lineById){
  const la=lineById.get(a.id),lb=lineById.get(b.id);
  if(!la||!lb||String(la).startsWith("unknown-")||String(lb).startsWith("unknown-"))return"UNKNOWN";
  return la===lb?"SAME":"DIFFERENT";
}
function sameLine(a,b,lineById){return lineRelation(a,b,lineById)==="SAME"}
function weightedAvailable(items){const valid=items.filter(([value,weight])=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value))&&weight>0);const total=valid.reduce((sum,[,weight])=>sum+weight,0);return total>0?valid.reduce((sum,[value,weight])=>sum+Number(value)*weight,0)/total:5}
function positive(value){return Math.max(.05,Number(value)||0)}
