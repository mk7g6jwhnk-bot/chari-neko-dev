
import {buildReverseTree} from "./reverse-tree.mjs";
import {dictionary as keirin} from "../dictionaries/keirin.mjs";
import {dictionary as boat} from "../dictionaries/boat.mjs";
import {dictionary as auto} from "../dictionaries/auto.mjs";
const dicts={keirin,boat,auto};
export function runReverseTree(input){
  if(!dicts[input.sport])throw new Error(`未対応競技:${input.sport}`);
  return buildReverseTree({...input,dictionary:dicts[input.sport]});
}
