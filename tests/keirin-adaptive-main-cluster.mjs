import assert from "node:assert/strict";
import {selectAdaptiveMainCluster} from "../keirin/sports/keirin-branches.mjs";
const branches=[
  {id:"a",score:8.58},{id:"b",score:8.00},{id:"c",score:7.50},
  {id:"d",score:5.57},{id:"e",score:5.39},{id:"f",score:5.28},{id:"g",score:5.20}
];
const main=selectAdaptiveMainCluster(branches);
assert.deepEqual(main.map(branch=>branch.id),["a","b","c"]);
assert.ok(main.at(-1).score/branches[0].score<.90,"adaptive cluster must be able to cross the old fixed 90% boundary");
const flat=selectAdaptiveMainCluster([{id:"x",score:5},{id:"y",score:5},{id:"z",score:5}]);
assert.equal(flat.length,3,"when the score distribution has no separation, do not invent a cutoff");
console.log("Keirin adaptive main cluster passed:",main.map(branch=>branch.id).join(","));
