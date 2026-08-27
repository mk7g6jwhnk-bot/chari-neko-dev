import{runKeirinPredictionEngine}from"../../keirin/engine/prediction-engine.mjs";
import{runResearchStateGraph}from"./state-engine.mjs";
import{generateResearchTerminals}from"./terminal-generator.mjs";
import{assertTemporalIntegrity}from"./temporal-guard.mjs";

export function runCurrentResearchParallel({race,venueProfile={},inputObservedAt,predictionSealedAt}){
  const temporalAudit=assertTemporalIntegrity({inputObservedAt,predictionSealedAt});
  const current=runKeirinPredictionEngine({race,venueProfile});
  const graph=runResearchStateGraph({race,venueProfile});
  const terminalOutput=generateResearchTerminals(graph);
  return{
    version:"CURRENT-RESEARCH-PARALLEL-MVP-1.0",mode:"SHADOW_RESEARCH_ONLY",
    raceId:race.id||null,inputObservedAt:temporalAudit.inputObservedAt,predictionSealedAt:temporalAudit.predictionSealedAt,
    current:{predictionVersion:current.predictionVersion,terminals:current.terminals},
    research:{version:graph.version,calibrationStatus:graph.calibrationStatus,calibratedProbability:null,graph,terminals:terminalOutput.terminals,audit:terminalOutput.audit},
    audit:{temporalAudit,currentEngineMutated:false,purchaseEngineConnected:false,oddsUsed:false,apiResponseConnected:false,productionWriteAllowed:false}
  };
}
