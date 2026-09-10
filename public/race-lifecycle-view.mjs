// Presentation only: saved lifecycle takes precedence over browser last-known metadata.
export function raceLifecycleView(race={},saved=null,now=Date.now()){
  const state=String(saved?.state||race.autoStatus||'').toUpperCase(),collection=String(saved?.collectionState||'').toUpperCase();
  const confirmed=Boolean(saved?.resultObservedAt)||['VERIFIED','RESULT_ATTACHED','RESULT_CONFIRMED','COMPARED','RESULT_ONLY_RESEARCH','COMPLETED'].includes(state)||['RESULT_ATTACHED','COMPARISON_COMPLETE'].includes(collection)||race.resultConfirmed===true||race.resultStatus==='RESULT_CONFIRMED';
  if(confirmed)return{phase:'completed',label:'終了',className:'danger'};
  const start=raceTime(race.date,saved?.scheduledStartTime||race.scheduledStart||race.startTime),deadline=raceTime(race.date,race.deadline);
  // A passed betting deadline alone does not mean the race has started.
  if(Number.isFinite(start)&&start>now)return{phase:'pre-race',label:Number.isFinite(deadline)&&deadline<=now?'締切済み・発走前':Number.isFinite(deadline)&&deadline-now<=15*60000?'締切間近':'未発走',className:Number.isFinite(deadline)&&deadline-now<=15*60000?'warning':''};
  if((Number.isFinite(start)&&start<=now)||collection==='RESULT_PENDING'||state==='RESULT_PENDING')return{phase:'result-pending',label:'結果確認中',className:'warning'};
  if(collection==='PRE_SEALED'||['SCHEDULED','PRE_RACE'].includes(state))return{phase:'pre-race',label:'未発走',className:''};
  return{phase:'unknown',label:'状態未確認',className:''};
}
export function raceTime(date,value){
  const text=String(value||'');if(/^\d{4}-\d{2}-\d{2}T/.test(text))return Date.parse(text);
  const match=text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/),day=String(date||'').replace(/\D/g,'');if(!match||day.length!==8)return NaN;
  return Date.parse(day.slice(0,4)+'-'+day.slice(4,6)+'-'+day.slice(6,8)+'T'+match[1].padStart(2,'0')+':'+match[2]+':00+09:00');
}
export function japanClock(value){const ms=Date.parse(String(value||''));if(!Number.isFinite(ms))return String(value||'');return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(ms))}
