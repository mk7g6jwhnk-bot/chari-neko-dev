export function audit({race,branches,terminals,terminalGenerationAudit=null}){
  const errors=[];
  const warnings=["終端削除なし",`全終端${terminals.length}件保持`,race.lineConfidence!=="高"?"公式ライン未取得: ライン非依存の先行/まくり枝で継続し、番手差し等のライン依存枝のみ停止":null].filter(Boolean);
  if(!race.participants.length)errors.push("選手0");

  const events=Array.isArray(terminalGenerationAudit?.events)?terminalGenerationAudit.events:[];
  const allowedGroups=new Set(terminalGenerationAudit?.allowedExclusionReasonGroups||["RULE_IMPOSSIBLE","DATA_CONTRADICTION","DUPLICATE"]);
  const inactiveBranches=[];
  for(const b of branches){
    const hasTerminal=terminals.some(t=>Array.isArray(t.contributingBranches)&&t.contributingBranches.includes(b.id));
    if(hasTerminal)continue;
    const branchEvents=events.filter(e=>e?.branchId===b.id);
    const exclusions=branchEvents.filter(e=>e?.action==="EXCLUDED");
    const unexplained=branchEvents.filter(e=>e?.action==="AUDIT_MISS"||(e?.action==="EXCLUDED"&&!allowedGroups.has(e?.reasonGroup)));
    if(terminalGenerationAudit?.passed===true&&exclusions.length>0&&unexplained.length===0){
      inactiveBranches.push({branchId:b.id,branchLabel:b.label,excludedPathEventCount:exclusions.length,reasonCodes:[...new Set(exclusions.map(e=>e.reasonCode).filter(Boolean))]});
      warnings.push(`枝${b.label}は全経路が規則不成立・入力矛盾のため非活性`);
      continue;
    }
    errors.push(`枝${b.label}に終端なし`);
  }

  const seen=new Set();
  for(const t of terminals){
    const k=t.order.join("-");
    if(seen.has(k))errors.push(`重複${k}`);
    seen.add(k);
    if(t.order.length!==3||new Set(t.order).size!==3)errors.push(`不正終端${k}`);
  }
  const sum=terminals.reduce((s,t)=>s+t.probability,0);
  if(terminals.length&&Math.abs(sum-1)>.0001)errors.push(`確率合計${sum}`);
  return{
    passed:errors.length===0,
    errors,warnings,probabilitySum:sum,
    unterminatedBranches:errors.filter(x=>x.includes("終端なし")).length,
    inactiveBranchAudit:{policy:"ALLOW_BRANCH_WITH_ZERO_TERMINALS_ONLY_WHEN_ALL_PATHS_HAVE_EXPLICIT_ALLOWED_EXCLUSION_REASONS",count:inactiveBranches.length,rows:inactiveBranches}
  };
}
