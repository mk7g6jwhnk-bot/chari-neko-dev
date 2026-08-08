import { chromium } from "playwright";

const BASE = "https://keirin.jp";
const VENUES = {
  "11":"函館","12":"青森","13":"いわき平","21":"弥彦","22":"前橋","23":"取手",
  "24":"宇都宮","25":"大宮","26":"西武園","27":"京王閣","28":"立川","31":"松戸",
  "34":"川崎","35":"平塚","36":"小田原","37":"伊東","38":"静岡","42":"名古屋",
  "43":"岐阜","44":"大垣","45":"豊橋","46":"富山","47":"松阪","48":"四日市",
  "51":"福井","53":"奈良","54":"向日町","55":"和歌山","56":"岸和田","61":"玉野",
  "62":"広島","63":"防府","71":"高松","73":"小松島","74":"高知","75":"松山",
  "81":"小倉","83":"久留米","84":"武雄","85":"佐世保","86":"別府","87":"熊本"
};

export async function fetchKeirinOfficialMeetings({ date }) {
  const browser = await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  const context = await browser.newContext({locale:"ja-JP",timezoneId:"Asia/Tokyo",userAgent:"Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 Chrome/122.0.0.0 Mobile Safari/537.36"});
  const page = await context.newPage();
  const scheduleUrl=`${BASE}/pc/raceschedule?scyy=${date.slice(0,4)}&scym=${date.slice(4,6)}`;
  try {
    const response=await page.goto(scheduleUrl,{waitUntil:"domcontentloaded",timeout:30000});
    if(!response?.ok()) throw new Error(`official schedule HTTP ${response?.status()||0}`);
    const candidates=await readScheduleCandidates(page,date,VENUES);
    const meetings=[];
    const rejected=[];
    for(const candidate of candidates){
      try{
        let official=await postOfficial(context,candidate.officialRequest,scheduleUrl);
        let data=readPc0201Data(official.html);
        const targetRequest=findTargetDayRequest(data,date,candidate.venueCode,candidate.officialRequest);
        if(targetRequest){
          official=await postOfficial(context,targetRequest,candidate.officialRequest.url);
          data=readPc0201Data(official.html);
        }
        const identity=extractMeetingIdentity(data,date,candidate.venueCode);
        if(!identity.identityPassed||!identity.raceNumbers.length){
          rejected.push({venueCode:candidate.venueCode,venueName:candidate.venueName,...identity});
          continue;
        }
        meetings.push({
          date,
          venueCode:candidate.venueCode,
          venueName:candidate.venueName,
          raceNumbers:identity.raceNumbers,
          identityPassed:true
        });
      }catch(error){
        rejected.push({venueCode:candidate.venueCode,venueName:candidate.venueName,error:error instanceof Error?error.message:String(error)});
      }
    }
    return {ok:true,date,meetings,diagnostics:{candidateCount:candidates.length,verifiedCount:meetings.length,rejected,parserMode:"existing-logical-colspan-data-pprm-C0201-v053"},checkedAt:new Date().toISOString()};
  } finally {
    await browser.close();
  }
}

