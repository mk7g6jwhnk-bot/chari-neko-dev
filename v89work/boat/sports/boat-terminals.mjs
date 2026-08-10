
export function generateBoatTerminals({scored,branches}){
  const byId=new Map(scored.map(x=>[x.id,x])),raw=[];
  for(const b of branches.filter(x=>x.enabled))for(const first of b.topCandidates.map(id=>byId.get(id)).filter(Boolean).slice(0,4))for(const second of scored.filter(x=>x.id!==first.id).sort((a,b)=>b.roleScores.second-a.roleScores.second).slice(0,4))for(const third of scored.filter(x=>x.id!==first.id&&x.id!==second.id).sort((a,b)=>b.roleScores.third-a.roleScores.third).slice(0,4))raw.push({order:[first.number,second.number,third.number],branchId:b.id,branchLabel:b.label,branchPriority:b.priority,score:b.score*first.roleScores.first*second.roleScores.second*third.roleScores.third,holdReason:"3着まで独立評価して生成"});
  const map=new Map();for(const t of raw){const k=t.order.join("-"),e=map.get(k);if(!e)map.set(k,{...t,contributingBranches:[t.branchId]});else{e.score+=t.score;e.contributingBranches=[...new Set([...e.contributingBranches,t.branchId])]}}
  const arr=[...map.values()],total=arr.reduce((s,x)=>s+x.score,0)||1;return arr.map(x=>({...x,probability:x.score/total})).sort((a,b)=>b.probability-a.probability);
}
