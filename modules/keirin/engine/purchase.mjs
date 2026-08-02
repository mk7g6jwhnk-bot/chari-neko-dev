
export function classify(terminals,odds){
  return terminals.map((t,i)=>{const o=odds[t.order.join("-")]??null;let c="押さえ";if(i===0)c="厚め";else if(t.branchPriority==="main"&&t.probability>=.012)c="本線";else if(o>=100&&t.probability>=.004)c="買える万車";const adopted=t.probability>=.003&&Number.isFinite(o)&&o>1;return{...t,odds:o,betClass:c,purchaseStatus:adopted?"購入採用":"購入不採用",purchaseReason:adopted?`${c}基準を満たす`:"終端保持・購入基準未満またはオッズなし"}});
}
export function composite(items){const v=items.filter(x=>x.purchaseStatus==="購入採用"&&x.odds>1);return v.length?1/v.reduce((s,x)=>s+1/x.odds,0):null}
export function allocate(items,budget){const v=items.filter(x=>x.purchaseStatus==="購入採用").slice(0,12);if(!v.length)return[];const w=v.map(x=>Math.max(x.probability,.0001)),sum=w.reduce((a,b)=>a+b,0),stakes=w.map(x=>Math.floor((budget*x/sum)/100)*100);let rem=budget-stakes.reduce((a,b)=>a+b,0),i=0;while(rem>=100){stakes[i%stakes.length]+=100;rem-=100;i++}return v.map((x,n)=>({order:x.order,betClass:x.betClass,stake:stakes[n],odds:x.odds,expectedPayout:Math.floor(stakes[n]*x.odds)}))}
