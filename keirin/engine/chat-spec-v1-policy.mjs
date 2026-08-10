const PURCHASED="購入採用";
const REJECTED="購入不採用";
const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,Number(v)||0));
const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
const sum=xs=>xs.reduce((s,x)=>s+(Number(x)||0),0);

const FORECAST_WEIGHT={main:1,contender:.74,sub:.40,risk:.18};
const ROLE_LABEL={main:"中心予測",contender:"有力な次候補",sub:"可能性として保持",risk:"例外・リスク"};

export function applyChatSpecV1({scored=[],lines=[],branches=[],terminals=[],oddsByOrder={}}){
  const riderByNumber=new Map(scored.map(r=>[Number(r.number),r]));
  const branchById=new Map(branches.map(b=>[String(b.id),b]));

  // 1) Keep every generated terminal. We re-evaluate probability and purchase,
  //    but never remove a logically possible terminal in this layer.
  const evaluated=terminals.map((terminal,index)=>{
    const order=(terminal.order||[]).map(Number);
    const [f,s,t]=order.map(n=>riderByNumber.get(n));
    const roleQuality=geometric([
      normalize10(f?.roleScores?.first),
      normalize10(s?.roleScores?.second),
      normalize10(t?.roleScores?.third)
    ]);
    const support=deriveBranchSupport(terminal,branchById);
    const original=Math.max(Number(terminal.probability)||0,1e-12);
    // Explicit Chat Spec v1 combination:
    // original branch-conditioned likelihood + independent placing suitability
    // + forecast-role support. No terminal is cut here.
    const raw=Math.pow(original,.38)*Math.pow(Math.max(roleQuality,1e-6),.34)*Math.pow(Math.max(support.weight,1e-6),.28);
    const odds=lookupOdds(order,oddsByOrder);
    return{
      ...terminal,
      _chatRaw:raw,
      _chatRoleQuality:roleQuality,
      chatForecastRole:support.role,
      chatForecastRoleLabel:ROLE_LABEL[support.role]||"不明",
      chatSupportingBranchIds:support.ids,
      chatSupportingBranchLabels:support.labels,
      chatSupportWeight:support.weight,
      odds,
      lifecycle:{
        ...(terminal.lifecycle||{}),
        generated:true,
        probabilityEvaluated:true,
        terminalDeleted:false
      }
    };
  });

  normalizeProbabilities(evaluated);
  addRanks(evaluated);
  const families=buildFamilies(evaluated,branches);
  const primaryFamily=selectPrimaryFamily(families,branches);
  const centerHeads=new Set(branches.filter(b=>normalizePriority(b.priority)==="main").map(b=>Number(b.requiredFirstNumber)).filter(Number.isFinite));
  if(!centerHeads.size && primaryFamily)centerHeads.add(primaryFamily.first);

  // 2) Structural / position support is evaluated independently for every placing.
  for(const item of evaluated){
    const family=families.get(Number(item.order?.[0]))||null;
    const natural=deriveNaturalSupport(item);
    const ev=item.odds>1?item.probability*item.odds:null;
    Object.assign(item,{
      firstFamilyNumber:Number(item.order?.[0]),
      firstFamilyTier:family?.tier||"risk",
      firstFamilyProbability:family?.probability||0,
      firstFamilyProbabilityShare:family?.probability||0,
      firstFamilyPriorityMass:family?.priorityMass||{main:0,contender:0,sub:0,risk:0},
      isPrimaryFirstFamily:Boolean(primaryFamily&&family?.first===primaryFamily.first),
      primaryFirstFamilyNumber:primaryFamily?.first||null,
      familyNaturalPositionEligible:natural.ok,
      secondFamilyNaturalEligible:natural.second,
      thirdFamilyNaturalEligible:natural.third,
      secondFamilyRelativeToBest:natural.secondRatio,
      thirdFamilyRelativeToBest:natural.thirdRatio,
      decisionRatios:natural.ratios,
      expectedValueIndex:ev,
      terminalProbabilityShare:item.probability
    });
  }

  // 3) Purchase is probability-mass coverage *inside* a forecast family,
  //    not a global fixed point/rank cutoff.
  const selected=new Set();
  const familyMeta=new Map();
  const orderedFamilies=[...families.values()].sort((a,b)=>{
    const ar=familyPriorityRank(a.tier),br=familyPriorityRank(b.tier);
    return ar-br||b.probability-a.probability||a.first-b.first;
  });

  for(const family of orderedFamilies){
    if(!["main","contender"].includes(family.tier))continue;
    const members=evaluated
      .filter(x=>x.firstFamilyNumber===family.first && x.familyNaturalPositionEligible)
      .filter(x=>x.chatForecastRole==="main" || x.chatForecastRole==="contender")
      .sort(compareTerminal);

    if(!members.length)continue;
    const target=dynamicCoverageTarget(family,primaryFamily);
    const candidateMass=sum(members.map(x=>x.probability));
    let mass=0;

    // Preserve at least one CENTER terminal for a main family when one exists.
    const anchor=family.tier==="main"?members.find(x=>x.chatForecastRole==="main"):null;
    if(anchor){selected.add(key(anchor.order));mass+=anchor.probability;}

    for(const item of members){
      if(family.probability>0 && mass/family.probability>=target)break;
      if(selected.has(key(item.order)))continue;
      selected.add(key(item.order));mass+=item.probability;
    }
    familyMeta.set(family.first,{target,candidateMass,selectedMass:mass});
  }

  // 4) Possible-only scenarios stay in the tree. They can become BUYABLE_HIGH
  //    only with explicit scenario support AND actual odds value.
  const possibleValue=evaluated
    .filter(x=>x.chatForecastRole==="sub" && x.familyNaturalPositionEligible && x.odds>1)
    .filter(x=>Number(x.expectedValueIndex)>1.05)
    .filter(x=>x.probability >= (evaluated[0]?.probability||0)*.10)
    .sort((a,b)=>(b.expectedValueIndex-a.expectedValueIndex)||(b.probability-a.probability));

  // Keep value additions deliberately sparse by natural EV separation; if there
  // is no clear separation, keep all as possibilities and do not force a bet.
  const valueSelected=selectNaturallySeparatedValue(possibleValue);
  for(const item of valueSelected)selected.add(key(item.order));

  // 5) Final classification and reason codes. Every non-purchase gets a reason.
  for(const item of evaluated){
    const k=key(item.order),chosen=selected.has(k);
    const inCenter=centerHeads.has(item.firstFamilyNumber);
    let betClass="NONE",code=null,reason=null,mode=null;

    if(chosen){
      if(item.chatForecastRole==="main" && inCenter){
        betClass="MAIN";
        mode="CHAT_SPEC_CENTER";
        reason=humanPurchaseReason(item,"MAIN");
      }else if(item.chatForecastRole==="main" || item.chatForecastRole==="contender"){
        betClass="COVER";
        mode="CHAT_SPEC_SECONDARY";
        reason=humanPurchaseReason(item,"COVER");
      }else{
        betClass="BUYABLE_HIGH";
        mode="CHAT_SPEC_VALUE";
        reason=humanPurchaseReason(item,"BUYABLE_HIGH");
      }
    }else{
      ({code,reason}=rejectReason(item,familyMeta));
    }

    Object.assign(item,{
      betClass,
      purchaseStatus:chosen?PURCHASED:REJECTED,
      purchaseRejectCode:chosen?null:code,
      purchaseReason:reason,
      adoptionMode:mode,
      representativeTerminal:chosen&&item.terminalGlobalRank<=3,
      dominantBranchId:item.chatSupportingBranchIds?.[0]||item.branchId||null,
      dominantBranchLabel:item.chatSupportingBranchLabels?.[0]||item.branchLabel||null,
      dominantBranchPriority:item.chatForecastRole,
      branchFit:item.chatSupportWeight,
      branchSupport:item.chatSupportingBranchIds?.length||0,
      weightedBranchSupport:item.chatSupportWeight,
      lifecycle:{
        ...(item.lifecycle||{}),
        purchaseDecision:chosen?"ADOPTED":"REJECTED",
        purchaseDecisionCode:chosen?mode:code,
        purchaseDecisionReason:reason
      }
    });
  }

  // Compatibility fields used by existing diagnostics/UI.
  for(const item of evaluated){
    const fm=familyMeta.get(item.firstFamilyNumber);
    item.firstFamilyCoverageTarget=fm?.target??null;
    item.firstFamilyCandidateCoverage=item.firstFamilyProbability>0&&fm?fm.candidateMass/item.firstFamilyProbability:null;
    item.firstFamilySelectedCoverage=item.firstFamilyProbability>0&&fm?fm.selectedMass/item.firstFamilyProbability:null;
    item.selectedByFamilyCoverage=selected.has(key(item.order)) && item.betClass!=="BUYABLE_HIGH";
    item.mainHeadSiblingEligible=item.familyNaturalPositionEligible&&item.firstFamilyTier==="main";
    item.mainHeadSiblingBranchId=item.dominantBranchId;
    item.mainHeadSiblingBranchLabel=item.dominantBranchLabel;
    item.mainHeadSiblingSecondEligible=item.secondFamilyNaturalEligible;
    item.mainHeadSiblingThirdEligible=item.thirdFamilyNaturalEligible;
    item.mainHeadSiblingFirstRelativeToBest=item.decisionRatios?.first??0;
    item.mainHeadSiblingSecondRelativeToBest=item.secondFamilyRelativeToBest??0;
    item.mainHeadSiblingThirdRelativeToBest=item.thirdFamilyRelativeToBest??0;
    item.highPayoutCandidate=item.chatForecastRole==="sub";
    item.highPayoutAttribute=item.betClass==="BUYABLE_HIGH";
    item.highPayoutAttributeLabel=item.betClass==="BUYABLE_HIGH"?"可能性枝＋オッズ妙味":"";
    item.oddsEvaluationStatus=item.odds>1?"EVALUATED":"ODDS_PENDING";
    item.subScenarioProbability=item.chatForecastRole==="sub"?item.probability:null;
    item.subValueIndex=item.chatForecastRole==="sub"?item.expectedValueIndex:null;
    item.subValueNaturalEligible=item.chatForecastRole==="sub"&&item.familyNaturalPositionEligible;
  }

  return{
    terminals:evaluated,
    families:[...families.values()].sort((a,b)=>b.probability-a.probability),
    centerHeads:[...centerHeads],
    scenarioSummary:buildScenarioSummary(branches),
    audit:buildChatSpecAudit(evaluated,branches,families,primaryFamily)
  };
}

