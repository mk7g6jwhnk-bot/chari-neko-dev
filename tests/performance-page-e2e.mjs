// Run: node tests/performance-page-e2e.mjs [playwright package directory] [chrome executable]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
const {chromium}=await import(process.argv[2]?pathToFileURL(path.resolve(process.argv[2],'index.mjs')):'playwright');
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/performance-canonical.json',import.meta.url),'utf8'));
const root=fileURLToPath(new URL('../public/',import.meta.url)),out=fileURLToPath(new URL('../reports/performance-ui/',import.meta.url));fs.mkdirSync(out,{recursive:true});
let statusFailure=false,historyFailure=false,historyPartial=false;
const requests=[],performanceRequests=[],errors=[],checks=[];
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://local'),pathname=url.pathname;
  if(pathname.startsWith('/.netlify/functions/'))requests.push({path:pathname,query:url.search,method:req.method});
  const json=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value))};
  if(pathname.endsWith('/keirin-collector-status'))return json(statusFailure?{ok:false}:fixture.status,statusFailure?503:200);
  if(pathname.endsWith('/keirin-prediction-history')){if(historyFailure)return json({ok:false},503);const day=url.searchParams.get('from');assert.equal(day,url.searchParams.get('to'),'history request is bounded to one saved date');const saved=fixture.histories[day]||{records:[]};return json({ok:true,from:day,to:day,records:historyPartial?[]:saved.records,partial:historyPartial,errors:historyPartial?[{date:day}]:[]})}
  if(pathname.endsWith('/keirin-saved-prediction-summary'))return json({ok:true,records:fixture.histories['20260912'].records});
  if(pathname.endsWith('/keirin-saved-prediction-detail'))return json(fixture.details[url.searchParams.get('raceKey')]||{ok:false});
  if(pathname.endsWith('/keirin-sealed-result'))return json(fixture.results[url.searchParams.get('raceKey')]||{ok:false});
  if(pathname.endsWith('/keirin-discover'))return json({ok:true,cacheStatus:'HIT',meetings:[{venueCode:'12',venueName:'青森',discovery:{links:{raceCards:[{url:'https://keirin.jp/fixture'}]}},races:fixture.status.races.map(row=>({raceNo:row.raceNumber,startTime:row.scheduledStartTime,deadline:row.raceNumber===9?'13:57':'09:57',autoStatus:row.state,resultLifecycleState:row.resultLifecycleState}))}]});
  if(pathname.startsWith('/.netlify/functions/'))return json({ok:false,code:'UNEXPECTED_API'},404);
  const file=path.resolve(root,pathname==='/'?'index.html':'.'+pathname);
  if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('not found')}
  res.writeHead(200,{'content-type':{'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'}[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
const pct=v=>v==null?'—':`${(v*100).toFixed(1)}%`,yen=v=>v==null?'—':`${v.toLocaleString('ja-JP')}円`;
async function assertProjection(page,period){const p=fixture.status.purchasePerformance.periods[period];for(const [key,value] of Object.entries({evaluatedRaces:String(p.evaluatedRaces),betRaces:String(p.betRaces),hitRaces:String(p.hitRaces),hitRate:pct(p.hitRate),investment:yen(p.investment),return:yen(p.return),roi:pct(p.roi)}))assert.equal(await page.locator(`#predictionPerformance section > .performanceKpis > [data-kpi="${key}"] strong`).first().textContent(),value,`${period}/${key}`);for(const key of ['main','cover','thick']){const c=p.categories[key];for(const [field,value] of Object.entries({ticketCount:String(c.ticketCount),hitRaces:String(c.hitRaces),hitRate:pct(c.hitRate),investment:yen(c.investment),return:yen(c.return),roi:pct(c.roi)}))assert.equal(await page.locator(`[data-category="${key}"] [data-kpi="${field}"] strong`).textContent(),value,`${period}/${key}/${field}`)}}
async function noOverflow(page){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no horizontal overflow at ${page.viewportSize().width}`)}
try{
  for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
    statusFailure=historyFailure=historyPartial=false;const startRequest=requests.length;
    const context=await browser.newContext({viewport,timezoneId:'Asia/Tokyo'}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.clock.install({time:new Date(fixture.now)});
    await page.goto(origin);await page.locator('[data-home-race]').waitFor();
    assert.equal(await page.locator('[data-home-race]').count(),1,'only future race on home');assert.ok((await page.locator('#todayRecommendations').textContent()).includes('9R'));assert.equal(await page.locator('#home #collectorProgress, #home #predictionPerformance, #home .recommendationPanel').count(),0);
    await page.click('#openPerformance');await page.locator('[data-performance-hit]').first().waitFor();
    const initialHistoryCount=requests.filter(r=>r.path.endsWith('keirin-prediction-history')).length;
    for(const period of ['today','recent7','recent30','cumulative']){await page.click(`[data-period="${period}"]`);await assertProjection(page,period);await noOverflow(page)}
    assert.equal(requests.filter(r=>r.path.endsWith('keirin-prediction-history')).length,initialHistoryCount,'period changes reuse saved day');
    assert.equal(await page.locator('[data-performance-hit]').count(),2,'no blocked/reference hits');
    await page.locator('.performanceLifecycle summary').click();
    for(const code of ['RESULT_CONFIRMED','RESULT_PENDING','RESULT_RETRYING','RESULT_FETCH_FAILED'])assert.ok((await page.locator('.performanceLifecycle').textContent()).includes(code));
    assert.equal(await page.locator('#performance #collectorProgress').count(),1);assert.ok((await page.locator('#collectorProgress').textContent()).includes('50R監査'));await noOverflow(page);
    await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,`${viewport.width}-performance.png`),fullPage:true});
    for(const key of ['main','cover','thick'])await page.locator(`[data-category="${key}"] summary`).click();await noOverflow(page);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,`${viewport.width}-categories.png`),fullPage:false});await page.locator('[data-performance-hit]').first().click();await page.locator('#detail.active').waitFor();await page.locator('#openSaved').waitFor();assert.equal(await page.locator('#detailTitle').textContent(),'青森 1R');assert.equal(await page.locator('#raceStatus').textContent(),'終了');
    await page.click('#headerBack');await page.locator('#performance.active').waitFor();
    await page.locator('#performanceDay').fill('2026-08-01');await page.locator('#performanceDay').dispatchEvent('change');await page.waitForFunction(()=>document.querySelector('.performanceHit')?.textContent.includes('2026-08-01'));assert.equal(await page.locator('[data-performance-hit]').count(),1);
    await page.click('[data-period="today"]');await page.waitForFunction(()=>document.querySelector('#performanceDay')?.value==='2026-09-12');assert.equal(await page.locator('[data-performance-hit]').count(),2);
    statusFailure=true;await page.click('#refreshPerformance');await page.waitForFunction(()=>document.querySelector('.performanceFreshness')?.textContent.includes('stale'));await assertProjection(page,'today');
    historyPartial=true;await page.click('#refreshPerformanceHistory');await page.waitForFunction(()=>document.querySelector('.performanceHistoryNotice')?.textContent.includes('stale'));assert.equal(await page.locator('[data-performance-hit]').count(),2,'partial response retains last-known');historyPartial=false;historyFailure=true;
    await page.reload();await page.click('#openPerformance');await page.locator('[data-performance-hit]').first().waitFor();await assertProjection(page,'today');assert.ok((await page.locator('.performanceFreshness').textContent()).includes('stale'));
    await page.clock.fastForward(11*60*1000);await page.click('#refreshPerformanceHistory');await page.waitForFunction(()=>document.querySelector('.performanceHistoryNotice')?.textContent.includes('stale'));assert.equal(await page.locator('[data-performance-hit]').count(),2);await noOverflow(page);
    await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,`${viewport.width}-stale.png`),fullPage:true});
    performanceRequests.push(...requests.slice(startRequest));statusFailure=historyFailure=false;
    await page.click('#homeBtn');await page.click('#todayKeirin');await page.locator('#meetings.active').waitFor();assert.equal(await page.locator('#reloadMeetings').count(),1);assert.equal(await page.locator('#bulkRefresh,#runScreening,#runDeepDiveTop,#runDirectDeepDive,#tabScreening').count(),0);
    const futureRows=await page.locator('.timelineRace').evaluateAll(rows=>rows.filter(row=>row.querySelector('.status')?.textContent==='未発走').map(row=>row.textContent));assert.equal(futureRows.length,1);assert.ok(futureRows[0].includes('9R'));await page.click('#reloadMeetings');await page.locator('#meetings.active').waitFor();await page.click('#meetingsPerformance');await page.locator('#performance.active').waitFor();await noOverflow(page);
    checks.push({viewport,periods:'PASS',categories:'PASS',history:'PASS',lifecycle:'PASS',fallback:'PASS',removedControls:'PASS',navigation:'PASS',horizontalOverflow:0});await context.close();
  }
  const context=await browser.newContext({viewport:{width:320,height:740},timezoneId:'Asia/Tokyo'}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));statusFailure=historyFailure=true;await page.goto(origin);await page.click('#openPerformance');await page.waitForFunction(()=>document.querySelector('.performanceHistoryNotice')?.textContent.includes('取得できません'));assert.ok((await page.locator('.performanceFreshness').textContent()).includes('保存済み集計なし'));await noOverflow(page);await context.close();checks.push({emptyCacheOffline:'PASS',width320:'PASS'});
  assert.deepEqual(errors,[],'JS errors');assert.equal(performanceRequests.filter(r=>r.method!=='GET'||/keirin-predict$|keirin-odds$|keirin-screening|keirin-result$/.test(r.path)).length,0,'performance/navigation do not fetch predictions, odds, or official results');
  fs.writeFileSync(path.join(out,'e2e.json'),JSON.stringify({verdict:'PASS',data:'Priority 1 generated production-equivalent sealed records',sourceHashes:fixture.sourceHashes,checks,jsErrors:errors,brokenNavigation:0,blockedHits:0,referenceHits:0,endedInUpcoming:0,performanceReadOnlyRequests:performanceRequests,existingMeetingHooks:requests.filter(r=>r.path.endsWith("keirin-result")),requests},null,2)+'\n');console.log('PASS performance E2E: mobile/desktop, canonical KPI/category equality, history/navigation, lifecycle, stale/last-known, 0 JS errors');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
