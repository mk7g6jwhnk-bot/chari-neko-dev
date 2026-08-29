export function attachPurchaseScenarioExplanations({plans=[],classified=[],scored=[],lines=[],branches=[]}={}){
  const terminalByOrder=new Map(classified.map(item=>[(item.order||[]).join("-"),item]));
  return plans.map(plan=>{
    const terminal=terminalByOrder.get((plan.order||[]).join("-"))||plan;
    const explanationContext=buildPurchaseExplanationContext({terminal,classified,scored,lines,branches});
    return{...plan,explanationContext,scenarioExplanation:renderPurchaseScenario(explanationContext,plan.betClass)};
  });
}

export function buildPurchaseExplanationContext({terminal,classified=[],scored=[],lines=[],branches=[]}={}){
  const riderByNumber=new Map(scored.map(rider=>[Number(rider.number),rider]));
  const branchById=new Map(branches.map(branch=>[String(branch.id),branch]));
  const lineById=new Map(lines.map(line=>[String(line.id),line]));
  const [n1,n2,n3]=(terminal.order||[]).map(Number);
  const first=riderByNumber.get(n1)||fallbackRider(n1,terminal.positionEvidence?.first);
  const second=riderByNumber.get(n2)||fallbackRider(n2,terminal.positionEvidence?.second);
  const third=riderByNumber.get(n3)||fallbackRider(n3,terminal.positionEvidence?.third);
  const contributions=[...(terminal.branchContributions||[])]
    .filter(item=>!positive(item.requiredFirstNumber)||Number(item.requiredFirstNumber)===n1)
    .sort((a,b)=>(Number(b.probability)||0)-(Number(a.probability)||0)||String(a.branchId).localeCompare(String(b.branchId),"en"));
  const primaryBranch=mergeBranch(contributions[0],branchById.get(String(contributions[0]?.branchId||terminal.dominantBranchId||terminal.branchId)),terminal);
  const supportingBranches=contributions.slice(1).map(item=>mergeBranch(item,branchById.get(String(item.branchId)),terminal));
  const primaryLine=primaryBranch.primaryLineId!=null?lineById.get(String(primaryBranch.primaryLineId))||null:null;
  const initiativeRider=primaryBranch.branchType==="BANTE_SASHI"
    ?primaryLine?.leader||scored.find(rider=>String(rider.lineId)===String(primaryBranch.primaryLineId)&&rider.role==="自力")||null
    :first;
  const rejectedThird=classified.filter(candidate=>Number(candidate.order?.[0])===n1&&Number(candidate.order?.[1])===n2&&Number(candidate.order?.[2])!==n3)
    .sort((a,b)=>(Number(b.probability)||0)-(Number(a.probability)||0)||Number(a.order?.[2])-Number(b.order?.[2]))[0]||null;
  const rejectedRider=rejectedThird?riderByNumber.get(Number(rejectedThird.order?.[2]))||fallbackRider(Number(rejectedThird.order?.[2]),rejectedThird.positionEvidence?.third):null;
  return{
    version:"PURCHASE-SCENARIO-EXPLANATION-1.1",terminal:[n1,n2,n3],terminalProbability:Number(terminal.probability)||0,first,second,third,
    firstRole:first.role||null,secondRole:second.role||null,thirdRole:third.role||null,
    primaryBranch,supportingBranches,primaryLine,
    initiativeOwner:initiativeRider?Number(initiativeRider.number):null,
    initiativeAssessment:primaryBranch.initiative||null,attackType:attackType(primaryBranch.branchType),
    hasLineContext:Boolean(primaryLine),
    lineRelation12:lineRelation(first,second),lineRelation23:lineRelation(second,third),lineRelation13:lineRelation(first,third),
    firstEvidence:evidence(first,"FIRST",terminal),secondConditionalEvidence:evidence(second,"SECOND",terminal),thirdConditionalEvidence:evidence(third,"THIRD",terminal),
    rejectedCompetitors:rejectedRider?[{number:Number(rejectedRider.number),role:rejectedRider.role||null,lineId:rejectedRider.lineId||null,probability:Number(rejectedThird.probability)||0,evidence:evidence(rejectedRider,"THIRD",rejectedThird)}]:[],
    failureConditions:failureConditions(primaryBranch,first,second,initiativeRider,scored)
  };
}

