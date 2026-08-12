#!/usr/bin/env node
/**
 * Applies the v0.16 initiative/purchase separation to an existing chari-neko checkout.
 *
 * Usage:
 *   node tools/apply-keirin-v016.mjs
 *
 * The script intentionally fails instead of guessing when an expected anchor
 * is missing. This prevents silently patching the wrong engine version.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const write = (p, s) => fs.writeFileSync(path.join(root, p), s, "utf8");
const must = (condition, message) => { if (!condition) throw new Error(message); };

const enginePath = "keirin/engine/keirin-engine.mjs";
const scorePath = "keirin/sports/keirin-scoring.mjs";
const predictPath = "netlify/functions/keirin-predict.mjs";

const engine = read(enginePath);
const scoring = read(scorePath);
const predict = read(predictPath);

must(engine.includes('import{scoreKeirinParticipants}from"../sports/keirin-scoring.mjs";'),
  "keirin-engine.mjs: scoring import anchor not found");
must(engine.includes("const lines=buildLines(scored);"),
  "keirin-engine.mjs: buildLines anchor not found");
must(engine.includes("const branches=generateKeirinBranches({scored,lines"),
  "keirin-engine.mjs: branch anchor not found");
must(scoring.includes("export function scoreKeirinParticipants"),
  "keirin-scoring.mjs: score function not found");
must(predict.includes("const prediction = runKeirinEngine({"),
  "keirin-predict.mjs: engine call not found");

let nextEngine = engine;
if (!nextEngine.includes('import{assessInitiative}from"./initiative-assessment.mjs";')) {
  nextEngine = nextEngine.replace(
    'import{scoreKeirinParticipants}from"../sports/keirin-scoring.mjs";',
    'import{scoreKeirinParticipants}from"../sports/keirin-scoring.mjs";\\nimport{assessInitiative}from"./initiative-assessment.mjs";'
  );
}

nextEngine = nextEngine.replace(
  'const lines=buildLines(scored);\\nconst branches=generateKeirinBranches({scored,lines,lineConfidence:race.lineConfidence,raceCategory:race.raceCategory||"standard"});',
  'const lines=buildLines(scored);\\nconst initiativeAssessment=assessInitiative({scored,lines,raceCategory:race.raceCategory||"standard"});\\nconst branches=generateKeirinBranches({scored,lines,initiativeAssessment,lineConfidence:race.lineConfidence,raceCategory:race.raceCategory||"standard"});'
);

nextEngine = nextEngine.replace(
  'engineVersion:"KEIRIN-0.15.2-update-state-isolation",',
  'engineVersion:"KEIRIN-0.16.0-initiative-purchase-separation",'
);

nextEngine = nextEngine.replace(
  'scored,lines,branches,terminals:classified,',
  'scored,lines,initiativeAssessment,branches,terminals:classified,'
);

must(nextEngine !== engine, "keirin-engine.mjs: no change was made");
write(enginePath, nextEngine);

// Add official-score relative evidence to every scored rider.
// This is deliberately a race-relative evidence field, not a replacement for
// mechanism scores. The score is then incorporated by the separate patch below.
let nextScoring = scoring;
must(!nextScoring.includes("officialScoreGapToFieldMean"),
  "keirin-scoring.mjs already contains officialScoreGapToFieldMean; inspect manually before applying");

const startToken = "export function scoreKeirinParticipants({race,venueProfile={}}){";
const replacementStart = `${startToken}
  const participants = Array.isArray(race?.participants) ? race.participants : [];
  const officialScores = participants.map(p => Number(p?.officialScore)).filter(Number.isFinite);
  const officialMean = officialScores.length
    ? officialScores.reduce((a,b) => a+b, 0) / officialScores.length
    : null;`;
nextScoring = nextScoring.replace(startToken, replacementStart);

must(nextScoring !== scoring, "keirin-scoring.mjs: function start replacement failed");

const mapToken = "return race.participants.map(p=>{";
must(nextScoring.includes(mapToken), "keirin-scoring.mjs: participant map anchor not found");

nextScoring = nextScoring.replace(
  mapToken,
  `return participants.map(p=>{
    const officialScore = Number(p?.officialScore);
    const officialScoreGapToFieldMean = Number.isFinite(officialScore) && Number.isFinite(officialMean)
      ? officialScore - officialMean
      : null;`
);

const roleScoresToken = `const roleScores={
      first:clamp(placement.first.score),
      second:clamp(placement.second.score),
      third:clamp(placement.third.score),
      outside:clamp(10-Math.max(placement.first.score,placement.second.score,placement.third.score))
    };`;

must(nextScoring.includes(roleScoresToken), "keirin-scoring.mjs: roleScores anchor not found");

const roleScoresReplacement = `const officialScoreContext = buildOfficialScoreContext({
      officialScoreGapToFieldMean,
      officialScore,
      officialMean
    });
    const roleScores={
      first:clamp(placement.first.score + officialScoreContext.adjustment),
      second:clamp(placement.second.score + officialScoreContext.adjustment * 0.70),
      third:clamp(placement.third.score + officialScoreContext.adjustment * 0.45),
      outside:clamp(10-Math.max(
        placement.first.score + officialScoreContext.adjustment,
        placement.second.score + officialScoreContext.adjustment * 0.70,
        placement.third.score + officialScoreContext.adjustment * 0.45
      ))
    };`;

nextScoring = nextScoring.replace(roleScoresToken, roleScoresReplacement);

const evidenceToken = "      evidence";
must(nextScoring.includes(evidenceToken), "keirin-scoring.mjs: evidence return anchor not found");
nextScoring = nextScoring.replace(
  evidenceToken,
  `      officialScore,
      officialMean,
      officialScoreGapToFieldMean,
      officialScoreContext,
      evidence`
);

const helperAnchor = "\nfunction normalizeRole(p){";
must(nextScoring.includes(helperAnchor), "keirin-scoring.mjs: helper anchor not found");
nextScoring = nextScoring.replace(
  helperAnchor,
`\\nfunction buildOfficialScoreContext({officialScoreGapToFieldMean,officialScore,officialMean}){
  if(!Number.isFinite(Number(officialScore))||!Number.isFinite(Number(officialMean))){
    return{available:false,adjustment:0,reason:"OFFICIAL_SCORE_UNAVAILABLE"};
  }
  const gap=Number(officialScoreGapToFieldMean)||0;
  // Large score differences are evidence, not an absolute ordering rule.
  // ±3 points is treated as meaningful; ±8 points reaches the full +1/-1 adjustment.
  const adjustment=Math.max(-1,Math.min(1,gap/8));
  return{
    available:true,
    officialScore:Number(officialScore),
    officialMean:Number(officialMean),
    gap,
    meaningfulGap:Math.abs(gap)>=3,
    adjustment,
    policy:"OFFICIAL_SCORE_RELATIVE_EVIDENCE_NOT_HARD_RANK"
  };
}
${helperAnchor}`
);

write(scorePath, nextScoring);

// Replace browser timeout behavior with a short preview-first strategy.
let nextPredict = predict;
must(nextPredict.includes("const endpoint = `${base}/keirin/race?${query}`;"),
  "keirin-predict.mjs: expected race endpoint not found");

nextPredict = nextPredict.replace(
  "const endpoint = `${base}/keirin/race?${query}`;",
`const endpoints = [
    {path:"/keirin/preview", timeoutMs:11000},
    {path:"/keirin/race", timeoutMs:11000}
  ];`
);

const oldLoop = /const attempts = \[\];[\\s\\S]*?return \\{\\n    ok: false,\\n    status: 502,\\n    data: \\{\\n      ok: false,\\n      error: "競輪ブラウザサービスの再試行でも取得できませんでした",\\n      endpointAudit: attempts\\n    \\}\\n  \\};\\n}/;

const newRequest = `const attempts = [];
  const startedAt = Date.now();
  const totalBudgetMs = 24000;

  for (const target of endpoints) {
    if (Date.now() - startedAt >= totalBudgetMs) break;
    const endpoint = base + target.path + "?" + query;
    try {
      const remaining = totalBudgetMs - (Date.now() - startedAt);
      const timeoutMs = Math.min(target.timeoutMs, Math.max(4000, remaining - 1000));
      const response = await fetch(endpoint, {
        headers:{accept:"application/json"},
        signal:AbortSignal.timeout(timeoutMs)
      });
      const text = await response.text();
      let data=null;
      try{data=JSON.parse(text);}catch{}
      attempts.push({
        endpoint:target.path,
        status:response.status,
        parsed:data!==null,
        elapsedMs:Date.now()-startedAt,
        error:data?.error||null
      });
      if(data?.officialData && response.ok){
        return {ok:true,status:response.status,data:{...data,endpointAudit:attempts}};
      }
      if(response.status < 500 && response.status !== 429) break;
    }catch(error){
      attempts.push({
        endpoint:target.path,
        error:error instanceof Error?error.message:String(error),
        elapsedMs:Date.now()-startedAt
      });
    }
  }

  return {
    ok:false,
    status:502,
    data:{
      ok:false,
      error:"競輪ブラウザサービスから公式データを取得できませんでした",
      endpointAudit:attempts
    }
  };
}`;

const match = nextPredict.match(oldLoop);
must(match, "keirin-predict.mjs: requestBrowserService body did not match audited structure");
nextPredict = nextPredict.replace(match[0], newRequest);

write(predictPath, nextPredict);

// ChatSpec: a branch is MAIN only when it is explicitly marked priority=main.
// sameScenarioMainSibling must never promote a sibling to MAIN.
const chatPath = "keirin/engine/chat-spec-v1-policy.mjs";
let chat = read(chatPath);
must(chat.includes('const mainBranches=branches.filter(b=>normalizePriority(b.priority)==="main"||b.sameScenarioMainSibling===true);'),
  "chat-spec-v1-policy.mjs: MAIN branch anchor not found");
chat = chat.replace(
  'const mainBranches=branches.filter(b=>normalizePriority(b.priority)==="main"||b.sameScenarioMainSibling===true);',
  'const mainBranches=branches.filter(b=>normalizePriority(b.priority)==="main");'
);
must(chat.includes("const naturalPrecedenceAudit=[];"), "chat-spec-v1-policy.mjs: natural precedence anchor not found");
const naturalStart = chat.indexOf("  const naturalPrecedenceAudit=[];");
const naturalEnd = chat.indexOf("  // v156: strong SECOND-pair breadth recovery.", naturalStart);
must(naturalStart >= 0 && naturalEnd > naturalStart,
  "chat-spec-v1-policy.mjs: natural precedence block boundary not found");
chat = chat.slice(0,naturalStart) +
  `  const naturalPrecedenceAudit=[];
  // NATURAL_PRECEDENCE_PROMOTION is intentionally disabled.
  // A terminal may not become MAIN/COVER after classification merely because its
  // convergence score is higher than an already selected terminal.`
  + chat.slice(naturalEnd);
write(chatPath, chat);

// Purchase point guard: do not manufacture bets when only one eligible candidate
// exists, but prevent accidental explosion of the final plan.
let guardedEngine = read(enginePath);
const planAnchor = 'const normalPlan=a.passed&&!purchaseBlocked?allocate(classified,budget):[];';
must(guardedEngine.includes(planAnchor), "keirin-engine.mjs: normalPlan anchor not found");
guardedEngine = guardedEngine.replace(
  planAnchor,
  'const normalPlan=a.passed&&!purchaseBlocked?enforcePurchasePointGuard(allocate(classified,budget),classified,budget):[];'
);
const guardHelperAnchor = '\nfunction buildReferenceToStandardTransitionAudit(';
must(guardedEngine.includes(guardHelperAnchor), "keirin-engine.mjs: helper insertion anchor not found");
const guardHelper = `
function enforcePurchasePointGuard(plan=[],classified=[],budget=3000){
  const rows=Array.isArray(plan)?plan:[];
  if(rows.length<=8)return rows;
  const rank={
    MAIN:0,
    COVER:1,
    BUYABLE_HIGH:2
  };
  return [...rows]
    .sort((a,b)=>
      (rank[a?.betClass]??9)-(rank[b?.betClass]??9)||
      (Number(b?.probability)||0)-(Number(a?.probability)||0)||
      (Number(b?.naturalConvergenceScore)||0)-(Number(a?.naturalConvergenceScore)||0)
    )
    .slice(0,8);
}
`;
guardedEngine = guardedEngine.replace(guardHelperAnchor, guardHelper + guardHelperAnchor);
write(enginePath, guardedEngine);

console.log("Applied KEIRIN-0.16.0 initiative/purchase separation patch.");
