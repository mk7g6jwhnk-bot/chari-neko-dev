export const REVIEW_PENDING='REVIEW_PENDING';
export const REVIEW_CONFIRMED='REVIEW_CONFIRMED';
export const REVIEW_UNAVAILABLE_OLD_VIDEO='REVIEW_UNAVAILABLE_OLD_VIDEO';

export function jstDateKey(now=new Date()){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now).replaceAll('-','');
}
export function daysBeforeJst(raceKey,now=new Date()){
 const value=String(raceKey||'').slice(0,8),today=jstDateKey(now);if(!/^\d{8}$/.test(value))return null;
 const day=x=>Date.UTC(Number(x.slice(0,4)),Number(x.slice(4,6))-1,Number(x.slice(6,8)));
 return Math.floor((day(today)-day(value))/86400000);
}
export function reviewAvailability({record={},reviewV2=null,now=new Date()}={}){
 if(reviewV2)return REVIEW_CONFIRMED;
 const old=daysBeforeJst(record.raceKey,now),hasOfficialVideo=Array.isArray(record.officialVideoUrls)&&record.officialVideoUrls.length>0;
 return old!==null&&old>=2&&!hasOfficialVideo?REVIEW_UNAVAILABLE_OLD_VIDEO:REVIEW_PENDING;
}
export function hasUnknownAnswer(review){
 const visit=value=>value==='UNKNOWN'||(value&&typeof value==='object'&&Object.values(value).some(visit));return visit(review?.answers||{});
}
export function summarizeV2Progress(rows=[]){
 const confirmed=rows.filter(x=>x.availability===REVIEW_CONFIRMED),pending=rows.filter(x=>x.availability===REVIEW_PENDING),unavailable=rows.filter(x=>x.availability===REVIEW_UNAVAILABLE_OLD_VIDEO),reviewTarget=confirmed.length+pending.length;
 return Object.freeze({collectedRaces:rows.length,confirmed:confirmed.length,pending:pending.length,unavailable:unavailable.length,reviewTarget,progressRate:reviewTarget?confirmed.length/reviewTarget:0,unknownReviewed:confirmed.filter(x=>hasUnknownAnswer(x.reviewV2)).length,maleConfirmed:confirmed.filter(x=>x.mode==='STANDARD').length,girlsConfirmed:confirmed.filter(x=>x.mode==='GIRLS').length});
}
