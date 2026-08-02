
export function audit({race,branches,terminals}){
  const errors=[];if(!race.participants.length)errors.push("選手0");
  for(const b of branches)if(!terminals.some(t=>t.contributingBranches.includes(b.id)))errors.push(`枝${b.label}に終端なし`);
  const seen=new Set();for(const t of terminals){const k=t.order.join("-");if(seen.has(k))errors.push(`重複${k}`);seen.add(k);if(t.order.length!==3||new Set(t.order).size!==3)errors.push(`不正終端${k}`)}
  const sum=terminals.reduce((s,t)=>s+t.probability,0);if(terminals.length&&Math.abs(sum-1)>.0001)errors.push(`確率合計${sum}`);
  return{passed:errors.length===0,errors,warnings:["終端削除なし",`全終端${terminals.length}件保持`,race.lineConfidence!=="高"?"公式ライン未取得のためライン依存枝を停止":null].filter(Boolean),probabilitySum:sum,unterminatedBranches:errors.filter(x=>x.includes("終端なし")).length};
}
