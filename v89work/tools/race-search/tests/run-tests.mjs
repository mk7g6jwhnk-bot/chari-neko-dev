
import assert from "node:assert/strict";
import {filterAndRankRaces} from "../src/filter-engine.mjs";
const races=[{sport:"boat",venueId:"a",startTime:"10:30",confidence:4,payoutBand:"高配当",mainHighPayout:true,engineExpectedValue:1.2,dataQualityScore:.9},{sport:"keirin",venueId:"b",startTime:"14:00",confidence:3,payoutBand:"固め",mainHighPayout:false,engineExpectedValue:1.0,dataQualityScore:.8}];
assert.equal(filterAndRankRaces(races,{venues:["a"]}).length,1);
assert.equal(filterAndRankRaces(races,{startTime:"10:00",endTime:"11:00"}).length,1);
assert.equal(filterAndRankRaces(races,{featuredOnly:true})[0].venueId,"a");
console.log("Race search tests passed.");