async function readScheduleCandidates(page,date,venues){
  return page.evaluate(({date,venues})=>{
    const day=Number(date.slice(6,8)),norm=value=>String(value||"").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
    const entries=Object.entries(venues),found=new Map();
    for(const table of document.querySelectorAll("table")){
      let header=null;
      for(const tr of table.querySelectorAll("tr")){
        const cells=[...tr.children].filter(x=>x.matches("th,td"));
        const dayToColumn=new Map();let venueIndex=0,logicalColumn=0;
        cells.forEach((cell,index)=>{const text=norm(cell.textContent);if(/競輪場/.test(text))venueIndex=index;if(/^\d{1,2}$/.test(text)){const n=Number(text);if(n>=1&&n<=31&&!dayToColumn.has(n))dayToColumn.set(n,logicalColumn);}logicalColumn+=Math.max(1,Number.parseInt(cell.getAttribute("colspan")||"1",10)||1);});
        if(dayToColumn.has(day)&&(!header||dayToColumn.size>header.dayToColumn.size))header={dayToColumn,venueIndex};
      }
      if(!header)continue;
      const targetColumn=header.dayToColumn.get(day);
      for(const tr of table.querySelectorAll("tr")){
        const cells=[...tr.children].filter(x=>x.matches("th,td"));
        const venueText=norm(cells[header.venueIndex]?.textContent),venue=entries.find(([,name])=>venueText.includes(name));
        if(!venue)continue;
        const [venueCode,venueName]=venue;
        let logicalColumn=0,targetCell=null;
        for(const cell of cells){const span=Math.max(1,Number.parseInt(cell.getAttribute("colspan")||"1",10)||1);if(targetColumn>=logicalColumn&&targetColumn<logicalColumn+span){targetCell=cell;break;}logicalColumn+=span;}
        if(!targetCell)continue;
        const el=targetCell.querySelector("[data-pprm-href][data-pprm-encp][data-pprm-dkbn]");
        if(!el)continue;
        const postPath=String(el.getAttribute("data-pprm-href")||"").trim(),encp=String(el.getAttribute("data-pprm-encp")||"").trim(),dkbn=String(el.getAttribute("data-pprm-dkbn")||"").trim(),disp=dkbn==="1"?"PJ0301":dkbn==="2"?"PJ0302":"";
        if(!postPath||!encp||!disp)continue;
        const url=new URL(postPath,location.href).toString();
        if(!/^https:\/\/(?:www\.)?keirin\.jp\//i.test(url))continue;
        found.set(`${date}|${venueCode}`,{date,venueCode,venueName,officialRequest:{url,encp,disp}});
      }
    }
    return [...found.values()].sort((a,b)=>Number(a.venueCode)-Number(b.venueCode));
  },{date,venues});
}

async function postOfficial(context,request,referer){
  const response=await context.request.post(request.url,{form:{encp:request.encp,disp:request.disp},headers:{referer,"accept-language":"ja"},timeout:20000});
  if(!response.ok()) throw new Error(`official race list HTTP ${response.status()}`);
  return {html:await response.text()};
}

export function readPc0201Data(html){
  const source=String(html||""),marker=/jsonData\[['"]PC0201['"]\]\s*=\s*/g.exec(source);
  if(!marker)return null;
  const start=marker.index+marker[0].length;let depth=0,inString=false,escaped=false;
  for(let i=start;i<source.length;i+=1){const ch=source[i];if(inString){if(escaped)escaped=false;else if(ch==="\\")escaped=true;else if(ch==='"')inString=false;continue;}if(ch==='"'){inString=true;continue;}if(ch==="{")depth+=1;else if(ch==="}"&&--depth===0){try{return JSON.parse(source.slice(start,i+1))?.C0201data||null;}catch{return null;}}}
  return null;
}

export function findTargetDayRequest(data,date,venueCode,officialRequest){
  if(!data||String(data.selKjyoCd||"").padStart(2,"0")!==String(venueCode).padStart(2,"0")||String(data.selKaisai||"")===date)return null;
  const label=`${date.slice(4,6)}/${date.slice(6,8)}`,day=Array.isArray(data.C0201kaisai)?data.C0201kaisai.find(x=>String(x?.txtEventDate||"").padStart(5,"0")===label&&x?.encParaK):null;
  return day?{...officialRequest,encp:String(day.encParaK),disp:"PJ0305"}:null;
}

export function extractMeetingIdentity(data,date,venueCode){
  const returnedDate=String(data?.selKaisai||""),returnedVenueCode=String(data?.selKjyoCd||"").padStart(2,"0"),requestedVenueCode=String(venueCode).padStart(2,"0");
  const identityPassed=Boolean(data)&&returnedDate===date&&returnedVenueCode===requestedVenueCode&&Array.isArray(data.C0201race);
  const raceNumbers=identityPassed?data.C0201race.map((race,index)=>race?index+1:null).filter(Boolean):[];
  return {returnedDate,returnedVenueCode,raceNumbers,identityPassed};
}
