import assert from "node:assert/strict";
import { buildDisplayPredictionPayload } from "../netlify/functions/keirin-predict.mjs";

const selected={order:[1,2,3],probability:.12,betClass:"MAIN",scenarioExplanation:"展開説明"};
const full={ok:true,race:{date:"20260830",venueCode:"22",venue:"前橋",raceNo:1,participants:[{number:1}]},odds:{odds:{}},prediction:{engineVersion:"TEST",scored:[{number:1}],purchasePlan:[selected],standardPurchasePlan:[selected],referencePurchasePlan:[],terminals:Array.from({length:210},(_,index)=>({order:[1,2,(index%7)+1],probability:1/210,nodeTrace:Array(30).fill({debug:"x".repeat(100)})})),branches:Array(20).fill({debug:"x".repeat(1000)}),audit:{passed:true,probabilitySum:1,terminalCount:210,debug:Array(200).fill("x".repeat(1000))}},predictionSealedAt:"2026-08-30T00:00:00Z"};
const display=buildDisplayPredictionPayload(full),fullBytes=Buffer.byteLength(JSON.stringify(full)),displayBytes=Buffer.byteLength(JSON.stringify(display));
assert.equal(display.prediction.purchasePlan.length,1);
assert.equal(display.prediction.terminals.every(item=>item.order.join("-")==="1-2-3"),true);
assert.equal(display.prediction.branches,undefined);
assert.ok(displayBytes<fullBytes*.2,{fullBytes,displayBytes});
console.log("PASS display payload",{fullBytes,displayBytes,reduction:1-displayBytes/fullBytes});
