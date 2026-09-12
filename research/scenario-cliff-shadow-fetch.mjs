// Read-only reproduction runner. It only reads already sealed prediction/result records.
import fs from "node:fs/promises";
import { evaluateScenarioCliffShadow, evaluateScenarioCliffFourWay } from "./scenario-cliff-shadow.mjs";

const base = process.env.AUDIT_BASE_URL || "https://chari-neko-dev.netlify.app/.netlify/functions";
const keySource = JSON.parse(await fs.readFile(process.argv[2] || "research/thick-readonly-audit-results.json", "utf8"));
const keys = [...new Set((keySource.ticketDiagnostics || []).filter(row => row.inConfirmedCohort).map(row => row.raceKey))];
const records = [], failures = [];
async function read(route) {
  let last;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`${base}/${route}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(45000) });
      if (response.ok) return response.json();
      last = new Error(`HTTP ${response.status}`);
    } catch (error) { last = error; }
    if (attempt < 4) await new Promise(resolve => setTimeout(resolve, attempt * 500));
  }
  throw last;
}
for (let offset = 0; offset < keys.length; offset += 3) {
  const batch = keys.slice(offset, offset + 3);
  const rows = await Promise.all(batch.map(async raceKey => {
    try {
      const [prediction, result] = await Promise.all([
        read(`keirin-saved-prediction-detail?raceKey=${encodeURIComponent(raceKey)}`),
        read(`keirin-sealed-result?raceKey=${encodeURIComponent(raceKey)}`)
      ]);
      const sealedPrediction = prediction.predictionPayload?.prediction || prediction.prediction || prediction.researchPrediction || prediction;
      const sealedResult = result.officialResult ? { result: result.officialResult } : result.result?.result ? result.result : result.result ? { result: result.result } : { result };
      return { raceKey, sealed: { predictionSealedAt: prediction.predictionSealedAt, researchPrediction: sealedPrediction }, result: sealedResult };
    } catch (error) { failures.push({ raceKey, error: error.message }); return null; }
  }));
  records.push(...rows.filter(Boolean));
}
const evaluation = process.env.SCENARIO_CLIFF_V1_ONLY === "1" ? evaluateScenarioCliffShadow(records) : evaluateScenarioCliffFourWay(records);
const output = { ...evaluation, source: "existing sealed read endpoints", requested: keys.length, readFailures: failures, productionWrite: 0 };
const serialized = `${JSON.stringify(output, null, 2)}\n`;
if (process.argv[3]) await fs.writeFile(process.argv[3], serialized); else process.stdout.write(serialized);
