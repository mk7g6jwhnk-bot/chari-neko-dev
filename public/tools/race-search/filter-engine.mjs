
export function filterAndRankRaces(races, f={}) {
  const filtered = races.filter(r => {
    if (f.sports?.length && !f.sports.includes(r.sport)) return false;
    if (f.venues?.length && !f.venues.includes(r.venueId)) return false;
    if (f.startTime && toMin(r.startTime) < toMin(f.startTime)) return false;
    if (f.endTime && toMin(r.startTime) > toMin(f.endTime)) return false;
    if (f.payoutBands?.length && !f.payoutBands.includes(r.payoutBand)) return false;
    if ((r.confidence ?? 0) < (f.minConfidence ?? 0)) return false;
    if (f.featuredOnly && !r.mainHighPayout) return false;
    if (f.rolloverOnly && !r.rolloverSuitable) return false;
    if (f.favoriteEntryOnly && !r.favoriteEntry) return false;
    if (f.distrustedEntryOnly && !r.distrustedEntry) return false;
    return true;
  });
  return filtered.map(r => ({...r, filteredSelectionScore: score(r, filtered)}))
    .sort((a,b)=>b.filteredSelectionScore-a.filteredSelectionScore || toMin(a.startTime)-toMin(b.startTime));
}
export function groupByVenue(races) {
  return races.reduce((g,r)=>{(g[r.venueId]??={venueId:r.venueId,venueName:r.venueName,races:[]}).races.push(r);return g;},{});
}
function score(r,pop){
  const rank=(r.engineExpectedValue??0);
  const below=pop.filter(x=>(x.engineExpectedValue??0)<rank).length;
  const rel=pop.length?below/pop.length:0;
  return (r.confidence??0)/5*.3+(r.concentration??0)/5*.2+(r.dataQualityScore??.5)*.2+rel*.2+(r.mainHighPayout?.15:0)+(r.rolloverSuitable?.1:0);
}
function toMin(t){const m=String(t||"").match(/^(\d{1,2}):(\d{2})$/);return m?+m[1]*60 + +m[2]:NaN}
