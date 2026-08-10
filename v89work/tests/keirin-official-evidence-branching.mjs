import assert from "node:assert/strict";
import handler,{adaptParticipantsForPrediction} from "../netlify/functions/keirin-predict.mjs";

const context={raceDate:"20260808",raceStartTime:"21:00",venueCode:"24",raceNo:2,raceCategory:"standard"};
const raw=Array.from({length:7},(_,index)=>participant(index+1));
const adapted=adaptParticipantsForPrediction(raw,context);
assert.deepEqual(adapted.map(item=>item.id),["1","2","3","4","5","6","7"]);
assert.ok(adapted.some(item=>Math.abs(item.recentForm-5)>.05),"official profile must affect recentForm");
assert.ok(adapted.some(item=>Math.abs(item.startPower-5)>.05),"official profile must affect startPower");
assert.ok(adapted.some(item=>Math.abs(item.sprintPower-5)>.05),"JSJ068 must affect sprintPower");
assert.ok(adapted.some(item=>Math.abs(item.finishPower-5)>.05),"JSJ068 must affect finishPower");
assert.ok(adapted.some(item=>Math.abs(item.trackingSkill-5)>.05),"JSJ068 must affect trackingSkill");
assert.ok(adapted.every(item=>item.stamina===5),"stamina remains neutral until overlap design is validated");

const originalFetch=globalThis.fetch;
process.env.KEIRIN_BROWSER_SERVICE_URL="https://railway.test";
globalThis.fetch=async()=>new Response(JSON.stringify({
  ok:true,
  officialData:{
    basic:{venueName:"宇都宮",date:"2026/08/08",raceNo:2,startTime:"21:00",className:"S級"},
    participants:raw,
    lines:[
      {number:1,lineId:"A",position:1},{number:2,lineId:"A",position:2},
      {number:3,lineId:"B",position:1},{number:4,lineId:"B",position:2},{number:5,lineId:"B",position:3},
      {number:6,lineId:"C",position:1},{number:7,lineId:"C",position:2}
    ],
    odds:{ok:false,odds:{}}
  },
  audit:{identityPassed:true}
}),{status:200,headers:{"content-type":"application/json"}});
try{
  const response=await handler(new Request("https://test/.netlify/functions/keirin-predict?date=20260808&venueCode=24&venueName=%E5%AE%87%E9%83%BD%E5%AE%AE&raceNo=2&budget=3000"));
  const payload=await response.json();
  assert.equal(response.status,200);
  assert.equal(payload.ok,true);
  const plan=payload.prediction.purchasePlan;
  assert.ok(plan.length>0,"natural purchase plan must exist for structured fixture");
  const generated=payload.prediction.terminals||[];
  assert.ok(new Set(generated.map(item=>item.order?.[0])).size>1,"possible first-place outcomes must remain generated even when purchase centers on one forecast");
  assert.ok(plan.some(item=>item.betClass==="MAIN"));
  assert.ok(plan.every(item=>["MAIN","COVER","BUYABLE_HIGH"].includes(item.betClass)));
  assert.ok(plan.every(item=>item.dominantBranchId&&item.dominantBranchLabel));
}finally{globalThis.fetch=originalFetch;}
console.log("Official evidence + branch-conditioned purchase tests passed.");

function participant(number){
  const registration=`24${String(number).padStart(4,"0")}`;
  const makuri=number%3, sasi=(number+1)%4, mark=number%4;
  return{
    number,registration,name:`選手${number}`,className:"S級",
    officialProfile:{
      identityPassed:true,registration,fetchedAt:"2026-08-08T08:00:00Z",sourceType:"profile",sourcePath:"fixture",
      currentScore:94+number,recent4MonthScore:93+number*1.3,officialTotalStarts:18+number,
      backCount:1+(number%4),homeCount:2+(number%3),winningStyleRates:{escape:20,makuri:30,difference:30,mark:20}
    },
    officialKimariteCounts:{
      identityPassed:true,targetIdentityPassed:true,registration,fetchedAt:"2026-08-08T08:00:00Z",sourceType:"JSJ068",sourcePath:"fixture",
      target:{date:"20260808",venueCode:"24",raceNo:2},
      nige:{F_Cnt:0,S_Cnt:0,Sum_Cnt:0},
      makuri:{F_Cnt:makuri,S_Cnt:number%2,Sum_Cnt:makuri+(number%2)},
      sasi:{F_Cnt:sasi,S_Cnt:number%3,Sum_Cnt:sasi+(number%3)},
      mark:{F_Cnt:0,S_Cnt:mark,Sum_Cnt:mark},
      totalQuinellaCount:12
    }
  };
}
