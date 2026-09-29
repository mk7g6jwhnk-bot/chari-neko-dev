import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../research/audit-conditional-second-observability-71.mjs';

assert.equal(typeof run, 'function');
const here = path.dirname(fileURLToPath(import.meta.url));
const result = JSON.parse(await fs.readFile(path.join(here, '..', 'research', 'historical-result-reaggregation', '2026-09-29', 'conditional-second-observability-audit.json'), 'utf8'));
assert.equal(result.verdict, 'OBSERVABILITY_INSUFFICIENT');
assert.equal(result.cohort.failure, 71);
assert.equal(result.cohort.control, 71);
assert.equal(result.cohort.protectedFinalUsed, 0);
assert.equal(result.futureTrace.productionLogicImpact, 'NONE');
assert.equal(result.safety.sealedPredictionMutation, 0);
assert.equal(result.safety.resultLeakage, 0);
console.log('conditional second observability 71: PASS');