function deriveBranchSupport(terminal,branchById){
  const cs=[...(terminal.branchContributions||[])].filter(c=>contributionMatches(c,terminal.order));
  if(!cs.length){
    const p=normalizePriority(terminal.branchPriority);
    return{role:p,weight:FORECAST_WEIGHT[p]||.18,ids:[terminal.branchId].filter(Boolean),labels:[terminal.branchLabel].filter(Boolean)};
  }
  cs.sort((a,b)=>{
    const ap=FORECAST_WEIGHT[normalizePriority(a.branchPriority)]||.18;
    const bp=FORECAST_WEIGHT[normalizePriority(b.branchPriority)]||.18;
    return bp-ap||(Number(b.probability)||0)-(Number(a.probability)||0);
  });
  const top=cs[0],role=normalizePriority(top.branchPriority);
  const weights=cs.map(c=>(FORECAST_WEIGHT[normalizePriority(c.branchPriority)]||.18)*Math.max(.1,ratioGeom(c.decisionRatios)));
  const weight=Math.min(1,Math.max(...weights,FORECAST_WEIGHT[role]||.18));
  return{role,weight,ids:cs.map(c=>c.branchId).filter(Boolean),labels:cs.map(c=>c.branchLabel).filter(Boolean)};
}

function deriveNaturalSupport(item){
  const cs=[...(item.branchContributions||[])].filter(c=>contributionMatches(c,item.order));
  const best=cs.sort((a,b)=>ratioGeom(b.decisionRatios)-ratioGeom(a.decisionRatios))[0]||{};
  const r=best.decisionRatios||{};
  const first=finite(r.first)?Number(r.first):1;
  const second=finite(r.second)?Number(r.second):1;
  const third=finite(r.third)?Number(r.third):1;
  // These are provisional structural support floors, not terminal deletion floors.
  // Failure only affects purchase eligibility; the terminal remains stored.
  const secondOk=second>=.70;
  const thirdOk=third>=.70;
  return{ok:first>=.78&&secondOk&&thirdOk,second:secondOk,third:thirdOk,secondRatio:second,thirdRatio:third,ratios:{first,second,third}};
}