export function renderPurchaseScenario(context,betClass="MAIN"){
  const lead=betClass==="BUYABLE_HIGH"?"この穴目は、":betClass==="COVER"?"本線の流れが一部変わり、":"";
  return[
    `${lead}${opening(context)} ${secondStep(context)}`,
    `${thirdStep(context)} ${counterEvidence(context)}`.trim(),
    supportingEvidence(context),
    `この目が崩れるのは、${context.failureConditions.join("、または")}場合です。`
  ].filter(Boolean).join("\n\n");
}

function opening(c){
  const first=label(c.first),owner=c.initiativeOwner?number(c.initiativeOwner):"主導権候補",driver=driverPhrase(c.firstEvidence);
  switch(c.primaryBranch.branchType){
    case"LEADER_HOLD":return `${first}が先に主導権を取り、${driver}を根拠に最終バックまで先頭を保って押し切る展開です。`;
    case"BANTE_SASHI":return `${owner}が主導権を取る流れから、番手の${first}が追走し、${driver}を生かして直線で交わす展開です。`;
    case"MAKURI_SUCCESS":return `${first}が前団を射程に置いてまくりを仕掛け、${driver}を根拠に先頭まで届く展開です。`;
    case"SOLO_RISE":return `ライン同士の先頭争いを見ながら単騎の${first}が仕掛け、${driver}によって前団を捉える展開です。`;
    case"LINE_SEPARATION":return `前位の追走が崩れて隊列が乱れ、${first}が空いた位置へ進出し、${driver}を生かして先頭へ出る展開です。`;
    default:return `複数の先行候補が主導権争いで脚を使う流れから、${first}が${driver}を生かして抜け出す展開です。`;
  }
}

function secondStep(c){
  const first=label(c.first),second=label(c.second),same=c.lineRelation12==="same-line",mechanism=conditionPhrase(c.secondConditionalEvidence,"2着");
  if(c.primaryBranch.branchType==="BANTE_SASHI"&&same&&c.second.role==="自力")return `${first}が差し切った後も、先行した${second}は前で踏み続け、${mechanism}で2着に残る形です。`;
  if(c.primaryBranch.branchType==="MAKURI_SUCCESS")return `${first}のまくりが決まった後、${second}は${same?"同じ仕掛けに続き":"前団の直後を確保し"}、${mechanism}で2着を取る想定です。`;
  if(same)return `${first}が先頭へ出た後は、同じラインの${second}が追走し、${mechanism}で2着へ続く想定です。`;
  return `${first}が抜け出した後、${second}は${c.hasLineContext?"別線から":"別の位置から"}前団の直後を確保し、${mechanism}で2着争いを上回る想定です。`;
}

function thirdStep(c){
  const same=c.lineRelation13==="same-line"||c.lineRelation23==="same-line",condition=conditionPhrase(c.thirdConditionalEvidence,"3着");
  return `${label(c.first)}-${label(c.second)}まで成立すると、残る3着争いでは${label(c.third)}が${same?"同じラインの後方位置を保ち":"先頭争いの後ろの位置を確保し"}、${condition}で3着に入る形です。`;
}

function counterEvidence(c){
  const rival=c.rejectedCompetitors[0];
  if(!rival)return `同じ1-2着から別の3着へ続く終端は保存されておらず、この3着条件が崩れれば買い目全体も崩れます。`;
  return `${number(rival.number)}も同じ1-2着からの3着候補で、そちらは${conditionPhrase(rival.evidence,"3着")}を根拠とする別終端です。その競合条件が前面に出ると3着が入れ替わるため、この買い目では${label(c.third)}の条件が保たれることを前提にしています。`;
}

function supportingEvidence(c){
  const labels=[...new Set([c.primaryBranch,...c.supportingBranches].map(branch=>branch.label).filter(Boolean))];
  return labels.length<2?"":`この${c.terminal.join("-")}は、実際に保存された「${labels.slice(0,3).join("」「")}」の複数枝から支持され、特定の一枝だけに依存していません。`;
}

