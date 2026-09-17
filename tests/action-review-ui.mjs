import assert from 'node:assert/strict';
import {RACE_REVIEW_QUESTIONS,buildRaceReviewCase,submitRaceReview} from '../research/action-tag-race-review.mjs';
import {VALUE_LABELS,QUESTION_DESCRIPTIONS,filterRaces,isGirlsRecord,labelValue,nextPendingRace,sortRaces} from '../research/action-review/ui-helpers.mjs';

assert.equal(labelValue('UNKNOWN'),'不明');
for(const q of RACE_REVIEW_QUESTIONS){assert.ok(QUESTION_DESCRIPTIONS[q.id]);for(const value of q.values)assert.ok(VALUE_LABELS[value],`${q.id}:${value}`)}
assert.deepEqual(RACE_REVIEW_QUESTIONS.map(q=>q.values),[
 ['CLEAN','CONTESTED','LONG_LEAD','UNKNOWN'],['RESERVED','NORMAL','DEPLETED','UNKNOWN'],
 ['SUPPORT_FRONT','HOLD_POSITION','SELF_LAUNCH','SWITCH','SEPARATED','UNKNOWN'],
 ['INTACT','PARTIAL_BREAK','COLLAPSED','UNKNOWN'],['SURVIVED','DID_NOT_SURVIVE','UNKNOWN']
]);
const races=[{raceKey:'20260916-B-2',date:'20260916',venue:'松阪',raceNo:2},{raceKey:'20260917-C-4',date:'20260917',venue:'立川',raceNo:4},{raceKey:'20260917-C-1',date:'20260917',venue:'立川',raceNo:1}];
assert.deepEqual(sortRaces(races).map(x=>x.raceKey),['20260917-C-1','20260917-C-4','20260916-B-2']);
assert.equal(nextPendingRace([...races,{raceKey:'20260918-X-1',date:'20260918',venue:'青森',raceNo:1,reviewed:true}],'20260917-C-1').raceKey,'20260917-C-4');
const now=new Date('2026-09-17T03:00:00Z');assert.equal(filterRaces(races,'today',now).length,2);assert.equal(filterRaces(races,'recent2',now).length,3);
const male={raceKey:'20260917-A-1',venueName:'立川',raceNo:1,participants:[{number:1,registration:'M1',className:'S1',raceCategory:'boys'}],lines:[{number:1,lineId:'A',position:1}]};
const girls={raceKey:'20260917-A-2',venueName:'立川',raceNo:2,participants:[{number:1,registration:'G1',name:'花子',className:'L1',raceCategory:'girls'}],lines:[{number:1,lineId:'solo',position:1}]};
assert.equal(isGirlsRecord(girls),true);const mc=buildRaceReviewCase({record:male}),gc=buildRaceReviewCase({record:girls});assert.equal(mc.reviewMode,'STANDARD');assert.ok(mc.questions.every(q=>q.applicability==='APPLICABLE'));assert.equal(gc.reviewMode,'GIRLS');assert.deepEqual(gc.questions.filter(q=>q.applicability==='NOT_APPLICABLE').map(q=>q.id),['banteResponse','lineState','otherLineSurvival']);assert.equal(gc.banteCandidate,null);assert.deepEqual(gc.questions.map(q=>q.values),RACE_REVIEW_QUESTIONS.map(q=>q.values));
const girlsReview=submitRaceReview(gc,{leadPressure:'UNKNOWN',energyState:'UNKNOWN'},{reviewerId:'ui-test',reviewedAt:'2026-09-17T04:00:00Z',evidenceSource:'manual-review:test'});assert.equal(girlsReview.questionCount,2);assert.equal(girlsReview.tags.length,2);assert.ok(girlsReview.tags.every(t=>!['BANTE_RESPONSE','LINE_STATE','OTHER_LINE_SURVIVAL'].includes(t.stateType)));
console.log('PASS action review Japanese UI helpers, filters, enum stability, male/girls split');
