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

  const concentrationRaw=
    .30*scale(topShare,.07,.20)+
    .25*scale(top3Share,.20,.50)+
    .20*scale(topGapRatio,0,.18)+
    .25*scale(cutGapRatio,0,.25);
  const concentration=starsFrom(concentrationRaw,[.20,.38,.58,.78]);

  const bets=Array.isArray(snapshot?.betSelections)?snapshot.betSelections:[];
  const betCount=bets.length;
  const pointFactor=betCount<=3?1:betCount<=6?.90:betCount<=10?.75:betCount<=15?.55:betCount<=25?.30:.10;
  const lineConfidence=String(snapshot?.predictionOutput?.lineConfidence||snapshot?.lineConfidence||"");
  const isGirls=snapshot?.targetRace?.raceCategory==="girls"||snapshot?.predictionOutput?.lineMode==="girls_dynamic";
  const evidenceQuality=startPowerEvidenceQuality(snapshot?.abilitiesUsed||[]);
  const lineQuality=isGirls?evidenceQuality:(lineConfidence==="高"?1:lineConfidence==="中"?.65:lineConfidence==="低"?.35:.70);
  const dataQuality=.55*lineQuality+.45*evidenceQuality;
  const concentrationNorm=concentration/5;
  let confidence=starsFrom(.45*concentrationNorm+.30*dataQuality+.25*pointFactor,[.30,.48,.64,.80]);
  if(concentration<5)confidence=Math.min(confidence,4);
  if(concentration<=1)confidence=Math.min(confidence,2);
  if(!isGirls&&lineConfidence&&lineConfidence!=="高")confidence=Math.min(confidence,2);
  if(snapshot?.noBet)confidence=1;

  let provisionalVerdict;
  if(snapshot?.noBet||betCount===0)provisionalVerdict={label:"見送り",tone:"stop"};
  else if(betCount>20||concentration===1||confidence===1)provisionalVerdict={label:"見送り推奨",tone:"stop"};
  else if(betCount>12||concentration<=2||confidence<=2)provisionalVerdict={label:"見送り寄り",tone:"caution"};
  else provisionalVerdict={label:"購入可",tone:"go"};

  let rollover;
  if(provisionalVerdict.tone==="stop")rollover=1;
  else{
    rollover=starsFrom(.45*(confidence/5)+.35*(concentration/5)+.20*pointFactor,[.40,.58,.72,.88]);
    if(betCount>10)rollover=Math.min(rollover,2);
    else if(betCount>6)rollover=Math.min(rollover,3);
    if(confidence<5||concentration<5)rollover=Math.min(rollover,4);
  }

  const generated=finiteOrNull(audit.generatedTerminalCount);
  const adopted=finiteOrNull(audit.adoptedTerminalCount??audit.finalBetCount)??betCount;
  const reasonParts=[];
  if(topShare>0)reasonParts.push(`展開1位 ${formatPct(topShare)}`);
  if(generated!=null)reasonParts.push(`採用 ${adopted} / ${generated}終端`);
  else reasonParts.push(`採用 ${betCount}点`);
  if(isGirls)reasonParts.push("ガールズ専用・主導権予測");else if(lineConfidence)reasonParts.push(`ライン順序監査 ${lineConfidence}`);

  return{
    confidence,
    concentration,
    rollover,
    verdict:provisionalVerdict.label,
    verdictTone:provisionalVerdict.tone,
    reason:reasonParts.join(" ・ "),
    diagnostics:{topShare,top3Share,topGapRatio,cutGapRatio,betCount,dataQuality,pointFactor,concentrationRaw}
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
function formatPct(value){return `${(Number(value)*100).toFixed(1)}%`}
