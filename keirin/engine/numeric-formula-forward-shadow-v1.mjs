import crypto from "node:crypto";
import frozenStage2 from "../../research/numeric-feature-discovery/stage2-frozen-formulas.json" with {type:"json"};

export const NUMERIC_FORMULA_FORWARD_SHADOW_SCHEMA="NUMERIC_FORMULA_FORWARD_SHADOW_V1";
export const NUMERIC_FORMULA_FORWARD_RESULT_SCHEMA="NUMERIC_FORMULA_FORWARD_RESULT_V1";
export const NUMERIC_FORMULA_SET_VERSION="STAGE2_FROZEN_FORWARD_CANDIDATES_V1";
export const NUMERIC_FORMULA_FORWARD_CONFIG_VERSION="NUMERIC_FORMULA_FORWARD_CONFIG_V1";
export const NUMERIC_FORMULA_FORWARD_IDS=Object.freeze(["F0491","F0617","F0588","F0586","F0054"]);

const stable=value=>Array.isArray(value)?`[${value.map(stable).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`:JSON.stringify(value);
const digest=value=>crypto.createHash("sha256").update(stable(value)).digest("hex");
const sourceById=new Map((frozenStage2.formulas||[]).map(row=>[row.formulaId,row]));
const formulaDefinition=row=>({
  formulaId:row.formulaId,
  expression:row.expression,
  seedFeatureNames:[...row.seedFeatureNames],
  coefficients:{...(row.coefficients||{})},
  transform:row.transform,
  operation:row.operation,
  missingRule:row.missingRule,
  epsilon:row.epsilon,
  formulaFamily:row.formulaFamily,
  direction:row.discovery?.direction??null,
  directionLabel:row.discovery?.directionLabel||null,
  quantileBoundaries:[...(row.discovery?.quantileBoundaries||[])]
});

if(frozenStage2.freezeStatus!=="FORMULA_FROZEN_BEFORE_VALIDATION")throw new Error("NUMERIC_FORMULA_SOURCE_NOT_FROZEN");
const selectedDefinitions=NUMERIC_FORMULA_FORWARD_IDS.map(id=>{
  const source=sourceById.get(id);if(!source)throw new Error(`NUMERIC_FORMULA_NOT_FOUND:${id}`);
  const definition=formulaDefinition(source);return Object.freeze({...definition,formulaHash:digest(definition)});
});
export const NUMERIC_FORMULA_FORWARD_SET=Object.freeze({
  formulaSetVersion:NUMERIC_FORMULA_SET_VERSION,
  sourceSchemaVersion:frozenStage2.schemaVersion,
  sourceFreezeStatus:frozenStage2.freezeStatus,
  sourceFreezeHash:frozenStage2.freezeHash,
  formulas:Object.freeze(selectedDefinitions)
});
export const NUMERIC_FORMULA_SET_HASH=digest(NUMERIC_FORMULA_FORWARD_SET);

export function buildNumericFormulaForwardShadow({race,prediction,purchase,multiWorldScenario,generatedAt=new Date().toISOString()}={}){
  const extracted=extractStage1SeedFeatures({prediction,purchase,multiWorldScenario});
  const formulas=NUMERIC_FORMULA_FORWARD_SET.formulas.map(definition=>evaluateFormula(definition,extracted));
  const trace={
    schemaVersion:NUMERIC_FORMULA_FORWARD_SHADOW_SCHEMA,
    configVersion:NUMERIC_FORMULA_FORWARD_CONFIG_VERSION,
    formulaSetVersion:NUMERIC_FORMULA_SET_VERSION,
    formulaSetHash:NUMERIC_FORMULA_SET_HASH,
    sourceFreezeHash:NUMERIC_FORMULA_FORWARD_SET.sourceFreezeHash,
    forwardOnly:true,
    historicalBackfillAllowed:false,
    raceKey:race?.raceKey||race?.id||null,
    predictionHash:null,
    predictionHashLinkStatus:"BOUND_BY_MANIFEST_AFTER_SEAL",
    sealedAt:null,
    featureTimestamp:generatedAt,
    generatedAt,
    resultDataUsed:false,
    featureSchemaVersion:"NUMERIC_FORMULA_STAGE1_SEEDS_V1",
    formulas,
    validFormulaCount:formulas.filter(row=>row.valid).length,
    missingFormulaCount:formulas.filter(row=>!row.valid).length
  };
  trace.inputHash=digest({raceKey:trace.raceKey,formulaSetHash:trace.formulaSetHash,formulas:formulas.map(row=>({formulaId:row.formulaId,rawInputs:row.rawInputs}))});
  trace.traceHash=digest({...trace,traceHash:undefined});
  return trace;
}

export function buildNumericFormulaForwardResult({shadow,predictionHash=null,hit=false,payout=null,resultObservedAt=new Date().toISOString()}={}){
  if(shadow?.schemaVersion!==NUMERIC_FORMULA_FORWARD_SHADOW_SCHEMA||shadow?.resultDataUsed!==false)return{schemaVersion:NUMERIC_FORMULA_FORWARD_RESULT_SCHEMA,status:"SHADOW_UNAVAILABLE",predictionHash:predictionHash||null,resultDataUsedOnlyForEvaluation:true};
  const amount=payout===null||payout===undefined||payout===""?null:Number(payout),validPayout=Number.isFinite(amount),purchaseHit=Boolean(hit);
  return{
    schemaVersion:NUMERIC_FORMULA_FORWARD_RESULT_SCHEMA,
    status:"AVAILABLE",
    raceKey:shadow.raceKey||null,
    predictionHash:predictionHash||shadow.predictionHash||null,
    resultObservedAt,
    formulaSetVersion:shadow.formulaSetVersion,
    formulaSetHash:shadow.formulaSetHash,
    shadowTraceHash:shadow.traceHash||null,
    resultDataUsedOnlyForEvaluation:true,
    outcome:{hit:purchaseHit,payout:validPayout?amount:null,high10k:Boolean(purchaseHit&&validPayout&&amount>=10000),high20k:Boolean(purchaseHit&&validPayout&&amount>=20000),high30k:Boolean(purchaseHit&&validPayout&&amount>=30000)},
    formulas:(shadow.formulas||[]).map(row=>({formulaId:row.formulaId,formulaHash:row.formulaHash,valid:row.valid===true,value:row.valid===true&&Number.isFinite(Number(row.value))?Number(row.value):null,quantileBucket:row.quantileBucket||null,missingReason:row.missingReason||null}))
  };
}

