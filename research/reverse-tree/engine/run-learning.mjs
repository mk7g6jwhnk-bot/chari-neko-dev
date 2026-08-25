import { runLearningPipeline } from "./pipeline.mjs";

const result = await runLearningPipeline();
console.log(JSON.stringify(result, null, 2));
