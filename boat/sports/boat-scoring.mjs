
const clamp=(v,min=0,max=10)=>Math.min(max,Math.max(min,v));
export function scoreBoatParticipants({race,venueProfile}){
  const ex=race.participants.map(x=>x.exhibitionTime).filter(Number.isFinite),min=ex.length?Math.min(...ex):null,max=ex.length?Math.max(...ex):null;
  return race.participants.map(p=>{
    const motor=Number.isFinite(p.motorTwoRate)?clamp((p.motorTwoRate-20)/4):5,boat=Number.isFinite(p.boatTwoRate)?clamp((p.boatTwoRate-20)/4):5,avg=Number.isFinite(p.avgSt)?clamp(10-(p.avgSt-.08)*40):5,est=Number.isFinite(p.exhibitionSt)?clamp(10-(p.exhibitionSt-.08)*40):5,et=Number.isFinite(p.exhibitionTime)&&min!==max?clamp(10*(max-p.exhibitionTime)/(max-min)):5;
    const cf={1:10,2:6.2,3:6.5,4:5.8,5:4.8,6:3.6}[p.course]+(p.course===1?(venueProfile.inWinBias||0):0),cs={1:6.8,2:7.5,3:7.3,4:6.8,5:6,6:5}[p.course],ct={1:6.2,2:7,3:7.2,4:7,5:6.5,6:5.8}[p.course];
    const first=clamp(cf*.24+motor*.15+boat*.06+avg*.12+est*.11+et*.09+p.turnSkill*.10+p.stretchEvaluation*.08+p.localSuitability*.05),second=clamp(cs*.16+motor*.16+boat*.07+avg*.10+est*.10+et*.08+p.turnSkill*.14+p.stretchEvaluation*.10+p.localSuitability*.09),third=clamp(ct*.12+motor*.14+boat*.08+avg*.08+est*.08+et*.08+p.turnSkill*.11+p.stretchEvaluation*.14+p.localSuitability*.10+p.startSkill*.07);
    return {...p,roleScores:{first,second,third,outside:clamp(10-Math.max(first,second,third))},evidence:{motor,boat,avgSt:avg,exhibitionSt:est,exhibitionTime:et}};
  });
}
