import assert from "node:assert/strict";
import handler from "../netlify/functions/keirin-saved-prediction-detail.mjs";
import {createSnapshot} from "../public/prediction-store.mjs";
const hash="a".repeat(64),previous=globalThis.fetch,previousBase=process.env.KEIRIN_BROWSER_SERVICE_URL;let requested="";
try{
  process.env.KEIRIN_BROWSER_SERVICE_URL="https://railway.example";
  globalThis.fetch=async url=>{requested=String(url);return new Response(JSON.stringify({ok:true,predictionHash:hash,predictionSealedAt:"2099-01-01T00:00:00Z",predictionPayload:{artifactIdentity:{raceKey:"20990101-01-1",predictionHash:hash,sealedAt:"2099-01-01T00:00:00Z"},race:{date:"20990101",venueCode:"01",raceNo:1,participants:[]},prediction:{terminals:[],standardPurchasePlan:[]}}}),{status:200,headers:{"content-type":"application/json"}})};
  const response=await handler(new Request(`https://site.example/.netlify/functions/keirin-saved-prediction-detail?predictionHash=${hash}`)),body=await response.json();
  assert.equal(response.status,200);assert.equal(body.predictionHash,hash);assert.equal(requested,`https://railway.example/keirin/read/artifacts/${hash}`);
  const snapshot=createSnapshot(body.predictionPayload,new Date(body.predictionSealedAt));assert.equal(snapshot.predictionSnapshotId,hash);assert.equal(snapshot.canonicalPredictionIdentity.predictionHash,hash);assert.equal(Date.parse(snapshot.createdAt),Date.parse(body.predictionSealedAt));
  console.log("PASS UI/API immutable predictionHash linkage and canonical sealedAt");
}finally{globalThis.fetch=previous;if(previousBase===undefined)delete process.env.KEIRIN_BROWSER_SERVICE_URL;else process.env.KEIRIN_BROWSER_SERVICE_URL=previousBase}
