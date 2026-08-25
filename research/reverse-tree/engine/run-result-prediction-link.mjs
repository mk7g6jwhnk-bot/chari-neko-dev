import { linkResultsToPredictions } from "./result-prediction-link.mjs";

const result = await linkResultsToPredictions();
console.log(JSON.stringify({
  resultRecords: result.resultRecords,
  predictionRecords: result.predictionRecords,
  linkedRaces: result.linkedRaces,
  unpredictedRaces: result.unpredictedRaces
}, null, 2));
