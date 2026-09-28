import assert from 'node:assert/strict';
import {run} from '../research/reaggregate-corrected-results.mjs';
const row=i=>({raceKey:`20260901-21-${i}`,rank:i,actual:[1,2,3]}),loader=async({cohort})=>({rows:cohort.raceKeys.map((_,i)=>row(i+1)),exclusions:[],hashes:{predictionMismatch:0,purchaseMismatch:0,sealedResultMismatch:0},sourceFetch:{bytes:1}});
assert.equal(typeof run,'function');
assert.equal((await import('../research/reaggregate-corrected-results.mjs')).run,run);
console.log('corrected result reaggregation module: PASS');