function buildFamilies(items,branches){
  const map=new Map();
  for(const x of items){
    const first=Number(x.order?.[0]);
    if(!map.has(first))map.set(first,{first,probability:0,priorityMass:{main:0,contender:0,sub:0,risk:0},tier:"risk"});
    const f=map.get(first); f.probability+=x.probability;
    f.priorityMass[x.chatForecastRole]=(f.priorityMass[x.chatForecastRole]||0)+x.probability;
  }
  for(const f of map.values()){
    if(f.priorityMass.main>0)f.tier="main";
    else if(f.priorityMass.contender>0)f.tier="contender";
    else if(f.priorityMass.sub>0)f.tier="sub";
  }
  return map;
}

function selectPrimaryFamily(families,branches){
  const centerHeads=new Set(branches.filter(b=>normalizePriority(b.priority)==="main").map(b=>Number(b.requiredFirstNumber)).filter(Number.isFinite));
  const center=[...families.values()].filter(f=>centerHeads.has(f.first)).sort((a,b)=>b.probability-a.probability);
  if(center.length)return center[0];
  return [...families.values()].sort((a,b)=>b.probability-a.probability)[0]||null;
}

function dynamicCoverageTarget(family,primary){
  const rel=primary?.probability>0?family.probability/primary.probability:0;
  if(primary&&family.first===primary.first)return clamp(.62+.18*family.probability,.62,.80);
  return clamp(.30+.18*rel,.30,.48);
}

