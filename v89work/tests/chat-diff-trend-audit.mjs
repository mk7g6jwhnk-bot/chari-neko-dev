import assert from"node:assert/strict";
import{recordChatDiffTrend,loadChatDiffTrends,summarizeChatDiffTrends}from"../public/chat-diff-trend-store.mjs";
class Mem{m=new Map();getItem(k){return this.m.get(k)??null}setItem(k,v){this.m.set(k,String(v))}}
const st=new Mem();
const race1={date:"20260810",venueCode:"11",venueName:"函館",raceNo:1};
const race2={date:"20260810",venueCode:"11",venueName:"函館",raceNo:2};
const cmp=(first,cls,pur)=>({firstDivergence:{stage:first},stages:[
{stage:"FIRST_PLACE_EVALUATION",status:"DIFF",details:{}},
{stage:"PAIR_BRANCH",status:"OK",details:{}},
{stage:"TERMINAL_GENERATION",status:"OK",details:{}},
{stage:"BET_CLASSIFICATION",status:cls?"DIFF":"OK",details:{rows:cls?[1,2,3]:[]}},
{stage:"PURCHASE_DECISION",status:pur?"DIFF":"OK",details:{rows:pur?[1,2,3,4]:[]}},
],totals:{chatTerminals:13,appTerminals:210,chatPurchased:13,appPurchased:19}});
recordChatDiffTrend(st,race1,cmp("FIRST_PLACE_EVALUATION",true,true));
recordChatDiffTrend(st,race2,cmp("FIRST_PLACE_EVALUATION",true,true));
let rows=loadChatDiffTrends(st);assert.equal(rows.length,2);
let summary=summarizeChatDiffTrends(rows);assert.equal(summary.raceCount,2);assert.equal(summary.priority.stage,"FIRST_PLACE_EVALUATION");assert.equal(summary.stages.find(x=>x.stage==="BET_CLASSIFICATION").diffItems,6);
recordChatDiffTrend(st,race1,cmp("BET_CLASSIFICATION",false,true));
rows=loadChatDiffTrends(st);assert.equal(rows.length,2,"same race must replace instead of duplicate");
console.log("Chat diff trend audit passed");
