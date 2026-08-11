import assert from"node:assert/strict";import{loadPromotionReviews,promotionReviewFor,savePromotionReview,summarizePromotionReviews}from"../public/prediction-store.mjs";
const mem=new Map(),storage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,String(v))};
let r=savePromotionReview(storage,{packageKey:"FIRST|MAKURI_REACH_N|natural|0.6800|0.8100",packageFingerprint:"TEST-FP",decision:"APPROVE_SHADOW",note:"shadowへ"});
assert.equal(r.productionWriteAllowed,false);assert.equal(r.shadowActivationAllowed,true);assert.equal(promotionReviewFor(storage,r.packageKey).decision,"APPROVE_SHADOW");
r=savePromotionReview(storage,{packageKey:r.packageKey,decision:"HOLD",note:"追加データ"});
assert.equal(r.previousDecision,"APPROVE_SHADOW");assert.equal(loadPromotionReviews(storage).length,1);
const s=summarizePromotionReviews(storage);assert.equal(s.hold,1);assert.equal(s.approvedShadow,0);assert.equal(s.productionWriteAllowed,false);
console.log("PASS manual promotion review registry + production guard");
