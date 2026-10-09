import assert from"node:assert/strict";
import fs from"node:fs/promises";
import{detailPredictionActionModel,DETAIL_PREDICTION_ACTIONS as A}from"../public/detail-prediction-actions.mjs";
import{canonicalPurchaseIdentity}from"../public/canonical-prediction-cache.mjs";

const app=await fs.readFile(new URL("../public/app.mjs",import.meta.url),"utf8"),css=await fs.readFile(new URL("../public/styles.css",import.meta.url),"utf8"),index=await fs.readFile(new URL("../public/index.html",import.meta.url),"utf8"),netlify=await fs.readFile(new URL("../netlify.toml",import.meta.url),"utf8");
const cases=[];
const check=(name,fn)=>{fn();cases.push(name)};

check("saved valid view",()=>assert.equal(detailPredictionActionModel({hasSnapshot:true,hasSavedHash:true}).primary.action,A.VIEW_SAVED));
check("stale reload",()=>assert.equal(detailPredictionActionModel({hasSavedHash:true,canonicalStatus:"SAVED_STALE"}).primary.action,A.RELOAD_SAVED));
check("read failure reload",()=>assert.equal(detailPredictionActionModel({hasSavedHash:true,canonicalStatus:"UNAVAILABLE"}).primary.label,"再読み込み"));
check("checking disabled",()=>assert.equal(detailPredictionActionModel({hasSavedHash:true,canonicalStatus:"CHECKING",lookupBusy:true}).primary.disabled,true));
check("unsealed predict",()=>assert.equal(detailPredictionActionModel({timeKnown:true}).primary.action,A.CREATE_PREDICTION));
check("saved update explicit",()=>assert.equal(detailPredictionActionModel({hasSnapshot:true}).secondary.action,A.UPDATE_PREDICTION));
check("ended update hidden",()=>assert.equal(detailPredictionActionModel({hasSnapshot:true,ended:true}).secondary.visible,false));
check("ended stale update visible but disabled",()=>{const model=detailPredictionActionModel({hasSavedHash:true,canonicalStatus:"UNAVAILABLE",ended:true});assert.equal(model.secondary.visible,true);assert.equal(model.secondary.disabled,true)});
check("result only",()=>assert.equal(detailPredictionActionModel({ended:true,hasResult:true}).primary.label,"公式結果を更新"));
check("reload bypasses local body cache",()=>assert.match(app,/if\(!forceNetwork\)try\{const cached=await getSealedPredictionCache/));
check("reload never predicts",()=>{const body=app.match(/async function reloadSavedPrediction[\s\S]+?(?=function openSealedSummary)/u)?.[0]||"";assert.doesNotMatch(body,/\bpredict\(/)});
check("canonical metadata and body only",()=>{assert.match(app,/keirin-saved-prediction-detail\?raceKey=.*metadata=1/s);assert.match(app,/predictionHash=\$\{encodeURIComponent\(metadata\.predictionHash\)\}/)});
check("manual update uses refresh flow",()=>assert.match(app,/UPDATE_PREDICTION\)\{void predict\(\{refresh:true\}\)/));
check("double tap guards",()=>assert.match(app,/handleDetailPrimary\(\).*state\.sealedLookupBusy\|\|state\.busy/s));
check("stale local is not promoted",()=>assert.match(app,/state\.snapshot=null;state\.legacySnapshot=local\|\|legacySnapshotForRace/));
check("mobile actions",()=>{assert.match(css,/\.savedRecoveryActions\{display:grid/);assert.match(css,/@media\(max-width:390px\)\{\.savedRecoveryActions\{grid-template-columns:1fr\}\}/)});
check("unambiguous V2 legacy world class",()=>{const identity=canonicalPurchaseIdentity({tickets:[{order:[1,4,2],macroScenarioId:"MS-A",eventId:"MS-A:E1",terminalId:"MS-A:E1:T1",ticketClass:"MAIN",scenarioPurchaseClass:null}]});assert.equal(identity.tickets[0].scenarioPurchaseClass,"MAIN")});
check("ambiguous cover world class stays unknown",()=>{const identity=canonicalPurchaseIdentity({tickets:[{order:[1,4,3],macroScenarioId:"MS-A",eventId:"MS-A:E1",terminalId:"MS-A:E1:T2",ticketClass:"COVER",scenarioPurchaseClass:null}]});assert.equal(identity.tickets[0].scenarioPurchaseClass,null)});
check("stale card and actions share model state",()=>assert.match(app,/savedReadFailed=actionModel\.state==="SAVED_STALE"/));
check("foreground PWA polls release",()=>{assert.match(app,/setInterval\(\(\)=>\{if\(document\.visibilityState!=="visible"\)return;checkForAppUpdate\(\)/);assert.match(app,/appReload/)});
check("module cache busting",()=>{assert.match(index,/app\.mjs\?v=75/);assert.match(netlify,/for = "\/\*\.mjs"[\s\S]+no-cache, no-store, must-revalidate/)});
check("canonical saved response boundary",()=>{assert.match(app,/resolvePredictionResponse\(response,fixed\)/);assert.match(app,/resolved\.canonicalEnvelope\?saveCanonicalSnapshot/)});
check("direct saved detail opens purchase layout after canonical read",()=>{const body=app.match(/async function reloadSavedPrediction[\s\S]+?(?=function openSealedSummary)/u)?.[0]||"";assert.match(body,/canonicalSnapshotStatus==="VALID"&&Boolean\(state\.snapshot\)/);assert.match(body,/if\(valid\)renderPrediction\(state\.snapshot\)/)});

console.log(JSON.stringify({ok:true,cases:cases.length,names:cases}));
