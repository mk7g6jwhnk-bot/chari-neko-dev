import assert from "node:assert/strict";
import {buildLineText,resolveOfficialLines} from "../netlify/functions/keirin-predict.mjs";

const officialLines=[
  {number:9,position:1,className:"line-1"},{number:1,position:2,className:"line-1"},{number:7,position:3,className:"line-1"},{number:4,position:4,className:"line-1"},
  {number:3,position:1,className:"line-2"},{number:5,position:2,className:"line-2"},{number:2,position:3,className:"line-2"},{number:8,position:4,className:"line-2"},{number:6,position:5,className:"line-2"}
];
const participants=[1,2,3,4,5,6,7,8,9].map(number=>({number,id:String(number),name:String(number)}));
const text=buildLineText(officialLines);
assert.equal(text,"9174 35286");
const resolved=resolveOfficialLines({participants,officialLines,lineText:text});
const byNo=new Map(resolved.participants.map(p=>[p.number,p]));
assert.equal(byNo.get(9).role,"自力");assert.equal(byNo.get(1).role,"番手");assert.equal(byNo.get(7).lineOrder,3);assert.equal(byNo.get(4).lineOrder,4);
assert.equal(byNo.get(3).role,"自力");assert.equal(byNo.get(5).role,"番手");assert.equal(byNo.get(6).lineOrder,5);
console.log("PASS official line front-to-back regression");
