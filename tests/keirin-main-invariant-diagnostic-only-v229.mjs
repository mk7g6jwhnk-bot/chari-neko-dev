import assert from "node:assert/strict";
import {resolvePurchaseBlock} from "../keirin/engine/purchase-engine.mjs";

const invariantOnly=resolvePurchaseBlock({mainInvariantFailed:true});
assert.equal(invariantOnly.blocked,false,"MAIN invariant failure must not erase COVER/BUYABLE_HIGH candidates");
assert.equal(invariantOnly.mainInvariantDiagnostic,true);
assert.equal(invariantOnly.mainInvariantHardBlock,false);

const evidenceBlock=resolvePurchaseBlock({mainInvariantFailed:true,lineAndStartEvidenceBlocked:true});
assert.equal(evidenceBlock.blocked,true,"missing evidence remains a hard purchase block");
console.log("PASS v229 MAIN invariant is diagnostic-only; evidence blockers remain hard blocks");
