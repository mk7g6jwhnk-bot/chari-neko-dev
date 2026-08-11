import assert from"node:assert/strict";import{auditWorldFactTransition}from"../keirin/sports/keirin-terminals.mjs";
let x=auditWorldFactTransition({winnerMechanism:"MAKURI_SUCCESS"},[{id:"C1",requires:{winnerMechanism:"MAKURI_SUCCESS"},sets:{lineIntegrity:"INTACT"}}],{second:2});assert.equal(x.passed,true);assert.equal(x.facts.second,2);
x=auditWorldFactTransition({lineIntegrity:"BROKEN"},[{id:"C2",forbids:{lineIntegrity:"BROKEN"}}],{});assert.equal(x.passed,false);assert.match(x.conflicts[0],/両立不可/);
x=auditWorldFactTransition({winnerMechanism:"LEADER_HOLD"},[{id:"C3",sets:{winnerMechanism:"BANTE_SASHI"}}],{});assert.equal(x.passed,false);assert.match(x.conflicts[0],/親状態/);
console.log("PASS reusable world-fact transition contradiction engine");