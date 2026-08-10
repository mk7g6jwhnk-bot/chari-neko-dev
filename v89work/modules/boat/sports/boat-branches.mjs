
export function generateBoatBranches({scored,venueProfile}){
  const p=new Map(scored.map(x=>[x.course,x])),one=p.get(1),two=p.get(2),three=p.get(3),four=p.get(4),five=p.get(5);
  const b=(id,label,priority,score,tops)=>({id,label,priority,score,topCandidates:tops.filter(Boolean),enabled:score>=2.5});
  return [
    b("IN_ESCAPE","イン逃げ","main",(one?.roleScores.first||0)*.65+((venueProfile.inWinBias||0)+5)*.35,[one?.id]),
    b("SASHI","差し","sub",(two?.roleScores.first||0)*.6+(two?.turnSkill||5)*.4,[two?.id]),
    b("MAKURI","まくり","sub",Math.max(three?.roleScores.first||0,four?.roleScores.first||0)*.7+Math.max(three?.evidence.exhibitionSt||0,four?.evidence.exhibitionSt||0)*.3,[three?.id,four?.id]),
    b("MAKURI_SASHI","まくり差し","sub",Math.max(three?.roleScores.first||0,four?.roleScores.first||0,five?.roleScores.first||0)*.65+Math.max(three?.turnSkill||0,four?.turnSkill||0,five?.turnSkill||0)*.35,[three?.id,four?.id,five?.id]),
    b("MOTSU","競り・もつれ","risk",4.2,scored.map(x=>x.id))
  ].sort((a,b)=>b.score-a.score);
}
