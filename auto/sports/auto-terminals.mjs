
export function generateAutoTerminals({scored,branches}){
  const byId=new Map(scored.map(p=>[p.id,p])),raw=[];
  for(const branch of branches){
    for(const first of branch.firstCandidates.map(id=>byId.get(id)).filter(Boolean).sort((a,b)=>b.roleScores.first-a.roleScores.first).slice(0,5)){
      for(const second of scored.filter(p=>p.id!==first.id).sort((a,b)=>b.roleScores.second-a.roleScores.second).slice(0,5)){
        for(const third of scored.filter(p=>p.id!==first.id&&p.id!==second.id).sort((a,b)=>b.roleScores.third-a.roleScores.third).slice(0,5)){
          raw.push({order:[first.number,second.number,third.number],branchId:branch.id,branchLabel:branch.label,branchPriority:branch.priority,score:branch.score*first.roleScores.first*second.roleScores.second*third.roleScores.third,holdReason:"着順別評価を独立保持し3着まで生成"});
        }
      }
    }
  }
  const map=new Map();
  for(const t of raw){const k=t.order.join("-"),e=map.get(k);if(!e)map.set(k,{...t,contributingBranches:[t.branchId]});else{e.score+=t.score;e.contributingBranches=[...new Set([...e.contributingBranches,t.branchId])]}}
  const arr=[...map.values()],total=arr.reduce((s,x)=>s+x.score,0)||1;
  return arr.map(x=>({...x,probability:x.score/total})).sort((a,b)=>b.probability-a.probability);
}
