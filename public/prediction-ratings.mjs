export function derivePredictionRatings(snapshot={}){
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
  const pointFactor=betCount<=3?1:betCount<=6?.90:betCount<=10?.72:betCount<=15?.48:betCount<=25?.25:.08;

  const probabilitySum=positiveOrNull(audit.terminalProbabilitySum);
  const terminalTop3Share=normalizedMass(audit.top3Mass,probabilitySum);
  const terminalTop5Share=normalizedMass(audit.top5Mass,probabilitySum);
  const familyRows=Array.isArray(audit?.purchaseFamilyAudit?.rows)?audit.purchaseFamilyAudit.rows:[];
  const familyShares=familyRows
    .map(row=>probabilitySum?Math.max(0,Number(row?.probability)||0)/probabilitySum:0)
    .filter(value=>value>0)
    .sort((a,b)=>b-a);
  const topFamilyShare=familyShares[0]||0;
  const top2FamilyShare=(familyShares[0]||0)+(familyShares[1]||0);

  const branchConcentrationRaw=
    .34*scale(topShare,.07,.22)+
    .28*scale(top3Share,.22,.55)+
    .18*scale(topGapRatio,0,.18)+
    .20*scale(cutGapRatio,0,.25);

  const hasTerminalStructure=terminalTop3Share>0||terminalTop5Share>0||topFamilyShare>0;
  const terminalConcentrationRaw=hasTerminalStructure?(
    .30*scale(topFamilyShare,.25,.58)+
    .18*scale(top2FamilyShare,.48,.82)+
    .22*scale(terminalTop3Share,.08,.28)+
    .18*scale(terminalTop5Share,.14,.42)+
    .12*pointFactor
  ):branchConcentrationRaw;

  const concentrationRaw=.46*branchConcentrationRaw+.54*terminalConcentrationRaw;
  const rawConcentration=starsFrom(concentrationRaw,[.20,.38,.58,.78]);
  const consistencyAdjustments=[];
  let concentration=rawConcentration;

  // 表示上の「集中」は買い目の広がりと矛盾させない。
  // 点数を直接「悪い」と決めるのではなく、集中度の上限監査として使う。
  if(betCount>=11&&concentration>2){
    consistencyAdjustments.push(`採用${betCount}点のため展開集中度を${concentration}→2へ上限補正`);
    concentration=2;
  }else if(betCount>=7&&concentration>3){
    consistencyAdjustments.push(`採用${betCount}点のため展開集中度を${concentration}→3へ上限補正`);
    concentration=3;
  }
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
  const confidenceRaw=.42*concentrationNorm+.33*dataQuality+.25*pointFactor;
  const rawConfidence=starsFrom(confidenceRaw,[.30,.48,.64,.80]);
  let confidence=rawConfidence;

  // 信頼度は「データが良い」だけで4〜5にしない。
  // 集中度と購入点数を越えて高評価にならないよう整合監査を入れる。
  const concentrationConfidenceCap=Math.min(5,concentration+1);
  if(confidence>concentrationConfidenceCap){
    consistencyAdjustments.push(`展開集中度${concentration}に合わせ信頼度を${confidence}→${concentrationConfidenceCap}へ上限補正`);
    confidence=concentrationConfidenceCap;
  }
  if(betCount>=11&&confidence>3){
    consistencyAdjustments.push(`採用${betCount}点のため信頼度を${confidence}→3へ上限補正`);
    confidence=3;
  }else if(betCount>=7&&confidence>4){
    consistencyAdjustments.push(`採用${betCount}点のため信頼度を${confidence}→4へ上限補正`);
    confidence=4;
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
  const maxExpectedValue=availableValueRows.length?Math.max(...availableValueRows):null;
  const allOddsEvaluated=betCount>0&&adoptedAudit.length>=betCount&&availableValueRows.length===betCount;

  let provisionalVerdict;
  if(snapshot?.noBet||betCount===0)provisionalVerdict={label:"見送り",tone:"stop",reason:"購入対象なし"};
  else if(concentration===1||confidence===1)provisionalVerdict={label:"見送り推奨",tone:"stop",reason:"予想の集中または信頼が低い"};
  else if(allOddsEvaluated&&maxExpectedValue!=null&&maxExpectedValue<1)provisionalVerdict={label:"妙味なし",tone:"caution",reason:"採用候補の確率×オッズが全て損益分岐未満"};
  else if(betCount>=11||concentration<=2||confidence<=2)provisionalVerdict={label:"見送り寄り",tone:"caution",reason:"買い目が広い、または予想集中が低い"};
  else provisionalVerdict={label:"購入可",tone:"go",reason:"評価整合条件を満たす"};

  let rollover,rolloverRaw;
  if(provisionalVerdict.tone==="stop"){rollover=1;rolloverRaw=.10;}
  else{
    rolloverRaw=.42*(confidence/5)+.38*(concentration/5)+.20*pointFactor;
    rollover=starsFrom(rolloverRaw,[.40,.58,.72,.88]);
    rollover=Math.min(rollover,confidence,concentration);
    if(betCount>=11)rollover=Math.min(rollover,2);
    else if(betCount>=7)rollover=Math.min(rollover,3);
  }

  const confidenceContinuousCap=confidence<=1?.29:confidence===2?.47:confidence===3?.63:confidence===4?.79:1;
  const effectiveConfidence=Math.min(confidenceRaw,confidenceContinuousCap);
  let evaluationIndex=Math.max(0,Math.min(100,100*(.40*effectiveConfidence+.35*concentrationRaw+.25*(rolloverRaw??.10))));
  if(provisionalVerdict.tone==="stop")evaluationIndex=Math.min(evaluationIndex,35);
  else if(provisionalVerdict.tone==="caution")evaluationIndex=Math.min(evaluationIndex,65);

  const invariantChecks=[
    {id:"BROAD_BETS_NOT_HIGH_CONCENTRATION",passed:!(betCount>=11&&concentration>=4),label:"11点以上で展開集中度4以上を禁止"},
    {id:"BROAD_BETS_NOT_HIGH_CONFIDENCE",passed:!(betCount>=11&&confidence>=4),label:"11点以上で信頼度4以上を禁止"},
    {id:"HIGH_CONF_HIGH_CONC_NOT_SKIP",passed:!((confidence>=4&&concentration>=4)&&/^見送り/.test(provisionalVerdict.label)),label:"信頼度4以上・集中度4以上で見送り表示を禁止"},
    {id:"ROLLOVER_NOT_ABOVE_CORE",passed:rollover<=confidence&&rollover<=concentration,label:"コロがし適性は信頼度・集中度を超えない"}
  ];
  const failedInvariants=invariantChecks.filter(item=>!item.passed);

  const auditFlags=[];
  if(topShare>0&&topShare<.10)auditFlags.push("展開1位の占有率が10%未満");
  if(dataQuality<.65)auditFlags.push("入力証拠の品質が十分でない");
  if(betCount>=11)auditFlags.push(`採用${betCount}点で買い目が広い`);
  if(confidence>=3&&concentration<=2)auditFlags.push("信頼度より展開集中度が低い");
  if(isGirls&&evidenceQuality<.70)auditFlags.push("ガールズ主導権入力の信頼度を要監査");
  if(consistencyAdjustments.length)auditFlags.push("評価整合性の上限補正あり");
  if(failedInvariants.length)auditFlags.push("評価整合性ルール違反");

  const generated=finiteOrNull(audit.generatedTerminalCount);
  const adopted=finiteOrNull(audit.adoptedTerminalCount??audit.finalBetCount)??betCount;
  const reasonParts=[];
  if(topShare>0)reasonParts.push(`展開1位 ${formatPct(topShare)}`);
  if(topFamilyShare>0)reasonParts.push(`1着集中 ${formatPct(topFamilyShare)}`);
  if(generated!=null)reasonParts.push(`採用 ${adopted} / ${generated}終端`);
  else reasonParts.push(`採用 ${betCount}点`);
  if(isGirls)reasonParts.push("ガールズ専用・主導権予測");else if(lineConfidence)reasonParts.push(`ライン順序監査 ${lineConfidence}`);
  reasonParts.push(`判定根拠 ${provisionalVerdict.reason}`);

  return{
    ratingAlgorithmVersion:"DISPLAY-RATING-0.3-CONSISTENCY-AUDIT",
    confidence,
    concentration,
    rollover,
    verdict:provisionalVerdict.label,
    verdictTone:provisionalVerdict.tone,
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
      topShare,top3Share,topGapRatio,cutGapRatio,betCount,dataQuality,pointFactor,
      branchConcentrationRaw,terminalConcentrationRaw,concentrationRaw,rawConcentration,
      terminalTop3Share,terminalTop5Share,topFamilyShare,top2FamilyShare,
      confidenceRaw,rawConfidence,effectiveConfidence,rolloverRaw:rolloverRaw??.10,evaluationIndex,
      maxExpectedValue,allOddsEvaluated
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
function finiteOrNull(value){const n=Number(value);return Number.isFinite(n)?n:null}
function positiveOrNull(value){const n=Number(value);return Number.isFinite(n)&&n>0?n:null}
function normalizedMass(value,total){const n=Number(value);return total&&Number.isFinite(n)?Math.max(0,n)/total:0}
function formatPct(value){return `${(Number(value)*100).toFixed(1)}%`}