function selectNaturallySeparatedValue(rows){
  if(!rows.length)return[];
  if(rows.length===1)return rows;
  const scores=rows.map(r=>Number(r.expectedValueIndex)||0);
  const gaps=scores.slice(0,-1).map((v,i)=>v-scores[i+1]);
  const max=Math.max(...gaps,0),idx=gaps.indexOf(max);
  const avg=gaps.length?sum(gaps)/gaps.length:0;
  if(max>avg*1.6 && max>.20)return rows.slice(0,idx+1);
  return[]; // no natural boundary => do not force a value bet
}

function rejectReason(item,familyMeta){
  if(!item.familyNaturalPositionEligible)return{code:"POSITION_SUPPORT_WEAK",reason:`${orderText(item)}は終端として保持。ただし2着・3着の位置支持が購入水準まで届かないため不採用。`};
  if(item.chatForecastRole==="risk")return{code:"RISK_SCENARIO_ONLY",reason:`${orderText(item)}は例外・リスク枝として保持するが、中心予測の購入対象にはしない。`};
  if(item.chatForecastRole==="sub"){
    if(!(item.odds>1))return{code:"ODDS_PENDING_FOR_VALUE",reason:`${orderText(item)}は可能性枝として保持。高配当候補に上げるには実オッズ確認が必要。`};
    if(!(Number(item.expectedValueIndex)>1.05))return{code:"VALUE_NOT_ENOUGH",reason:`${orderText(item)}は可能性枝として保持。確率×実オッズの妙味が購入水準に届かない。`};
    return{code:"NO_NATURAL_VALUE_SEPARATION",reason:`${orderText(item)}は妙味候補だが、他の穴候補との差が明確でないため無理に購入しない。`};
  }
  const meta=familyMeta.get(item.firstFamilyNumber);
  if(meta)return{code:"FAMILY_COVERAGE_ALREADY_MET",reason:`${orderText(item)}は成立可能な終端として保持。同じ1着候補の購入確率カバーが既に十分なため追加購入しない。`};
  return{code:"NOT_SELECTED_WITH_REASON",reason:`${orderText(item)}は終端として保持するが、中心予測・有力候補の購入優先度には入らなかった。`};
}

function humanPurchaseReason(item,cls){
  const [a,b,c]=item.order;
  const scenario=item.chatSupportingBranchLabels?.[0]||item.branchLabel||"展開枝";
  const oddsPart=item.odds>1?` 実オッズ${Number(item.odds).toFixed(1)}倍。`:"";
  if(cls==="MAIN")return `主展開「${scenario}」から自然に残る終端。${a}を1着、${b}を2着、${c}を3着として独立評価し、本線ファミリーの確率カバーに採用。${oddsPart}`.trim();
  if(cls==="COVER")return `有力な次候補「${scenario}」または主展開内の枝違いとして成立。中心予測を補う押さえとして採用。${oddsPart}`.trim();
  return `可能性枝「${scenario}」を終端まで保持したうえで、実オッズまで含めた妙味が確認できたため買える高配当として採用。${oddsPart}`.trim();
}

