
import { clamp } from "./utils.mjs";

export function adaptOfficialBoatData({raceListResult,beforeInfoResult,context,venueProfile}) {
  const before=new Map((beforeInfoResult?.participants||[]).map(x=>[x.number,x]));
  const participants=raceListResult.participants.map(base=>{
    const pre=before.get(base.number)||{};
    return {
      ...base,
      exhibitionSt:pre.exhibitionSt??null,
      exhibitionTime:pre.exhibitionTime??null,
      localSuitability:Number.isFinite(base.localWinRate)?clamp(base.localWinRate):5,
      startSkill:Number.isFinite(base.avgSt)?clamp(10-(base.avgSt-.08)*40):5,
      turnSkill:clamp((base.nationalWinRate??5)*.55+(base.localWinRate??base.nationalWinRate??5)*.45),
      stretchEvaluation:Number.isFinite(base.motorTwoRate)?clamp((base.motorTwoRate-20)/4):5,
      entryRisk:0
    };
  });

  return {
    race:{
      id:`${context.date}-${context.jcd}-${context.rno}`,
      venue:context.venueName||context.jcd,
      raceNo:Number(context.rno),
      analysisStage:beforeInfoResult?.ok?"展示後":"展示前暫定",
      entryUncertainty:2,
      startVariance:4,
      participants,
      officialWeather:beforeInfoResult?.weather||null
    },
    venueProfile
  };
}