function failureConditions(branch,first,second,initiativeRider,scored){
  const other=scored.filter(rider=>rider.role==="自力"&&Number(rider.number)!==Number(initiativeRider?.number)&&String(rider.lineId)!==String(initiativeRider?.lineId))
    .sort((a,b)=>(Number(b.evidence?.start)||0)-(Number(a.evidence?.start)||0)||Number(a.number)-Number(b.number))[0];
  const rival=other?label(other):"別線の自力選手";
  switch(branch.branchType){
    case"LEADER_HOLD":return[`${rival}が先に主導権を奪い切る`,`${label(second)}が前との追走位置を失う`];
    case"BANTE_SASHI":return[`${initiativeRider?label(initiativeRider):"先行選手"}が番手に差させず押し切る`,`${rival}の仕掛けでラインが分かれる`];
    case"MAKURI_SUCCESS":return[`${label(first)}のまくりが前団まで届かない`,`${label(second)}がその仕掛けに続けない`];
    case"SOLO_RISE":return[`${label(first)}の単騎の仕掛けが前団まで届かない`,`ライン勢が隊列を保ったまま直線へ入る`];
    case"LINE_SEPARATION":return[`想定した追走崩れが起きない`,`前団が隊列を保ったまま残る`];
    default:return[`先頭同士の踏み合いが起きない`,`${label(first)}が抜け出す位置を確保できない`];
  }
}

function evidence(rider,stage,terminal){
  const node=(terminal.nodeTrace||[]).find(item=>item.stage===stage);
  const conditions=(node?.newRequiredConditions||[]).map(item=>({label:item.label||item.mechanism?.label||null,probability:numeric(item.probability),kind:item.kind||null})).filter(item=>item.label);
  const e=rider.evidence||{},keys=stage==="FIRST"?["start","sprint","finish","recent"]:["tracking","finish","recent"];
  const drivers=keys.map(key=>({key,value:numeric(e[key])})).filter(item=>item.value!==null&&item.value>0).sort((a,b)=>b.value-a.value||a.key.localeCompare(b.key,"en"));
  if(!drivers.length){const positionValue=numeric(rider.roleScores?.[stage==="FIRST"?"first":stage==="SECOND"?"second":"third"]);if(positionValue!==null&&positionValue>0)drivers.push({key:stage==="FIRST"?"positionFirst":stage==="SECOND"?"positionSecond":"positionThird",value:positionValue})}
  return{stage,conditions,drivers,conditionalProbability:numeric(node?.conditionalProbability)};
}
function conditionPhrase(evidence,position){const condition=evidence?.conditions?.[0]?.label;if(condition)return `「${condition}」`;const driver=driverPhrase(evidence);return driver||`${position}の着順別評価`}
function driverPhrase(evidence){const labels={start:"主導権評価",sprint:"まくり評価",finish:"終盤評価",tracking:"追走評価",recent:"近況評価",positionFirst:"1着評価",positionSecond:"2着評価",positionThird:"3着評価"},top=evidence?.drivers?.[0];return top?`${labels[top.key]||top.key} ${top.value.toFixed(2)}`:"保存された着順条件"}
function lineRelation(a,b){return a?.lineId&&b?.lineId&&!String(a.lineId).startsWith("unknown-")&&String(a.lineId)===String(b.lineId)?"same-line":"different-line"}
function attackType(type){return({LEADER_HOLD:"逃げ",BANTE_SASHI:"差し",MAKURI_SUCCESS:"まくり",SOLO_RISE:"単騎浮上",LINE_SEPARATION:"ライン分断",LEAD_BATTLE:"踏み合い"})[type]||"展開競合"}
function mergeBranch(contribution,branch,terminal){return{...(branch||{}),...(contribution||{}),id:contribution?.branchId||branch?.id||terminal.dominantBranchId||terminal.branchId||null,label:contribution?.branchLabel||branch?.label||terminal.dominantBranchLabel||terminal.branchLabel||"保存された展開枝",branchType:contribution?.branchType||branch?.branchType||terminal.branchType||"LEAD_BATTLE"}}
function fallbackRider(numberValue,p){return{number:numberValue,name:"",role:p?.role||null,lineId:null,evidence:Object.fromEntries((p?.drivers||[]).map(item=>[evidenceKey(item.key),item.value]))}}
function evidenceKey(key){return({recentForm:"recent",startPower:"start",sprintPower:"sprint",finishPower:"finish",trackingSkill:"tracking"})[key]||key}
function label(rider){return `${number(rider?.number)}${rider?.name?` ${rider.name}`:""}`}
function number(value){return `${Number(value)}番`}
function numeric(value){return Number.isFinite(Number(value))?Number(value):null}
function positive(value){return numeric(value)!==null&&Number(value)>0}
