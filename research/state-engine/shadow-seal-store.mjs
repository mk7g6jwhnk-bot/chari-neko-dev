import{createHash}from"node:crypto";
import{assertTemporalIntegrity}from"./temporal-guard.mjs";

export class MemoryResearchShadowSealStore{
  #records=[];
  async append(record){if(this.#records.some(row=>row.shadowSealId===record.shadowSealId))return record;this.#records.push(clone(record));return record}
  async list(){return clone(this.#records)}
  audit(){return{persistenceMode:"memory_test_only",restartDurable:false,recordCount:this.#records.length}}
}

export function createResearchShadowSealWriter({store}){
  if(!store||typeof store.append!=="function"||typeof store.list!=="function")throw new Error("research shadow seal store must implement append/list");
  return{
    async seal({raceKey,preRaceInput,parallelOutput,inputObservedAt,predictionSealedAt}){
      if(!raceKey)throw new Error("raceKey required");
      if(preRaceInput?.result||preRaceInput?.officialResult)throw new Error("RESULT_DATA_FORBIDDEN_IN_SHADOW_SEAL_INPUT");
      const temporalAudit=assertTemporalIntegrity({inputObservedAt,predictionSealedAt});
      const payload={
        version:"RESEARCH-SHADOW-SEAL-1.0",raceKey,
        inputObservedAt:temporalAudit.inputObservedAt,predictionSealedAt:temporalAudit.predictionSealedAt,
        preRaceInput:clone(preRaceInput),
        current:compactCurrent(parallelOutput?.current),
        research:compactResearch(parallelOutput?.research),
        temporalAudit,mode:"SHADOW_RESEARCH_ONLY",productionWriteAllowed:false,
        result:null,resultObservedAt:null
      };
      const predictionHash=hash(payload);
      const record={...payload,predictionHash,shadowSealId:`${raceKey}:${predictionHash.slice(0,16)}`};
      await store.append(record);return record;
    },
    async list(){return store.list()},
    audit(){return typeof store.audit==="function"?store.audit():{persistenceMode:"adapter_defined",restartDurable:null}}
  };
}

export function assertShadowSealUnchanged(record){
  const {predictionHash,shadowSealId,...payload}=record||{};
  const actual=hash(payload);
  return{valid:Boolean(predictionHash)&&actual===predictionHash,expectedHash:predictionHash||null,actualHash:actual,shadowSealId:shadowSealId||null};
}

function compactCurrent(current){return{predictionVersion:current?.predictionVersion||null,terminals:(current?.terminals||[]).map(row=>({order:row.order,probability:row.probability}))}}
function compactResearch(research){return{version:research?.version||null,calibrationStatus:research?.calibrationStatus||null,calibratedProbability:null,paths:(research?.graph?.paths||[]).map(path=>({pathId:path.pathId,scenarioProbability:path.probability,states:path.nodes.map(node=>({stateType:node.stateType,outcomeCode:node.outcomeCode,status:node.status,conditionalTransitionProbability:node.conditionalTransitionProbability,calibratedProbability:null}))})),terminals:(research?.terminals||[]).map(row=>({order:row.order,terminalProbability:row.terminalProbability,calibratedProbability:null,contributions:row.contributions.map(item=>({pathId:item.pathId,contribution:item.contribution,transitionProbabilities:item.transitionProbabilities}))}))}}
function hash(value){return createHash("sha256").update(stable(value)).digest("hex")}
function stable(value){if(Array.isArray(value))return`[${value.map(stable).join(",")}]`;if(value&&typeof value==="object")return`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;return JSON.stringify(value)}
function clone(value){return typeof structuredClone==="function"?structuredClone(value):JSON.parse(JSON.stringify(value))}
