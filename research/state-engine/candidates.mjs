import crypto from "node:crypto";
import { runResearchStateGraph } from "./state-engine.mjs";
import { generateResearchTerminals } from "./terminal-generator.mjs";

export const RESEARCH_CANDIDATES=Object.freeze([
 candidate("RESEARCH_CANDIDATE_FOURTH_CORNER","FOURTH_CORNER_POSITION"),candidate("RESEARCH_CANDIDATE_LINE_TRACKING","LINE_TRACKING"),candidate("RESEARCH_CANDIDATE_OTHER_LINE_SURVIVAL","OTHER_LINE_SURVIVAL"),candidate("RESEARCH_CANDIDATE_SECOND_CONDITIONAL","SECOND"),candidate("RESEARCH_CANDIDATE_THIRD_CONDITIONAL","THIRD")
]);

export function runIsolatedResearchCandidates({sealedInput,candidates=RESEARCH_CANDIDATES,runner=runBaseline}={}){
 if(sealedInput?.result||sealedInput?.officialResult)throw new Error("RESULT_DATA_FORBIDDEN_IN_CANDIDATE_INPUT");const inputHash=hash(sealedInput),baseline=runner(structuredClone(sealedInput));
 return{version:"ISOLATED-RESEARCH-CANDIDATES-1.0",inputHash,baseline:{candidateId:"RESEARCH_BASELINE",inputHash,output:baseline},candidates:candidates.map(definition=>({definition,inputHash,output:runner(structuredClone(sealedInput),definition)})),sameSealedInput:true,productionWriteAllowed:false,autoPromotion:false};
}
function candidate(candidateId,affectedStage){return Object.freeze({candidateId,affectedStage,changeCount:1,status:"SHADOW_ACTIVE",sourceEvidence:[affectedStage],overlapsWithProductionFeature:overlap(affectedStage),duplicationRisk:"REQUIRES_EXPLICIT_DEDUPLICATION_REVIEW",derivedFrom:["IMMUTABLE_PRE_RACE_INPUT","RESEARCH_STATE_GRAPH"],excludedProductionFields:["recentForm","startPower","trackingSkill","lineTrust","productionWeights","branchProbability","terminalProbability"],requiredSample:100,validationCohort:"COHORT_B_101_PLUS",productionWriteAllowed:false})}
function overlap(stage){return({LINE_TRACKING:["trackingSkill"],FOURTH_CORNER_POSITION:["production terminal position scoring"],OTHER_LINE_SURVIVAL:["production branch support"],SECOND:["second role score"],THIRD:["third role score"]})[stage]||[]}
function runBaseline(input){const graph=runResearchStateGraph(input);return{graph,terminals:generateResearchTerminals(graph).terminals}}
function hash(v){return crypto.createHash("sha256").update(stable(v)).digest("hex")}function stable(v){if(Array.isArray(v))return`[${v.map(stable).join(",")}]`;if(v&&typeof v==="object")return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;return JSON.stringify(v)}
