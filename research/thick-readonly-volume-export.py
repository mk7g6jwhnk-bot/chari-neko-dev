import os,json,datetime,hashlib
root='/data/chari-neko/auto-research/race-lifecycle.json'
records={}; scanned=0; schemas={}; unstable=[]; manifest=[]
ticketKeys='order combination betClass category thickQualified qualification predictionQualificationScore probability naturalConvergenceScore globalRank familyRank pairRank firstRank firstFamilyRank firstFamilyNumber firstFamilyProbability nodeConditionalProbability scenarioCoherence branchFit naturalSeparation originatingScenarioFamily scenarioFamilyRank scenarioFamilySupport scenarioFamilyProbability primaryBranch supportingBranches dominantBranchId purchaseRejectCode purchaseStatus terminalGlobalRank terminalFamilyRank terminalPairRank naturalConvergenceLevel'.split()
def pick(x,keys): return {k:x[k] for k in keys if isinstance(x,dict) and k in x}
def project(r):
 global scanned
 scanned+=1
 sealed=r.get('sealed') or {}; p=sealed.get('researchPrediction') or {}
 if not p.get('performanceSchemaVersion'): p=p.get('prediction') or p
 schema=p.get('performanceSchemaVersion','NONE');schemas[schema]=schemas.get(schema,0)+1
 if schema!='PURCHASE_PERFORMANCE_V2': return None
 standard=(p.get('canonicalPurchasePlan') or {}).get('standardTickets',p.get('standardPurchasePlan',[]));audit=p.get('audit') or {};pa=(p.get('purchase') or {}).get('audit') or audit.get('purchaseAudit') or {};life=pa.get('terminalLifecycleAudit') or []
 if isinstance(life,dict):life=life.get('rows',[])
 ba=audit.get('branchSelectionAudit') or {}
 reduced=pick(p,'engineVersion performanceSchemaVersion purchaseEligibility noBet noBetReason lineConfidence lineMode displayRatingInputs predictionQuality quality predictionRatings displayRatings'.split())
 reduced.update(standardPurchasePlan=[pick(t,ticketKeys) for t in standard],branches=[pick(t,['score']) for t in p.get('branches',[])],scored=[{'startPowerEvidence':pick(t.get('startPowerEvidence'),['confidence','missingInputs']) if t.get('startPowerEvidence') else None} for t in p.get('scored',[])])
 reduced['audit']=pick(audit,'terminalProbabilitySum top3Mass top5Mass purchaseEligibility purchaseMassAudit purchaseFamilyAudit'.split())
 reduced['audit'].update(branchSelectionAudit={'rows':[pick(t,['score','share']) for t in ba.get('rows',[])],'tiering':pick(ba.get('tiering'),['contenderCutGap'])},purchaseAudit={'terminalLifecycleAudit':[pick(t,ticketKeys) for t in life]})
 return {'raceKey':r['raceKey'],'ratingRace':pick((sealed.get('officialData') or {}).get('basic'),['raceCategory','lineMode']),'sealed':dict(pick(sealed,['predictionSealedAt','scheduledStartAt','predictionHash']),researchPrediction=reduced),'temporalAudit':pick(r.get('temporalAudit'),['passed']),'verification':pick(r.get('verification'),['state','mutationDetected']) if r.get('verification') else None,'result':{'result':pick((r.get('result') or {}).get('result'),['status','finishOrder','payout','trifectaPayout'])}}
def consume(r):
 x=project(r)
 if x:records[r['raceKey']]=x
 elif r.get('raceKey') in records:del records[r['raceKey']]
def objects(file):
 decoder=json.JSONDecoder();buf='';eof=False
 with open(file,encoding='utf8') as f:
  while True:
   buf=buf.lstrip(' \r\n\t,[]')
   if not buf and eof:break
   try:
    obj,end=decoder.raw_decode(buf);buf=buf[end:];yield obj
   except json.JSONDecodeError:
    more=f.read(1024*1024)
    if not more:
     if eof:raise
     eof=True
    buf+=more
baseStat=os.stat(root)
for r in objects(root):consume(r)
if os.stat(root).st_mtime_ns!=baseStat.st_mtime_ns:unstable.append('base')
paths=sorted(os.path.join(d,n) for d,_,names in os.walk(root+'.records') for n in names if n.endswith('.json'))
for file in paths:
 s=os.stat(file)
 with open(file,encoding='utf8') as f:r=json.load(f)
 consume(r)
 if os.stat(file).st_mtime_ns!=s.st_mtime_ns:unstable.append(r.get('raceKey'))
 if r.get('raceKey') in records:manifest.append([r['raceKey'],s.st_size,s.st_mtime_ns])
allrows=sorted(records.values(),key=lambda r:r['sealed'].get('predictionSealedAt',''),reverse=True);latest=set(r['raceKey'] for r in allrows[:100]);selected=[r for r in allrows if r['raceKey'] in latest or r['result']['result'].get('status')=='confirmed']
print(json.dumps({'extractedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scanned':scanned,'totalV2':len(allrows),'schemas':schemas,'unstableWhileRead':unstable,'sourceManifestSha256':hashlib.sha256(json.dumps(manifest).encode()).hexdigest(),'records':selected},ensure_ascii=False))
