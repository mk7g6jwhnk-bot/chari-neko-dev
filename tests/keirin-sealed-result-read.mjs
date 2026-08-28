import assert from "node:assert/strict";
import handler from "../netlify/functions/keirin-sealed-result.mjs";
import { createSealedResultController, sealedResultSummary, validateSealedResult } from "../public/sealed-result-client.mjs";
import fs from "node:fs";

const snapshot={targetRace:{date:"20260828",venueCode:"61",raceNo:7},sealedPrediction:{predictionHash:"hash",predictionSealedAt:"2026-08-28T01:00:00.000Z"}};
const payload={ok:true,raceKey:"20260828-61-7",predictionHash:"hash",predictionSealedAt:"2026-08-28T01:00:00.000Z",integrityValid:true,temporalValid:true,immutable:true,readOnly:true,officialResult:{finishOrder:[1,2,3],payout:1000},verification:{terminalRank:4,standardPurchaseHit:false},researchComparison:{calibrationStatus:"UNCALIBRATED",comparison:{research:{exactTerminalRank:2,firstMarginalRank:1,exactPairRank:2,thirdWithinPairRank:1}}},observations:{confirmedCount:3}};
assert.equal(validateSealedResult(payload,snapshot).passed,true);
for(const [field,value,reason] of [["raceKey","wrong","race_key_mismatch"],["predictionHash","wrong","prediction_hash_mismatch"],["temporalValid",false,"temporal_invalid"]]){const changed=structuredClone(payload);changed[field]=value;assert.ok(validateSealedResult(changed,snapshot).reasons.includes(reason))}
const summary=sealedResultSummary(payload);assert.equal(summary.finishOrder,"1-2-3");assert.equal(summary.current.exactRank,4);assert.equal(summary.research.exactRank,2);assert.equal(summary.research.calibrationStatus,"UNCALIBRATED");
const clientSource=fs.readFileSync(new URL("../public/sealed-result-client.mjs",import.meta.url),"utf8");assert.doesNotMatch(clientSource,/keirin-predict|fetchOfficialResult|checkResult\(/,"sealed result display must never predict or fetch an official result");assert.match(clientSource,/keirin-sealed-result/);

const original={fetch:globalThis.fetch,base:process.env.KEIRIN_BROWSER_SERVICE_URL,secret:process.env.AUTO_RESEARCH_CALLBACK_SECRET};process.env.KEIRIN_BROWSER_SERVICE_URL="https://browser.test";process.env.AUTO_RESEARCH_CALLBACK_SECRET="secret";
try{
  globalThis.fetch=async(url,options)=>{assert.match(String(url),/predictions\/sealed\/20260828-61-7\/result/);assert.equal(options.headers["x-auto-research-secret"],"secret");return new Response(JSON.stringify(payload),{status:200,headers:{"content-type":"application/json"}})};
  const response=await handler(new Request("https://app.test/.netlify/functions/keirin-sealed-result?raceKey=20260828-61-7"));assert.equal(response.status,200);assert.equal((await response.json()).predictionHash,"hash");
  globalThis.fetch=async()=>new Response("<html>bad gateway</html>",{status:502,headers:{"content-type":"text/html"}});const nonJson=await handler(new Request("https://app.test/.netlify/functions/keirin-sealed-result?raceKey=20260828-61-7"));assert.equal(nonJson.status,502);assert.equal((await nonJson.json()).code,"UPSTREAM_NON_JSON");
  globalThis.fetch=async()=>new Response(JSON.stringify({ok:false,code:"RESULT_NOT_READY"}),{status:409,headers:{"content-type":"application/json"}});assert.equal((await handler(new Request("https://app.test/.netlify/functions/keirin-sealed-result?raceKey=20260828-61-7"))).status,409);
}finally{globalThis.fetch=original.fetch;for(const [name,value] of [["KEIRIN_BROWSER_SERVICE_URL",original.base],["AUTO_RESEARCH_CALLBACK_SECRET",original.secret]])value===undefined?delete process.env[name]:process.env[name]=value}
let requestedUrl="";globalThis.fetch=async url=>{requestedUrl=String(url);return new Response(JSON.stringify({ok:false,code:"RESULT_NOT_READY"}),{status:409})};const fakePanel={classList:{add(){},remove(){}},innerHTML:"",querySelector(){return null}},controller=createSealedResultController({elementById:()=>fakePanel,raceKey:()=>"legacy-wrong-key",metas:()=>"",escapeHtml:String}),formattedSnapshot=structuredClone(snapshot);formattedSnapshot.targetRace.date="2026-08-28";await controller.load(formattedSnapshot);assert.match(requestedUrl,/raceKey=20260828-61-7$/);globalThis.fetch=original.fetch;
console.log("OK sealed result proxy/client tests");
