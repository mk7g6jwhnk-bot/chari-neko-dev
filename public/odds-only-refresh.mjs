function compactDate(value){return String(value||"").replace(/\D/g,"").slice(0,8)}
function canonicalTicketKey(value){
  if(Array.isArray(value))return value.map(Number).join("-");
  const digits=String(value||"").replace(/[^1-9]/g,"").slice(0,3).split("");
  return digits.length===3?digits.join("-"):"";
}

export function oddsRefreshIdentity(snapshot){
  const race=snapshot?.targetRace||{},date=compactDate(race.date),rawVenueCode=String(race.venueCode||"").trim(),venueCode=rawVenueCode.padStart(2,"0"),raceNo=Number(race.raceNo),predictionHash=String(snapshot?.sealedPrediction?.predictionHash||"").trim();
  if(!/^\d{8}$/.test(date)||!/^\d{1,2}$/.test(rawVenueCode)||Number(rawVenueCode)<1||!Number.isInteger(raceNo)||raceNo<1||!predictionHash)throw new Error("保存済み予想のレースidentityを確認できません");
  return{raceKey:`${date}-${venueCode}-${raceNo}`,date,venueCode,raceNo,venueName:String(race.venueName||""),predictionHash};
}

export function validateOddsOnlyResponse(payload,identity,tickets){
  const race=payload?.race||{},date=compactDate(race.date),venueCode=String(race.venueCode||"").padStart(2,"0"),raceNo=Number(race.raceNo),responseRaceKey=`${date}-${venueCode}-${raceNo}`;
  if(payload?.ok!==true||responseRaceKey!==identity.raceKey)throw new Error("取得したオッズのレースidentityが一致しません");
  const oddsSource=payload?.odds?.odds;
  if(!oddsSource||typeof oddsSource!=="object"||Array.isArray(oddsSource))throw new Error("オッズ応答の形式が不正です");
  const normalized=new Map();
  for(const [rawKey,rawValue] of Object.entries(oddsSource)){
    const key=canonicalTicketKey(rawKey),value=Number(rawValue);
    if(!key||!Number.isFinite(value)||value<=1)continue;
    if(normalized.has(key))throw new Error("オッズ応答に重複ticketがあります");
    normalized.set(key,value);
  }
  const ticketKeys=tickets.map(ticket=>canonicalTicketKey(ticket?.order));
  if(ticketKeys.some(key=>!key)||new Set(ticketKeys).size!==ticketKeys.length)throw new Error("canonical買い目のidentityが不正です");
  const oddsByTicket={},missingTickets=[];
  for(const key of ticketKeys){if(normalized.has(key))oddsByTicket[key]=normalized.get(key);else missingTickets.push(key)}
  const oddsFetchedAt=String(payload.checkedAt||"");
  if(!Number.isFinite(Date.parse(oddsFetchedAt)))throw new Error("オッズ取得時刻を確認できません");
  return{schemaVersion:"ODDS_ONLY_REFRESH_V1",raceKey:identity.raceKey,predictionHash:identity.predictionHash,oddsFetchedAt,oddsSource:"KEIRIN_ODDS_ENDPOINT",oddsByTicket,missingTickets,matchedTicketCount:Object.keys(oddsByTicket).length,totalTicketCount:ticketKeys.length};
}

export function overlayOddsForDisplay(tickets,refresh){
  return tickets.map(ticket=>{
    const clone={...ticket,order:Array.isArray(ticket.order)?[...ticket.order]:ticket.order};
    if(!refresh)return clone;
    const key=canonicalTicketKey(ticket.order);
    if(Object.prototype.hasOwnProperty.call(refresh.oddsByTicket||{},key))return{...clone,odds:refresh.oddsByTicket[key],oddsRefreshStatus:"LATEST"};
    return{...clone,odds:null,oddsRefreshStatus:"MISSING_LATEST"};
  });
}

export function expectedPayout(odds,stake){const value=Number(odds)*Number(stake);return Number.isFinite(value)&&value>0?Math.floor(value):null}
