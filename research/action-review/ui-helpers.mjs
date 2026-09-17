export const VALUE_LABELS = Object.freeze({
  CLEAN:'すんなり主導権',CONTESTED:'主導権争い',LONG_LEAD:'長く先行',UNKNOWN:'不明',
  RESERVED:'脚を残していた',NORMAL:'通常',DEPLETED:'脚を使い切った',
  SUPPORT_FRONT:'前を援護',HOLD_POSITION:'番手位置を維持',SELF_LAUNCH:'自力で踏み出し',SWITCH:'切り替え',SEPARATED:'離れ',
  INTACT:'ライン維持',PARTIAL_BREAK:'一部崩れ',COLLAPSED:'ライン崩壊',SURVIVED:'別線が残った',DID_NOT_SURVIVE:'別線が残らなかった'
});
export const QUESTION_DESCRIPTIONS = Object.freeze({
  leadPressure:'主導権を取るまでに競り合いがあったか',energyState:'終盤まで脚を残せていたか',
  banteResponse:'番手が前を守ったか、自分で踏んだか、切り替えたか',lineState:'ラインが終盤まで維持されたか',
  otherLineSurvival:'別線の選手が終盤まで勝負圏に残ったか'
});
export const labelValue = value => VALUE_LABELS[value] || value;
export function raceDate(raceKey){const x=String(raceKey||'').slice(0,8);return /^\d{8}$/.test(x)?`${x.slice(0,4)}/${x.slice(4,6)}/${x.slice(6,8)}`:'日付不明';}
export function isGirlsRecord(record={}){const p=record.participants||[];return p.length>0&&p.every(row=>String(row.raceCategory||'').toLowerCase()==='girls'||/^L\d/i.test(String(row.className||row.class||'')));}
export function sortRaces(rows=[]){return [...rows].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''),'ja')||String(a.venue||'').localeCompare(String(b.venue||''),'ja')||Number(a.raceNo)-Number(b.raceNo));}
const jstDay=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now).replaceAll('-','');
export function filterRaces(rows,filter='recent2',now=new Date()){const today=jstDay(now),day=x=>{const d=new Date(now);d.setDate(d.getDate()-x);return jstDay(d)},allowed=filter==='today'?[today]:filter==='yesterday'?[day(1)]:filter==='recent3'?[today,day(1),day(2)]:filter==='all'?null:[today,day(1)];return allowed?rows.filter(r=>allowed.includes(String(r.date||'').replaceAll('/',''))):rows;}
export function searchQuery(record={}){return `${raceDate(record.raceKey)} ${record.venueName||record.venue||''} ${record.raceNo||String(record.raceKey||'').split('-')[2]||''}R 競輪`.replace(/\s+/g,' ').trim();}
export function nextPendingRace(rows=[],currentKey=''){return sortRaces(rows).find(row=>!row.reviewed&&row.raceKey!==currentKey)||null;}
