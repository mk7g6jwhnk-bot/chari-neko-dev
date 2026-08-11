import assert from "node:assert/strict";
import {selectNaturalBranchTiers,selectAdaptiveMainCluster} from "../keirin/sports/keirin-branches.mjs";

const branches=[
  {id:"a",score:8.58},{id:"b",score:8.00},{id:"c",score:7.50},
  {id:"d",score:5.57},{id:"e",score:5.39},{id:"f",score:5.28},{id:"g",score:5.20}
];
const tiers=selectNaturalBranchTiers(branches);
assert.deepEqual(tiers.main.map(branch=>branch.id),["a"],"core scenario must not be a forced upper 2-cluster");
assert.deepEqual(tiers.contender.map(branch=>branch.id),["b","c"],"near-top branches before the robust lower break remain contenders");
assert.deepEqual(tiers.sub.map(branch=>branch.id),["d","e","f","g"]);
assert.deepEqual(selectAdaptiveMainCluster(branches).map(branch=>branch.id),["a"],"compatibility export uses the new core tier semantics");

const flat=selectNaturalBranchTiers([{id:"x",score:5},{id:"y",score:5},{id:"z",score:5}]);
assert.equal(flat.main.length,0,"when all scores are equal, do not invent a core winner");
assert.equal(flat.contender.length,0,"equal scores do not justify a forecast contender");
assert.deepEqual(flat.sub.map(branch=>branch.id),["x","y","z"],"equal-score branches remain possible only");

const noLowerBreak=selectNaturalBranchTiers([
  {id:"a",score:7.0},{id:"b",score:6.6},{id:"c",score:6.4},{id:"d",score:6.2}
]);
assert.deepEqual(noLowerBreak.main.map(branch=>branch.id),["a"]);
assert.equal(noLowerBreak.contender.length,0,"without a natural boundary, mere possibility must not be promoted to forecast contender");
assert.deepEqual(noLowerBreak.sub.map(branch=>branch.id),["b","c","d"],"non-core branches stay possible when no secondary group is evidenced");
console.log("Keirin natural branch tiers passed:",tiers.main.map(x=>x.id).join(","),"/",tiers.contender.map(x=>x.id).join(","),"/",tiers.sub.map(x=>x.id).join(","));
