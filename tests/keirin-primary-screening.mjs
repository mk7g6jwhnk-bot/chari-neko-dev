import assert from "node:assert/strict";
import {buildScreeningPreview} from "../netlify/functions/keirin-odds.mjs";
const officialData={basic:{className:"S級"},participants:Array.from({length:9},(_,i)=>({number:i+1,className:"S1"})),lines:[
 {number:9,position:1,className:"line-1"},{number:1,position:2,className:"line-1"},{number:7,position:3,className:"line-1"},{number:4,position:4,className:"line-1"},
 {number:3,position:1,className:"line-2"},{number:5,position:2,className:"line-2"},{number:2,position:3,className:"line-2"},{number:8,position:4,className:"line-2"},{number:6,position:5,className:"line-2"}]};
const odds={odds:Object.fromEntries(Array.from({length:30},(_,i)=>[`1-2-${(i%7)+3>9?3:(i%7)+3}`,10+i*5]))};
const r=buildScreeningPreview(officialData,odds);
assert.equal(r.lineVerified,true);assert.deepEqual(r.lineGroups[0].numbers,[9,1,7,4]);assert.equal(r.stage,"PRIMARY_SCREENING");
const girls=buildScreeningPreview({basic:{className:"L級ガ予"},participants:Array.from({length:7},(_,i)=>({number:i+1})),lines:[]},{odds:{"1-2-3":20,"2-1-3":30}});
assert.equal(girls.raceCategory,"girls");assert.equal(girls.fixedLineApplicable,false);
console.log("PASS primary screening preview");
