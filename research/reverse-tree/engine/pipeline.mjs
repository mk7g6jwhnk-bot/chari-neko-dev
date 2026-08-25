import fs from "node:fs/promises";
import path from "node:path";
import { learnRace } from "./learning.mjs";

const DEFAULT_INPUT = process.env.CHARI_NEKO_LEARNING_INPUT || "./research/results";
const DEFAULT_OUTPUT = process.env.CHARI_NEKO_LEARNING_OUTPUT || "./research/learning";

export async function runLearningPipeline({
  inputDir = DEFAULT_INPUT,
  outputDir = DEFAULT_OUTPUT,
} = {}) {
  const files = await collectJsonFiles(inputDir);
  const records = [];

  for (const file of files) {
    const rows = await readJsonOrJsonl(file);
    for (const row of rows) {
      const learned = learnRace(row);
      if (learned.resultLearning.eligible) {
        records.push({
          source: file,
          ...learned,
        });
      }
    }
  }

  const summary = aggregate(records);
  await fs.mkdir(outputDir, { recursive: true });

  const stamp = new Date().toISOString().replaceAll(":", "-");
  const resultPath = path.join(outputDir, `learning-${stamp}.json`);
  const latestPath = path.join(outputDir, "learning-latest.json");

  await fs.writeFile(resultPath, JSON.stringify(summary, null, 2));
  await fs.writeFile(latestPath, JSON.stringify(summary, null, 2));

  return {
    inputFiles: files.length,
    eligibleRaces: records.length,
    resultPath,
    latestPath,
    summary
  };
}

async function collectJsonFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collectJsonFiles(full));
    else if (/\.(json|jsonl)$/i.test(entry.name)) files.push(full);
  }
  return files;
}

async function readJsonOrJsonl(file) {
  const text = await fs.readFile(file, "utf8");
  if (file.endsWith(".jsonl")) {
    return text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  }
  const value = JSON.parse(text);
  return Array.isArray(value) ? value : [value];
}

function aggregate(records) {
  const result = {
    version: "LEARNING-PIPELINE-0.3.0",
    generatedAt: new Date().toISOString(),
    resultLearningRaces: records.length,
    unpredictedRaces: 0,
    predictedRaces: 0,
    exactPredictionHits: 0,
    top1Hits: 0,
    nodeStats: {},
    templateStats: {},
    patternStats: {},
    safeguards: {
      verifiedResultOnly: true,
      unpredictedResultLearningEnabled: true,
      predictionErrorRequiresPredictionSeal: true,
      productionAutoApply: false
    }
  };

  for (const record of records) {
    const rl = record.resultLearning;
    if (rl.sourceType === "UNPREDICTED_RESULT") result.unpredictedRaces++;
    else result.predictedRaces++;

    merge(result.nodeStats, rl.nodeStats);
    merge(result.templateStats, rl.templateStats);
    merge(result.patternStats, rl.patternStats);

    const pe = record.predictionErrorLearning;
    if (pe.eligible) {
      if (pe.exactHit) result.exactPredictionHits++;
      if (pe.top1Hit) result.top1Hits++;
    }
  }
  return result;
}

function merge(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (!target[key]) target[key] = { ...value };
    else {
      for (const [k, v] of Object.entries(value)) {
        if (typeof v === "number" && Number.isFinite(v)) {
          target[key][k] = (target[key][k] || 0) + v;
        }
      }
    }
  }
}
