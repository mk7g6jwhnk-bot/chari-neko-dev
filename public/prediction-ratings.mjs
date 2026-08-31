export function derivePredictionRatings(snapshot={}){
  const purchaseEligibility=snapshot?.purchaseEligibility||snapshot?.predictionOutput?.purchaseEligibility||null;
  const displayInputs=snapshot?.predictionOutput?.displayRatingInputs||null;
  const audit=snapshot?.predictionOutput?.audit||{};
  const branchAudit=audit.branchSelectionAudit||{};
  const rows=normalizeBranchRows(branchAudit,snapshot?.branches||[]);
  const top=rows[0]||null,second=rows[1]||null;
  const topShare=top?.share??0;
  const top3Share=rows.slice(0,3).reduce((sum,row)=>sum+(row.share||0),0);
  const topGapRatio=top?.score>0&&second?Math.max(0,(top.score-second.score)/top.score):(top?.score>0?1:0);
  const cutGap=Number(branchAudit?.tiering?.contenderCutGap);
  const cutGapRatio=top?.score>0&&Number.isFinite(cutGap)?Math.max(0,cutGap/top.score):0;

  const bets=Array.isArray(snapshot?.betSelections)?snapshot.betSelections:[];
  const betCount=bets.length;
  const massAudit=audit?.purchaseMassAudit||{};
  const eligibleCoverage=finiteOrNull(massAudit?.eligibleCoverage);
  const weightedCoverageTarget=finiteOrNull(massAudit?.weightedCoverageTarget);
  const massEfficiency=finiteOrNull(massAudit?.massEfficiency);
  const massStatus=String(displayInputs?.massStatus??massAudit?.status??"");
  const coverageTargetRatio=eligibleCoverage!=null&&weightedCoverageTarget>0?Math.max(0,Math.min(1,eligibleCoverage/weightedCoverageTarget)):null;
  const purchaseStructureQuality=[coverageTargetRatio,massEfficiency].filter(Number.isFinite);
  const purchaseQuality=purchaseStructureQuality.length?purchaseStructureQuality.reduce((a,b)=>a+b,0)/purchaseStructureQuality.length:.65;

  const probabilitySum=positiveOrNull(audit.terminalProbabilitySum);
  const terminalTop3Share=normalizedMass(audit.top3Mass,probabilitySum);
  const terminalTop5Share=normalizedMass(audit.top5Mass,probabilitySum);
  const familySummary=normalizeFamilyConcentrationSummary(
    displayInputs?.familyConcentration,
    bets,
    probabilitySum
  );
  const familyRows=Array.isArray(audit?.purchaseFamilyAudit?.rows)?audit.purchaseFamilyAudit.rows:[];
  const familyShares=familySummary.familyCount>0
    ?familySummary.familyShares
    :familyRows
      .map(row=>probabilitySum?Math.max(0,Number(row?.probability)||0)/probabilitySum:0)
      .filter(value=>value>0)
      .sort((a,b)=>b-a);
  const topFamilyShare=familyShares[0]||0;
  const top2FamilyShare=(familyShares[0]||0)+(familyShares[1]||0);
  const topFamilyRow=[...familyRows].sort((a,b)=>{
    const ap=probabilitySum?Math.max(0,Number(a?.probability)||0)/probabilitySum:0;
    const bp=probabilitySum?Math.max(0,Number(b?.probability)||0)/probabilitySum:0;
    return bp-ap;
  })[0]||null;
  const topFamilyCoverage=topFamilyRow?(Number.isFinite(Number(topFamilyRow?.adoptedCoverage))?Number(topFamilyRow.adoptedCoverage):(Number(topFamilyRow?.probability)>0?(Number(topFamilyRow?.adoptedProbability)||0)/Number(topFamilyRow.probability):null)):null;

  const computedBranchConcentrationRaw=
    .34*scale(topShare,.07,.22)+
    .28*scale(top3Share,.22,.55)+
    .18*scale(topGapRatio,0,.18)+
    .20*scale(cutGapRatio,0,.25);

  const branchConcentrationRaw=finiteOrNull(displayInputs?.branchConcentrationRaw)??computedBranchConcentrationRaw;
  const hasTerminalStructure=terminalTop3Share>0||terminalTop5Share>0||topFamilyShare>0;
  const computedTerminalConcentrationRaw=hasTerminalStructure?(
    .30*scale(topFamilyShare,.25,.58)+
    .18*scale(top2FamilyShare,.48,.82)+
    .22*scale(terminalTop3Share,.08,.28)+
    .18*scale(terminalTop5Share,.14,.42)+
    .12*purchaseQuality
  ):branchConcentrationRaw;
  const terminalConcentrationRaw=finiteOrNull(displayInputs?.terminalConcentrationRaw)??computedTerminalConcentrationRaw;

  const concentrationRaw=.46*branchConcentrationRaw+.54*terminalConcentrationRaw;
  const rawConcentration=starsFrom(concentrationRaw,[.20,.38,.58,.78]);
  const consistencyAdjustments=[];
  let concentration=rawConcentration;

  // 買い目点数そのものは集中度の根拠にしない。
  // 展開・終端確率・ファミリー構造・購入質量の実データだけで評価する。
  if(topShare>0&&topShare<.10&&concentration>2){
    consistencyAdjustments.push(`展開1位${formatPct(topShare)}のため展開集中度を${concentration}→2へ上限補正`);
    concentration=2;
  }else if(topShare>0&&topShare<.14&&concentration>3){
    consistencyAdjustments.push(`展開1位${formatPct(topShare)}のため展開集中度を${concentration}→3へ上限補正`);
    concentration=3;
  }
  if(topFamilyShare>0&&topFamilyShare<.32&&concentration>3){
    consistencyAdjustments.push(`1着最上位ファミリー${formatPct(topFamilyShare)}のため展開集中度を${concentration}→3へ上限補正`);
    concentration=3;
  }

  const lineConfidence=String(snapshot?.predictionOutput?.lineConfidence||snapshot?.lineConfidence||"");
  const isGirls=snapshot?.targetRace?.raceCategory==="girls"||snapshot?.predictionOutput?.lineMode==="girls_dynamic";
  const evidenceQuality=startPowerEvidenceQuality(snapshot?.abilitiesUsed||[]);
  const lineQuality=isGirls?evidenceQuality:(lineConfidence==="高"?1:lineConfidence==="中"?.65:lineConfidence==="低"?.35:.70);
  const dataQuality=.55*lineQuality+.45*evidenceQuality;
  const concentrationNorm=concentration/5;
  const confidenceRaw=.42*concentrationNorm+.33*dataQuality+.25*purchaseQuality;
  const rawConfidence=starsFrom(confidenceRaw,[.30,.48,.64,.80]);
  let confidence=rawConfidence;

  // 信頼度は「データが良い」だけで4〜5にしない。
  // 集中度を越えて高評価にならないよう整合監査を入れる。
  const concentrationConfidenceCap=Math.min(5,concentration+1);
  if(confidence>concentrationConfidenceCap){
    consistencyAdjustments.push(`展開集中度${concentration}に合わせ信頼度を${confidence}→${concentrationConfidenceCap}へ上限補正`);
    confidence=concentrationConfidenceCap;
  }
  if(!isGirls&&lineConfidence&&lineConfidence!=="高"&&confidence>2){
    consistencyAdjustments.push(`ライン確度${lineConfidence}のため信頼度を${confidence}→2へ上限補正`);
    confidence=2;
  }
  if(snapshot?.noBet)confidence=1;

  const adoptedAudit=Array.isArray(audit?.adoptedTerminalAudit)?audit.adoptedTerminalAudit:[];
  const availableValueRows=adoptedAudit
    .map(item=>Number(item?.expectedValueIndex??item?.valueIndex))
    .filter(value=>Number.isFinite(value)&&value>0);
  const inputOdds=displayInputs?.oddsEvaluation||null;
  const maxExpectedValue=finiteOrNull(inputOdds?.maxExpectedValueIndex)??(availableValueRows.length?Math.max(...availableValueRows):null);
  const allOddsEvaluated=typeof inputOdds?.allOddsEvaluated==="boolean"?inputOdds.allOddsEvaluated:betCount>0&&adoptedAudit.length>=betCount&&availableValueRows.length===betCount;

  let provisionalVerdict;
  if(snapshot?.noBet||purchaseEligibility?.canPurchase===false||betCount===0)provisionalVerdict={label:"見送り",tone:"stop",reason:"purchaseEligibilityが購入停止"};
  else if(concentration===1||confidence===1)provisionalVerdict={label:"注意",tone:"caution",reason:"購入停止ではないが、予想の集中または信頼が低い"};
  else if(allOddsEvaluated&&maxExpectedValue!=null&&maxExpectedValue<1)provisionalVerdict={label:"妙味なし",tone:"caution",reason:"採用候補の確率×オッズが全て損益分岐未満"};
  else if(["UNDER_COVERED","INEFFICIENT","OVER_SPREAD"].includes(massStatus))provisionalVerdict={label:"注意",tone:"caution",reason:`購入停止ではないが、購入質量監査が${massStatus}`};
  else if(concentration<=2||confidence<=2)provisionalVerdict={label:"注意",tone:"caution",reason:"購入停止ではないが、予想集中または入力信頼が低い"};
  else provisionalVerdict={label:"購入可",tone:"go",reason:"評価整合条件を満たす"};

  let rollover,rolloverRaw;
  if(provisionalVerdict.tone==="stop"){rollover=1;rolloverRaw=.10;}
  else{
    rolloverRaw=.42*(confidence/5)+.38*(concentration/5)+.20*purchaseQuality;
    rollover=starsFrom(rolloverRaw,[.40,.58,.72,.88]);
    rollover=Math.min(rollover,confidence,concentration);
  }

  const confidenceContinuousCap=confidence<=1?.29:confidence===2?.47:confidence===3?.63:confidence===4?.79:1;
  const effectiveConfidence=Math.min(confidenceRaw,confidenceContinuousCap);
  const rawEvaluationIndex=Math.max(0,Math.min(100,100*(.40*confidenceRaw+.35*concentrationRaw+.25*(rolloverRaw??.10))));
  const confidenceAdjustedEvaluationIndex=Math.max(0,Math.min(100,100*(.40*effectiveConfidence+.35*concentrationRaw+.25*(rolloverRaw??.10))));
  let verdictCappedEvaluationIndex=confidenceAdjustedEvaluationIndex;
  if(provisionalVerdict.tone==="stop")verdictCappedEvaluationIndex=Math.min(verdictCappedEvaluationIndex,35);
  else if(provisionalVerdict.tone==="caution")verdictCappedEvaluationIndex=Math.min(verdictCappedEvaluationIndex,65);
  const evaluationIndex=verdictCappedEvaluationIndex;

  const invariantChecks=[
    {id:"BET_COUNT_NOT_DIRECT_SKIP_FACTOR",passed:true,label:"買い目点数だけで見送り・信頼度・集中度を下げない"},
    {id:"REFERENCE_PLAN_STAYS_SKIP",passed:!snapshot?.noBet||provisionalVerdict.tone==="stop",label:"参考買い目/noBetは購入可へ昇格させない"},
    {id:"HIGH_CONF_HIGH_CONC_SKIP_REQUIRES_STRUCTURAL_REASON",passed:!((confidence>=4&&concentration>=4)&&/^見送り/.test(provisionalVerdict.label)&&!snapshot?.noBet)||["UNDER_COVERED","INEFFICIENT","OVER_SPREAD"].includes(massStatus)||(allOddsEvaluated&&maxExpectedValue!=null&&maxExpectedValue<1),label:"高信頼・高集中の見送りには点数以外の構造理由を必須にする"},
    {id:"ROLLOVER_NOT_ABOVE_CORE",passed:rollover<=confidence&&rollover<=concentration,label:"コロがし適性は信頼度・集中度を超えない"}
  ];
  const failedInvariants=invariantChecks.filter(item=>!item.passed);

  const auditFlags=[];
  if(topShare>0&&topShare<.10)auditFlags.push("展開1位の占有率が10%未満");
  if(dataQuality<.65)auditFlags.push("入力証拠の品質が十分でない");
  if(confidence>=3&&concentration<=2)auditFlags.push("信頼度より展開集中度が低い");
  if(isGirls&&evidenceQuality<.70)auditFlags.push("ガールズ主導権入力の信頼度を要監査");
  if(topFamilyShare>=.20&&topFamilyCoverage!=null&&topFamilyCoverage<.50)auditFlags.push(`1着最上位ファミリーの購入カバー率が低い（${formatPct(topFamilyCoverage)}）`);
  else if(topFamilyShare>=.20&&topFamilyCoverage!=null&&topFamilyCoverage<.70)auditFlags.push(`1着最上位ファミリーの購入カバー率に注意（${formatPct(topFamilyCoverage)}）`);
  if(consistencyAdjustments.length)auditFlags.push("評価整合性の上限補正あり");
  if(failedInvariants.length)auditFlags.push("評価整合性ルール違反");

  const generated=finiteOrNull(audit.generatedTerminalCount);
  const adopted=finiteOrNull(audit.adoptedTerminalCount??audit.finalBetCount)??betCount;
  const reasonParts=[];
  if(topShare>0)reasonParts.push(`展開1位 ${formatPct(topShare)}`);
  if(topFamilyShare>0)reasonParts.push(`1着集中 ${formatPct(topFamilyShare)}`);
  if(topFamilyCoverage!=null)reasonParts.push(`最上位頭カバー ${formatPct(topFamilyCoverage)}`);
  if(generated!=null)reasonParts.push(`採用 ${adopted} / ${generated}終端`);
  else reasonParts.push(`採用 ${betCount}点`);
  if(isGirls)reasonParts.push("ガールズ専用・主導権予測");else if(lineConfidence)reasonParts.push(`ライン順序監査 ${lineConfidence}`);
  reasonParts.push(`判定根拠 ${provisionalVerdict.reason}`);

  return{
    ratingAlgorithmVersion:"DISPLAY-RATING-0.4-STRUCTURAL-SKIP-BOUNDARY",
    confidence,
    concentration,
    rollover,
    verdict:provisionalVerdict.label,
    verdictTone:provisionalVerdict.tone,
    purchaseEligibility:purchaseEligibility||{state:snapshot?.noBet?"PURCHASE_BLOCKED":"PURCHASE_ALLOWED",canPurchase:!snapshot?.noBet},
    reason:reasonParts.join(" ・ "),
    calibrationStatus:"UNVALIDATED",
    calibrationLabel:"未校正・検証対象",
    auditFlags,
    consistencyAudit:{
      status:failedInvariants.length?"VIOLATION":consistencyAdjustments.length?"ADJUSTED":"OK",
      label:failedInvariants.length?"矛盾あり":consistencyAdjustments.length?"整合補正あり":"整合",
      adjustments:consistencyAdjustments,
      invariantChecks
    },
    diagnostics:{
      topShare,top3Share,topGapRatio,cutGapRatio,betCount,dataQuality,purchaseQuality,
      branchConcentrationRaw,terminalConcentrationRaw,concentrationRaw,rawConcentration,
      terminalTop3Share,terminalTop5Share,topFamilyShare,top2FamilyShare,topFamilyCoverage,
      familyConcentration:familyConcentrationDiagnostics(familySummary),
      confidenceRaw,rawConfidence,effectiveConfidence,rolloverRaw:rolloverRaw??.10,
      rawEvaluationIndex,confidenceAdjustedEvaluationIndex,verdictCappedEvaluationIndex,evaluationIndex,
      maxExpectedValue,allOddsEvaluated,eligibleCoverage,weightedCoverageTarget,massEfficiency,massStatus
    }
  };
}