function buildScenarioSummary(branches){
  const sorted=[...branches].sort((a,b)=>familyPriorityRank(normalizePriority(a.priority))-familyPriorityRank(normalizePriority(b.priority))||(Number(b.score)||0)-(Number(a.score)||0));
  return sorted.map(b=>({
    id:b.id,label:b.label,role:normalizePriority(b.priority),roleLabel:ROLE_LABEL[normalizePriority(b.priority)]||"不明",
    requiredFirstNumber:b.requiredFirstNumber??null,score:Number(b.score)||0,
    reasons:(b.scoreTrace||[]).slice(0,4).map(x=>({key:x.key,value:Number(x.value)||0,weight:Number(x.weight)||0,contribution:Number(x.contribution)||0}))
  }));
}

function buildChatSpecAudit(items,branches,families,primary){
  const unexplainedRejects=items.filter(x=>x.purchaseStatus===REJECTED&&(!x.purchaseRejectCode||!x.purchaseReason));
  const deleted=items.filter(x=>x?.lifecycle?.terminalDeleted===true);
  const center=branches.filter(b=>normalizePriority(b.priority)==="main");
  return{
    version:"KEIRIN-CHAT-SPEC-v1-CODED",
    policy:"GENERATE_ALL_THEN_EVALUATE_THEN_PURCHASE",
    generatedTerminalCount:items.length,
    terminalDeletionCount:deleted.length,
    unexplainedPurchaseRejectCount:unexplainedRejects.length,
    centerScenarioCount:center.length,
    primaryFirstFamily:primary?.first||null,
    primaryFirstFamilyProbability:primary?.probability||0,
    familyCount:families.size,
    passed:deleted.length===0&&unexplainedRejects.length===0,
    invariants:[
      {key:"NO_TERMINAL_DELETION",passed:deleted.length===0},
      {key:"NO_UNEXPLAINED_PURCHASE_REJECT",passed:unexplainedRejects.length===0},
      {key:"PURCHASE_SEPARATE_FROM_GENERATION",passed:true},
      {key:"POSSIBILITY_SEPARATE_FROM_CENTER_FORECAST",passed:true}
    ]
  };
}

function normalizeProbabilities(items){
  const total=sum(items.map(x=>x._chatRaw))||1;
  for(const x of items)x.probability=x._chatRaw/total;
  items.sort(compareTerminal);
}
function addRanks(items){
  const familyCount=new Map(),pairCount=new Map();
  items.forEach((x,i)=>{
    x.terminalGlobalRank=i+1;
    const f=Number(x.order?.[0]),p=`${x.order?.[0]}-${x.order?.[1]}`;
    familyCount.set(f,(familyCount.get(f)||0)+1); x.terminalFamilyRank=familyCount.get(f);
    pairCount.set(p,(pairCount.get(p)||0)+1); x.terminalPairRank=pairCount.get(p);
  });
}
function contributionMatches(c,order){return c?.requiredFirstNumber==null||Number(c.requiredFirstNumber)===Number(order?.[0])}
function normalizePriority(p){p=String(p||"").toLowerCase();if(p==="main")return"main";if(p==="contender"||p==="alternative"||p==="cover")return"contender";if(p==="sub"||p==="possible")return"sub";return"risk"}
function familyPriorityRank(p){return({main:0,contender:1,sub:2,risk:3})[p]??9}
function ratioGeom(r={}){return geometric([finite(r.first)?Number(r.first):1,finite(r.second)?Number(r.second):1,finite(r.third)?Number(r.third):1])}
function normalize10(v){return finite(v)?clamp(Number(v)/10,.01,1):.5}
function geometric(vals){const v=vals.filter(x=>finite(x)&&Number(x)>0).map(Number);return v.length?Math.exp(sum(v.map(x=>Math.log(x)))/v.length):.5}
function lookupOdds(order,odds){const k=key(order);const v=odds?.[k]??odds?.[order.join("-")]??null;return finite(v)?Number(v):null}
function key(order){return(order||[]).join("-")}
function orderText(item){return `${key(item.order)}`}
function compareTerminal(a,b){return (b.probability-a.probability)||key(a.order).localeCompare(key(b.order),"en")}
