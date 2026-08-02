
export function buildReverseTree({sport,result,observations={},dictionary}) {
  const hypotheses = dictionary.templates.map((t,i)=>buildHypothesis(t,i,result,observations,dictionary))
    .filter(Boolean);
  if (!hypotheses.some(h=>!["矛盾","競技規則上不成立"].includes(h.support))) {
    hypotheses.push({
      id:"unknown:0", label:"その他・未観測の展開", support:"その他・未観測",
      path:[dictionary.unknownNodeId], evidence:[], contradictions:[], requiresMedia:true
    });
  }
  const audit = auditTree(result,hypotheses,dictionary);
  return {version:"REVERSE-TREE-0.1.0",sport,result,hypotheses,audit,generatedAt:new Date().toISOString()};
}

function buildHypothesis(t,index,result,obs,dictionary){
  if (t.when?.method && !result.method?.includes(t.when.method)) return null;
  if (t.when?.surface && obs.surface!==t.when.surface) return null;
  const bind={winner:result.order[0],second:result.order[1],third:result.order[2]};
  let score=0; const evidence=[]; const contradictions=[]; const path=[];
  for(const id of t.path){
    const n=dictionary.nodes.find(x=>x.id===id);
    if(!n){contradictions.push(`未登録ノード:${id}`);continue}
    path.push(id);
    for(const r of n.support||[]){
      if(match(r,result,obs,bind)){score+=r.weight||1;evidence.push(r.evidence||n.label)}
    }
    for(const r of n.contradict||[]){
      if(match(r,result,obs,bind)){score-=r.weight||3;contradictions.push(r.reason||`${n.label}と矛盾`)}
    }
  }
  let support="証拠不足";
  if(contradictions.length) support="矛盾";
  else if(score>=6) support="確定";
  else if(score>=3) support="強支持";
  else if(score>=1) support="可能";
  return {
    id:`${t.id}:${index}`, templateId:t.id,
    label:t.label.replaceAll("{{winner}}",bind.winner).replaceAll("{{second}}",bind.second).replaceAll("{{third}}",bind.third),
    support, supportScore:score, path, evidence:[...new Set(evidence)],
    contradictions:[...new Set(contradictions)],
    requiresMedia:path.some(id=>dictionary.nodes.find(x=>x.id===id)?.requiresMedia)
  };
}

function match(rule,result,obs,bind){
  const src=rule.source==="result"?result:obs;
  const actual=rule.path.split(".").reduce((v,k)=>v?.[k],src);
  const expected=typeof rule.value==="string"&&rule.value.startsWith("$")?bind[rule.value.slice(1)]:rule.value;
  if(rule.op==="eq")return actual===expected;
  if(rule.op==="includes")return Array.isArray(actual)&&actual.includes(expected);
  if(rule.op==="exists")return actual!==undefined&&actual!==null;
  if(rule.op==="lte")return Number(actual)<=Number(expected);
  return false;
}

function auditTree(result,hypotheses,dictionary){
  const errors=[], warnings=[];
  if(!result.order?.length)errors.push("確定着順がありません");
  if(!hypotheses.length)errors.push("仮説がありません");
  const registered=new Set(dictionary.nodes.map(x=>x.id));
  for(const h of hypotheses)for(const id of h.path)if(!registered.has(id))errors.push(`未登録ノード:${id}`);
  const connected=new Set(dictionary.templates.flatMap(t=>t.path));
  const disconnected=dictionary.nodes.filter(n=>n.id!==dictionary.unknownNodeId&&!connected.has(n.id)).map(n=>n.id);
  if(disconnected.length)warnings.push(`未接続ノード:${disconnected.join(",")}`);
  return {
    passed:errors.length===0,errors,warnings,hypothesisCount:hypotheses.length,
    viableCount:hypotheses.filter(h=>!["矛盾","競技規則上不成立"].includes(h.support)).length,
    confirmedCount:hypotheses.filter(h=>h.support==="確定").length,
    strongCount:hypotheses.filter(h=>h.support==="強支持").length,
    possibleCount:hypotheses.filter(h=>h.support==="可能").length,
    unknownCount:hypotheses.filter(h=>h.support==="その他・未観測").length,
    disconnectedNodeCount:disconnected.length
  };
}
