
export function auditEngine({race,branches,terminals}){
  const errors=[];if(race.participants.length!==6)errors.push("6艇ではありません");
  for(const b of branches.filter(x=>x.enabled))if(!terminals.some(t=>t.contributingBranches.includes(b.id)))errors.push(`枝${b.label}に終端なし`);
  const seen=new Set();for(const t of terminals){const k=t.order.join("-");if(seen.has(k))errors.push(`重複${k}`);seen.add(k);if(t.order.length!==3||new Set(t.order).size!==3)errors.push(`不正終端${k}`)}
  const sum=terminals.reduce((s,t)=>s+t.probability,0);if(Math.abs(sum-1)>.0001)errors.push(`確率合計${sum}`);
  return {passed:errors.length===0,errors,warnings:["終端削除なし",`全終端${terminals.length}件保持`],unterminatedBranches:errors.filter(x=>x.includes("終端なし")).length,probabilitySum:sum};
}
