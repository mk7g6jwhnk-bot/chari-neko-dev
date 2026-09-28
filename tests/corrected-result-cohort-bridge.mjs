import assert from 'node:assert/strict';
import {run} from '../research/audit-corrected-result-cohort-bridge.mjs';
assert.equal(typeof run,'function');
console.log('corrected result cohort bridge module: PASS');