function evaluateFormula(definition,extracted){
  const rawInputs=Object.fromEntries(definition.seedFeatureNames.map(name=>[name,Number.isFinite(extracted.features[name])?extracted.features[name]:null]));
  const missing=Object.entries(rawInputs).filter(([,value])=>value===null).map(([name])=>name);
  if(missing.length)return{formulaId:definition.formulaId,formulaHash:definition.formulaHash,expression:definition.expression,direction:definition.directionLabel,rawInputs,value:null,valid:false,quantileBucket:null,missingReason:missing.some(name=>name.startsWith("world_"))?"WORLD_COMPARISON_NOT_AVAILABLE":"REQUIRED_FEATURE_MISSING",missingFeatures:missing};
  const value=compute(definition,rawInputs);
  if(!Number.isFinite(value))return{formulaId:definition.formulaId,formulaHash:definition.formulaHash,expression:definition.expression,direction:definition.directionLabel,rawInputs,value:null,valid:false,quantileBucket:null,missingReason:"NON_FINITE_RESULT",missingFeatures:[]};
  return{formulaId:definition.formulaId,formulaHash:definition.formulaHash,expression:definition.expression,direction:definition.directionLabel,rawInputs,value,valid:true,quantileBucket:bucket(value,definition.quantileBoundaries),missingReason:null,missingFeatures:[]};
}

function compute(definition,features){
  const values=definition.seedFeatureNames.map(name=>features[name]);
  if(definition.operation==="sum")return values[0]+values[1];
  if(definition.operation==="product")return values[0]*values[1];
  if(definition.operation==="weighted_difference")return values[0]-Number(definition.coefficients.secondary)*values[1];
  if(definition.operation==="reciprocal_abs")return 1/(Math.abs(values[0])+Number(definition.epsilon));
  return NaN;
}

function extractStage1SeedFeatures({prediction,purchase,multiWorldScenario}){
  const terminals=[...(purchase?.terminals||prediction?.terminals||[])].map(row=>({...row,_score:scoreOf(row),_key:ticketKey(row)})).filter(row=>row._key&&row._score!==null).sort((a,b)=>b._score-a._score||a._key.localeCompare(b._key,"en"));
  const purchaseTickets=purchase?.standardPurchasePlan||[],purchasedKeys=new Set(purchaseTickets.map(ticketKey).filter(Boolean)),selected=terminals.filter(row=>purchasedKeys.has(row._key)),outside=terminals.filter(row=>!purchasedKeys.has(row._key)),features={};
  if(!selected.length||!outside.length)return{features,reason:"PURCHASE_BOUNDARY_NOT_AVAILABLE"};
  const allScores=terminals.map(row=>row._score),selectedScores=selected.map(row=>row._score).sort((a,b)=>b-a),outsideScores=outside.map(row=>row._score).sort((a,b)=>b-a),max=allScores[0];
  features.outside_top10_mean=mean(outsideScores.slice(0,10));
  features.boundary_selected_min_minus_outside1=Math.min(...selectedScores)-outsideScores[0];
  features.gap_top5_vs_rank6_10=mean(allScores.slice(0,5))-mean(allScores.slice(5,10));
  features.density_within_85pct_top=allScores.filter(value=>value>=max*.85).length;
  const scenarios=[...(multiWorldScenario?.scenarios||[])].sort((a,b)=>(finite(a.scenarioRank)??Infinity)-(finite(b.scenarioRank)??Infinity)||(finite(b.relativeScenarioScore)??0)-(finite(a.relativeScenarioScore)??0)),worldScores=scenarios.map(row=>finite(row.relativeScenarioScore)??0),rank1=worldScores[0]??null,rank2=worldScores[1]??null,rank3=worldScores[2]??null;
  if(rank1!==null&&rank2!==null)features.world_gap_rank1_rank2=rank1-rank2;
  if(rank1!==null&&rank3!==null)features.world_gap_rank1_rank3=rank1-rank3;
  return{features,reason:null};
}

function bucket(value,cuts){return cuts.length===3?(value<=cuts[0]?"Q1":value<=cuts[1]?"Q2":value<=cuts[2]?"Q3":"Q4"):null}
function finite(value){const number=Number(value);return Number.isFinite(number)?number:null}
function mean(values){const rows=values.filter(Number.isFinite);return rows.length?rows.reduce((sum,value)=>sum+value,0)/rows.length:null}
function scoreOf(row){return finite(row.terminalScore)??finite(row.terminalRelativeScore)??finite(row.score)??finite(row.probability)}
function ticketKey(row){const value=row?.order||row?.combination||row?.ticket;return Array.isArray(value)?value.slice(0,3).map(Number).join("-"):typeof value==="string"?value.replace(/[^0-9]+/g,"-").replace(/^-|-$/g,""):null}
