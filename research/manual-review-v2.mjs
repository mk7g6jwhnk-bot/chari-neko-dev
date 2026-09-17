import {createHash} from 'node:crypto';
export const MANUAL_REVIEW_V2='MANUAL_REVIEW_V2';
export const OUTCOMES=['RESERVED','NO_CLEAR_DECELERATION','CLEAR_DECELERATION','UNKNOWN'];
export const BANTE_ACTIONS=['SUPPORTED_FRONT','HELD_POSITION','SELF_LAUNCHED','SWITCHED','SEPARATED','UNKNOWN'];
const enumOf=(value,allowed,name)=>{const x=String(value||'UNKNOWN').toUpperCase();if(!allowed.includes(x))throw Error(`V2_VALUE_INVALID:${name}`);return x};
export function isGirlsV2(record={}){const p=record.participants||[];return p.length>0&&p.every(x=>String(x.raceCategory||'').toLowerCase()==='girls'||/^L\d/i.test(String(x.className||x.class||'')))}
export function buildManualReviewV2(record={}){const riders=(record.participants||[]).map((x,i)=>({riderId:String(x.registration||x.riderId||x.id||x.number),number:Number(x.number||i+1),name:x.name||null}));return Object.freeze({schemaVersion:MANUAL_REVIEW_V2,manualReviewVersion:2,mode:isGirlsV2(record)?'GIRLS':'STANDARD',raceKey:record.raceKey,riders,productionEligible:false,researchLane:'SHADOW_ONLY'});}
export function createManualReviewV2(reviewCase,input={},now=()=>new Date().toISOString()){
 const ids=new Set(reviewCase.riders.map(x=>x.riderId)),requiredRider=(value,name)=>{if(value==='UNKNOWN'||value==null||value==='')return null;if(!ids.has(String(value)))throw Error(`V2_RIDER_INVALID:${name}`);return String(value)};
 const a=input.answers||{},backLeaderRiderId=requiredRider(a.backLeaderRiderId,'backLeaderRiderId');
 const leaderTurnover=enumOf(a.leaderTurnover,['NONE','OCCURRED','UNKNOWN'],'leaderTurnover'),longLeader=enumOf(a.longLeader,['NONE','PRESENT','UNKNOWN'],'longLeader');
 const longLeaderRiderId=longLeader==='PRESENT'?requiredRider(a.longLeaderRiderId,'longLeaderRiderId'):null;if(longLeader==='PRESENT'&&!longLeaderRiderId)throw Error('V2_RIDER_REQUIRED:longLeaderRiderId');
 const longLeaderOutcome=longLeader==='PRESENT'?enumOf(a.longLeaderOutcome,OUTCOMES,'longLeaderOutcome'):null;
 const backLeaderStatus=backLeaderRiderId?'RIDER':'UNKNOWN',backLeaderOutcome=backLeaderRiderId?enumOf(a.backLeaderOutcome,OUTCOMES,'backLeaderOutcome'):'UNKNOWN';
 let bante=null,banteAction=null,lineState=null;if(reviewCase.mode==='STANDARD'){const status=enumOf(a.banteStatus,['RIDER','NONE','UNKNOWN'],'banteStatus'),riderId=status==='RIDER'?requiredRider(a.banteRiderId,'banteRiderId'):null;if(status==='RIDER'&&!riderId)throw Error('V2_RIDER_REQUIRED:banteRiderId');bante={status,riderId};banteAction=status==='RIDER'?enumOf(a.banteAction,BANTE_ACTIONS,'banteAction'):null;lineState=enumOf(a.lineState,['INTACT','PARTIAL_BREAK','COLLAPSED','UNKNOWN'],'lineState');}
 const otherContenders=enumOf(a.otherContenders,['NONE','PRESENT','UNKNOWN'],'otherContenders'),otherContenderRiderIds=otherContenders==='PRESENT'?[...new Set((a.otherContenderRiderIds||[]).map(x=>requiredRider(x,'otherContenderRiderIds')).filter(Boolean))]:[];if(otherContenders==='PRESENT'&&!otherContenderRiderIds.length)throw Error('V2_RIDER_REQUIRED:otherContenderRiderIds');
 const uncertainty=enumOf(a.uncertainty,['NONE','PRESENT'],'uncertainty');
 const known=[backLeaderRiderId,leaderTurnover!=='UNKNOWN',longLeader!=='UNKNOWN',longLeaderOutcome&&longLeaderOutcome!=='UNKNOWN',backLeaderOutcome!=='UNKNOWN',bante?.status&&bante.status!=='UNKNOWN',banteAction&&banteAction!=='UNKNOWN',lineState&&lineState!=='UNKNOWN',otherContenders!=='UNKNOWN'].some(Boolean);
 if(known&&(!input.independentEvidence||!String(input.evidenceSource||'').trim()))throw Error('INDEPENDENT_EVIDENCE_REQUIRED');
 const reviewedAt=now(),reviewerId=String(input.reviewerId||'').trim();if(!reviewerId)throw Error('REVIEWER_REQUIRED');
 const answers={backLeaderStatus,backLeaderRiderId,leaderTurnover,longLeader,longLeaderRiderId,longLeaderOutcome,backLeaderOutcome,bante,banteAction,lineState,otherContenders,otherContenderRiderIds,uncertainty,uncertaintyNote:uncertainty==='PRESENT'?String(a.uncertaintyNote||'').slice(0,500):null};
 const reviewId='V2-'+createHash('sha256').update(`${reviewCase.raceKey}|${reviewerId}|${reviewedAt}`).digest('hex').slice(0,20);
 return Object.freeze({schemaVersion:MANUAL_REVIEW_V2,manualReviewVersion:2,reviewId,raceKey:reviewCase.raceKey,reviewerId,reviewedAt,mode:reviewCase.mode,answers,evidenceSource:String(input.evidenceSource||'unavailable:UNKNOWN'),independentEvidence:Boolean(input.independentEvidence),productionEligible:false,researchLane:'SHADOW_ONLY',historicalMutation:false});
}
