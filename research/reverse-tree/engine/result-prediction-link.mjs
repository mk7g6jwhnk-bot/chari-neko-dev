import fs from "node:fs/promises";
import path from "node:path";
import { learnRace } from "./learning.mjs";

const RESULTS_DIR = process.env.CHARI_NEKO_RESULTS_DIR || "./research/results";
const PREDICTIONS_DIR = process.env.CHARI_NEKO_PREDICTIONS_DIR || "./research/predictions";
const OUT_DIR = process.env.CHARI_NEKO_LEARNING_OUTPUT || "./research/learning";

export async function linkResultsToPredictions() {
  const results = await loadRecords(RESULTS_DIR);
  const predictions = await loadRecords(PREDICTIONS_DIR);

  const predictionIndex = new Map();
  for (const p of predictions) {
    const key = raceKey(p);
    if (key) predictionIndex.set(key, p);
  }

  const linked = [];
  const unpredicted = [];

  for (const result of results) {
    if (!isVerifiedResult(result)) continue;

    const key = raceKey(result);
    const prediction = predictionIndex.get(key);

    if (prediction) {
      linked.push(makeLearningRecord(result, prediction));
    } else {
      // 未予想レースも結果構造学習へ送る
      linked.push(makeLearningRecord(result, null));
      unpredicted.push(key);
    }
  }

  const learned = linked.map(makeLearnedRecord);
  const output = {
    version: "RESULT-PREDICTION-LINK-0.1.0",
    generatedAt: new Date().toISOString(),
    resultRecords: results.length,
    predictionRecords: predictions.length,
    linkedRaces: linked.length - unpredicted.length,
    unpredictedRaces: unpredicted.length,
    records: learned,
    safeguards: {
      sameRaceKeyRequired: true,
      resultMustBeVerified: true,
      unpredictedResultLearningEnabled: true,
      predictionErrorOnlyWhenPredictionExists: true,
      productionAutoApply: false
    }
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(
    path.join(OUT_DIR, "result-prediction-linked-learning.json"),
    JSON.stringify(output, null, 2)
  );

  return output;
}

function makeLearningRecord(result, prediction) {
  return {
    ...result,
    prediction: prediction || null,
    predictionSeal: prediction?.predictionSeal === true ||
      prediction?.predictionSealed === true,
    predictionState: prediction?.predictionState || null,
    reverseTree: prediction?.reverseTree || result.reverseTree || { hypotheses: [] }
  };
}

function makeLearnedRecord(record) {
  return {
    raceKey: raceKey(record),
    predictionExists: Boolean(record.prediction),
    ...learnRace(record)
  };
}

function isVerifiedResult(r) {
  return Boolean(
    r &&
    (r.verificationState === "VERIFIED" ||
     r.verificationState === "RESULT_VERIFIED") &&
    Array.isArray(r.result?.order) &&
    r.result.order.length >= 3
  );
}

function raceKey(r) {
  const race = r.race || r;
  const date = String(race.date || r.date || "").replaceAll("-", "");
  const venueCode = String(
    race.venueCode || r.venueCode || race.venueName || r.venueName || ""
  ).trim().toLowerCase();
  const raceNo = String(race.raceNo || r.raceNo || "").padStart(2, "0");
  return `${date}|${venueCode}|${raceNo}`;
}

async function loadRecords(dir) {
  const files = await collect(dir);
  const records = [];
  for (const file of files) {
    const text = await fs.readFile(file, "utf8");
    if (file.endsWith(".jsonl")) {
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        try { records.push(JSON.parse(line)); } catch {}
      }
    } else {
      try {
        const value = JSON.parse(text);
        records.push(...(Array.isArray(value) ? value : [value]));
      } catch {}
    }
  }
  return records;
}

async function collect(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...await collect(p));
    else if (/\.(json|jsonl)$/i.test(e.name)) files.push(p);
  }
  return files;
}
