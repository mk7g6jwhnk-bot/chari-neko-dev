import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../research/diagnose-natural-convergence-29.mjs';

assert.equal(typeof run, 'function');
const here = path.dirname(fileURLToPath(import.meta.url));
const result = JSON.parse(await fs.readFile(path.join(here, '..', 'research', 'historical-result-reaggregation', '2026-09-29', 'natural-convergence-29-diagnostic.json'), 'utf8'));
assert.deepEqual(result.cohort, { failureNc: 29, matched505: 22, expansion130: 7, controlFalsePositive: 7, controlNegative: 64, invalid: 0, overlap: 0, missing: 0, protectedFinalUsed: 0, unknownUsed: 0 });
assert.equal(result.implementationAudit.directInputToTerminalScore, false);
assert.deepEqual(result.counterfactual.neutralizeNcDifference, { flip: 0, tie: 0, unchanged: 29, wrongSideEffect: 0 });
assert.equal(result.safety.productionChanged, false);
assert.equal(result.safety.shadowImplemented, false);
assert.equal(result.safety.parameterTuned, false);
assert.equal(result.safety.resultLeakage, 0);
console.log('natural convergence 29 diagnostic: PASS');
