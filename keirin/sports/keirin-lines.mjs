
export function buildLines(participants){
  const groups=new Map();
  for(const p of participants){
    const lineId=typeof p.lineId==="string"&&p.lineId.trim()?p.lineId:`unknown-${p.number??p.id??"unknown"}`;
    if(!groups.has(lineId))groups.set(lineId,[]);
    groups.get(lineId).push({...p,lineId});
  }
  return [...groups.entries()].map(([id,members])=>({id,type:id==="solo"?"単騎":id.startsWith("unknown-")?"判定保留":"ライン",members:members.sort((a,b)=>(a.lineOrder??99)-(b.lineOrder??99)),leader:members.find(x=>x.role==="自力")||members[0],bante:members.find(x=>x.role==="番手")||null,third:members.find(x=>x.role==="三番手")||null}));
}
