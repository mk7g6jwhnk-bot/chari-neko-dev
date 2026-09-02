export function buildBetStory(snapshot={},ticket={}){
  const context=ticket.explanationContext||{},order=(ticket.order||context.terminal||[]).map(Number),category=ticket.category||ticket.betClass||"REFERENCE";
  const raceCategory=snapshot?.targetRace?.raceCategory||snapshot?.raceCategory||null,lineLess=raceCategory==="girls"||!context.hasLineContext;
  const riders=[context.first,context.second,context.third].map((rider,index)=>rider||{number:order[index]});
  const familyKey=String(ticket.originatingScenarioFamily||ticket.primaryBranch||context.primaryBranch?.id||ticket.scenarioFamilyLabel||"UNRESOLVED");
  const base=familyBase(context,riders,lineLess),connection=orderConnection(context,riders,lineLess),difference=category==="COVER"?coverDifference(ticket,context,base):null;
  const scenario=[difference,base,connection].filter(Boolean).join(" ");
  const failure=(context.failureConditions||[]).filter(Boolean).slice(0,2).map(normalizeSentence);
  return{version:"BET-STORY-DISPLAY-1.1-EVIDENCE-GATED",ticket:order.join("-"),classification:category,familyKey,brief:`${base} ${shortFinish(riders)}`,scenario,orderReason:connection,failureConditions:failure,internalEvaluation:internalEvaluation(ticket)};
}

function familyBase(context,riders,lineLess){
  const [first]=riders,type=context.primaryBranch?.branchType||context.attackType||"",owner=context.initiativeOwner?`${Number(context.initiativeOwner)}番`:label(first);
  if(lineLess){
    if(/MAKURI|まくり/.test(type))return `${label(first)}がまくりを仕掛け、1着になる流れ。`;
    if(/SOLO|単騎/.test(type))return `${label(first)}が単騎で浮上し、1着になる流れ。`;
    return `${label(first)}が1着になる流れ。`;
  }
  switch(type){
    case"LEADER_HOLD":return `${owner}が先行して主導権を取り、${label(first)}が前で粘る流れ。`;
    case"BANTE_SASHI":return `${owner}が先行して主導権を取り、番手の${label(first)}が抜け出す流れ。`;
    case"MAKURI_SUCCESS":return `${label(first)}がまくりを仕掛け、1着になる流れ。`;
    case"SOLO_RISE":return `${label(first)}が単騎で浮上し、1着になる流れ。`;
    case"LINE_SEPARATION":return `追走が崩れる展開で、${label(first)}が1着になる流れ。`;
    default:return `${label(first)}が1着になる流れ。`;
  }
}

function orderConnection(context,riders,lineLess){
  const[first,second,third]=riders,type=context.primaryBranch?.branchType||context.attackType||"",sameMakuri12=!lineLess&&context.lineRelation12==="same-line"&&type==="MAKURI_SUCCESS",secondMove=sameMakuri12?`${label(second)}が同じ仕掛けに続いて2着に残り`:`${label(second)}が2着に入り`;
  return `${label(first)}が1着、${secondMove}、${label(third)}が3着に入る形。`;
}
function shortFinish(riders){return `${label(riders[1])}が2着、${label(riders[2])}が3着に入る想定。`}
function coverDifference(ticket,context,base){const parent=context.parentMain?.order?.join("-")||"中心の本線",saved=cleanHuman(ticket.mainDifferenceReason);return saved?`MAINは中心展開を軸にするが、このCOVERは${saved}場合。`:`MAINの${parent}とは残り方が変わり、このCOVERでは${base.replace(/。$/,"ケース。")}`}
function internalEvaluation(ticket){return{classification:ticket.category||ticket.betClass||"REFERENCE",naturalConvergence:level(ticket.naturalConvergenceScore),naturalConvergenceScore:numeric(ticket.naturalConvergenceScore),scenarioSupport:level(ticket.scenarioFamilySupport??ticket.branchFit),scenarioSupportScore:numeric(ticket.scenarioFamilySupport??ticket.branchFit),modelProbability:numeric(ticket.probability),terminalProbability:numeric(ticket.terminalProbability??ticket.probability),familyProbability:numeric(ticket.scenarioFamilyProbability),family:ticket.scenarioFamilyLabel||ticket.originatingScenarioFamily||ticket.primaryBranch||ticket.explanationContext?.primaryBranch?.label||null}}
function level(value){const n=numeric(value);return n===null?"未確認":n>=.67?"高":n>=.4?"中":"低"}
function numeric(value){return Number.isFinite(Number(value))?Number(value):null}
function label(rider){return `${Number(rider?.number)||"?"}番${rider?.name?` ${rider.name}`:""}`}
function normalizeSentence(value){const text=cleanHuman(value).replace(/[。、]$/g,"");return text?`${text}とこの着順は崩れる。`:""}
function cleanHuman(value){return String(value||"").replace(/scenarioFamilyId|terminal probability|natural boundary|support score|branch ID|node/gi,"").replace(/\s+/g," ").trim()}

export function storyInputFingerprint(snapshot={},ticket={}){return JSON.stringify({raceCategory:snapshot?.targetRace?.raceCategory||snapshot?.raceCategory||null,ticket:{order:ticket.order,category:ticket.category||ticket.betClass,originatingScenarioFamily:ticket.originatingScenarioFamily,primaryBranch:ticket.primaryBranch,scenarioFamilyLabel:ticket.scenarioFamilyLabel,mainDifferenceReason:ticket.mainDifferenceReason,naturalConvergenceScore:ticket.naturalConvergenceScore,scenarioFamilySupport:ticket.scenarioFamilySupport,branchFit:ticket.branchFit,probability:ticket.probability,terminalProbability:ticket.terminalProbability,scenarioFamilyProbability:ticket.scenarioFamilyProbability,explanationContext:ticket.explanationContext}})}