export function starText(value){
  const n=Math.max(1,Math.min(5,Math.round(Number(value)||1)));
  return "★".repeat(n)+"☆".repeat(5-n);
}

function normalizeBranchRows(audit,branches){
  let rows=Array.isArray(audit?.rows)?audit.rows.map(row=>({score:Number(row?.score)||0,share:Number(row?.share)})):[];
  if(!rows.length&&Array.isArray(branches)){
    const raw=branches.map(row=>({score:Number(row?.score)||0})).filter(row=>row.score>0).sort((a,b)=>b.score-a.score);
    const total=raw.reduce((sum,row)=>sum+row.score,0);
    rows=raw.map(row=>({...row,share:total>0?row.score/total:0}));
  }else{
    const total=rows.reduce((sum,row)=>sum+row.score,0);
    rows=rows.map(row=>({...row,share:Number.isFinite(row.share)?row.share:(total>0?row.score/total:0)})).sort((a,b)=>b.score-a.score);
  }
  return rows.filter(row=>row.score>0);
}

function startPowerEvidenceQuality(abilities){
  const values=(Array.isArray(abilities)?abilities:[]).map(item=>{
    const evidence=item?.startPowerEvidence;
    if(!evidence)return null;
    const confidence=String(evidence.confidence||"").toLowerCase();
    let value=confidence==="high"?.95:confidence==="medium"?.75:confidence==="low"?.50:.60;
    if(Array.isArray(evidence.missingInputs)&&evidence.missingInputs.length)value=Math.min(value,.45);
    return value;
  }).filter(Number.isFinite);
  return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:.65;
}

