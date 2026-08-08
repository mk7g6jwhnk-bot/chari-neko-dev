import assert from "node:assert/strict";
import {extractMeetingIdentity,findTargetDayRequest,readPc0201Data} from "../src/keirin-discover.mjs";

const data={selKaisai:"20260808",selKjyoCd:"55",C0201race:Array.from({length:12},()=>({flgActvRaceBtn:true})),C0201kaisai:[{txtEventDate:"08/08",encParaK:"target-token"}]};
const html=`<script>var jsonData={}; jsonData['PC0201'] = ${JSON.stringify({C0201data:data})};</script>`;
assert.deepEqual(readPc0201Data(html),data);
assert.deepEqual(extractMeetingIdentity(data,"20260808","55"),{returnedDate:"20260808",returnedVenueCode:"55",raceNumbers:[1,2,3,4,5,6,7,8,9,10,11,12],identityPassed:true});
assert.equal(extractMeetingIdentity(data,"20260807","55").identityPassed,false);
assert.equal(extractMeetingIdentity(data,"20260808","28").identityPassed,false);
const other={...data,selKaisai:"20260807"};
assert.deepEqual(findTargetDayRequest(other,"20260808","55",{url:"https://keirin.jp/pc/racelist",encp:"old",disp:"PJ0302"}),{url:"https://keirin.jp/pc/racelist",encp:"target-token",disp:"PJ0305"});
console.log("keirin discover identity fixtures: ok");
