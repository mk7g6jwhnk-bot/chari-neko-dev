import { buildWinningMethodEnrichment } from './official-winning-method-enrichment.mjs';
import { generateObservationCandidates } from './action-tag-collector.mjs';

export async function evaluateWinningMethods(events, { store = null, fetchedAt = new Date().toISOString() } = {}) {
  const out={testedRaces:0,availableRaces:0,unknownRaces:0,sourceFailures:0,autoDirect:0,autoDirectByState:{},strongProxy:0,duplicatesSuppressed:0,appendedEnrichments:0};
  for await(const event of events){
    out.testedRaces++;
    const official=event.record?.officialEvidence || {};
    const row=buildWinningMethodEnrichment({raceKey:event.raceKey,source:official.source,winningMethod:official.winningMethod,sourceTimestamp:official.observedAt,fetchedAt,evidence:official.winningMethod?{type:'OFFICIAL_RESULT_FIELD'}:null});
    if(row.canonical)out.availableRaces++;else out.unknownRaces++;if(row.status==='SOURCE_ERROR')out.sourceFailures++;
    if(store){const saved=await store.append(row);out.appendedEnrichments+=saved.appended;out.duplicatesSuppressed+=saved.duplicates;}
    const tags=generateObservationCandidates(event.record), seen=new Set();
    for(const tag of tags){const key=`${tag.riderId}|${tag.stateType}|${tag.stateValue}`;if(seen.has(key)){out.duplicatesSuppressed++;continue;}seen.add(key);if(tag.collectionLane==='AUTO_DIRECT'){out.autoDirect++;out.autoDirectByState[tag.stateType]=(out.autoDirectByState[tag.stateType]||0)+1;}if(tag.evidenceType==='MULTI_SOURCE_STRONG_PROXY')out.strongProxy++;}
  }
  return out;
}