function scale(value,min,max){
  const n=Number(value);
  if(!Number.isFinite(n)||max<=min)return 0;
  return Math.max(0,Math.min(1,(n-min)/(max-min)));
}
function starsFrom(value,thresholds){
  const n=Number(value)||0;
  let stars=1;
  for(const threshold of thresholds)if(n>=threshold)stars+=1;
  return Math.max(1,Math.min(5,stars));
}
function finiteOrNull(value){if(value===null||value===undefined||value==="")return null;const n=Number(value);return Number.isFinite(n)?n:null}
function positiveOrNull(value){const n=Number(value);return Number.isFinite(n)&&n>0?n:null}
function normalizedMass(value,total){const n=Number(value);return total&&Number.isFinite(n)?Math.max(0,n)/total:0}
function formatPct(value){return `${(Number(value)*100).toFixed(1)}%`}
function familyConcentrationDiagnostics(value={}){const{familyShares,...summary}=value;return summary}

function normalizeFamilyConcentrationSummary(input,bets,probabilitySum){
  if(input&&typeof input==="object"&&Number.isFinite(Number(input.topFamilyShare))){
    const top=Math.max(0,Number(input.topFamilyShare)||0),top2=Math.max(top,Number(input.top2FamilyShare)||top);
    return{familyCount:Number(input.familyCount)||0,mainFamilyCount:Number(input.mainFamilyCount)||0,coverFamilyCount:Number(input.coverFamilyCount)||0,topFamilyShare:top,top2FamilyShare:top2,mainFamilyShare:Math.max(0,Number(input.mainFamilyShare)||0),familySupportTop:finiteOrNull(input.familySupportTop),familySupportTop2:finiteOrNull(input.familySupportTop2),familyShares:Array.isArray(input.familyShares)?input.familyShares.map(Number).filter(Number.isFinite).sort((a,b)=>b-a):[top,Math.max(0,top2-top)].filter(x=>x>0)};
  }
  const families=new Map();
  for(const bet of Array.isArray(bets)?bets:[]){
    const id=String(bet?.scenarioFamilyId||bet?.originatingScenarioFamily||"").trim();
    const probability=finiteOrNull(bet?.scenarioFamilyProbability);
    if(!id||probability==null)continue;
    const existing=families.get(id),classification=String(bet?.mainCoverClassification||bet?.category||bet?.betClass||"").toUpperCase();
    if(!existing)families.set(id,{id,probability:Math.max(0,probability),support:Math.max(0,Number(bet?.scenarioFamilySupport)||0),classification});
    else if(existing.classification!=="MAIN"&&classification==="MAIN")existing.classification="MAIN";
  }
  const rows=[...families.values()].sort((a,b)=>b.probability-a.probability||a.id.localeCompare(b.id,"en"));
  const denominator=probabilitySum||1,shares=rows.map(row=>row.probability/denominator),supports=rows.map(row=>row.support).sort((a,b)=>b-a);
  return{familyCount:rows.length,mainFamilyCount:rows.filter(row=>row.classification==="MAIN").length,coverFamilyCount:rows.filter(row=>row.classification==="COVER").length,topFamilyShare:shares[0]||0,top2FamilyShare:(shares[0]||0)+(shares[1]||0),mainFamilyShare:rows.filter(row=>row.classification==="MAIN").reduce((sum,row)=>sum+row.probability/denominator,0),familySupportTop:supports[0]??null,familySupportTop2:(supports[0]||0)+(supports[1]||0),familyShares:shares};
}
