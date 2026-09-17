import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LiveActionStore } from './action-tag-live-store.mjs';
import { LiveCollectorAdapter } from './action-tag-live-adapter.mjs';
import { liveCoverage } from './action-tag-live-coverage.mjs';
import { isGirlsRecord, sortRaces } from './action-review/ui-helpers.mjs';
import { buildManualReviewV2 } from './manual-review-v2.mjs';
const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), 'action-review');
export async function startReviewServer({ port = 8767, directory = path.join(assets, '..', 'action-tag-live-data'), metadataFile, recordsDirectory } = {}) {
  if (recordsDirectory) {
    const target = path.resolve(directory), source = await fs.realpath(recordsDirectory);
    if (target === source || target.startsWith(source + path.sep) || source.startsWith(target + path.sep)) throw Error('RESEARCH_SOURCE_STORAGE_OVERLAP');
  }
  const store = await new LiveActionStore(directory).init();
  const adapter = new LiveCollectorAdapter({ store, metadataFile, recordsDirectory });
  const server = http.createServer(async (req, res) => {
    const json = (status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
    try {
      const host = req.headers.host;
      if (![`localhost:${server.address().port}`, `127.0.0.1:${server.address().port}`].includes(host)) return json(403, { error: 'LOCALHOST_ONLY' });
      const origin = `http://${host}`, url = new URL(req.url, origin);
      if (req.headers.origin && req.headers.origin !== origin) return json(403, { error: 'ORIGIN_REJECTED' });
      if (req.headers['sec-fetch-site'] === 'cross-site') return json(403, { error: 'CROSS_SITE_REJECTED' });
      if (req.method === 'POST' && url.pathname === '/api/review') {
        if (req.headers['content-type'] !== 'application/json' || req.headers['x-research-review'] !== '1') return json(403, { error: 'REVIEW_HEADER_REQUIRED' });
        let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 32768) return json(413, { error: 'BODY_TOO_LARGE' }); }
        const input = JSON.parse(body); return json(201, input.manualReviewVersion===2?await store.saveReviewV2(input.raceKey,input):await store.saveReview(input.raceKey, input));
      }
      if (req.method !== 'GET') return json(405, { error: 'METHOD_NOT_ALLOWED' });
      if (url.pathname === '/api/status') return json(200, { coverage: await liveCoverage(store), collector: adapter.snapshot(), enrollment: store.enrollment });
      if (url.pathname === '/api/races') {
        const all = [], reviewer = url.searchParams.get('reviewer') || '', pending = url.searchParams.get('pending') !== '0';
        const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
        for await (const event of store.events('races')) {
          const reviewed = Boolean(await store.reviewedV2(event.raceKey, reviewer)||await store.reviewed(event.raceKey, reviewer));
          if (pending && reviewed) continue;
          all.push({ raceKey: event.raceKey, date: event.raceKey.slice(0,8), venue: event.record.venueName, raceNo: event.record.raceNo || Number(event.raceKey.split('-')[2]), scheduledStartAt:event.record.scheduledStartAt||null, girls:isGirlsRecord(event.record), reviewed });
        }
        const sorted=sortRaces(all),rows=sorted.slice(offset,offset+100);
        return json(200, { rows, nextOffset: offset+rows.length<sorted.length?offset+rows.length:null });
      }
      if (url.pathname.startsWith('/api/race/')) {
        const key = decodeURIComponent(url.pathname.slice('/api/race/'.length)), event = await store.getRace(key);
        if (!event) return json(404, { error: 'RACE_NOT_FOUND' });
        const reviewer=url.searchParams.get('reviewer')||'';return json(200, { ...event, reviewCaseV2:buildManualReviewV2(event.record), priorReviewV2:await store.reviewedV2(key,reviewer), priorReview:await store.reviewed(key,reviewer) });
      }
      const file = { '/': ['index.html', 'text/html'], '/app.mjs': ['app.mjs', 'text/javascript'], '/app-v2.mjs':['app-v2.mjs','text/javascript'], '/ui-helpers.mjs':['ui-helpers.mjs','text/javascript'], '/style.css': ['style.css', 'text/css'] }[url.pathname];
      if (!file) return json(404, { error: 'NOT_FOUND' });
      res.writeHead(200, { 'content-type': `${file[1]}; charset=utf-8`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" });
      res.end(await fs.readFile(path.join(assets, file[0])));
    } catch (error) { json(error.message === 'DUPLICATE_REVIEW' ? 409 : 422, { error: error.message }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  adapter.start();
  return { server, store, adapter, url: `http://localhost:${server.address().port}`, async close() { await adapter.stop(); await new Promise(resolve => server.close(resolve)); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let config = {};
  try { config = JSON.parse(await fs.readFile(path.join(assets, '..', 'action-tag-live.config.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const app = await startReviewServer({ ...config, port: Number(process.env.ACTION_REVIEW_PORT) || config.port || 8767, directory: process.env.ACTION_REVIEW_DATA_DIR || config.directory, metadataFile: process.env.ACTION_REVIEW_METADATA_FILE || config.metadataFile, recordsDirectory: process.env.ACTION_REVIEW_RECORDS_DIR || config.recordsDirectory });
  console.log(`Research review: ${app.url}\nCollector: ${app.adapter.metrics.mode}\nData: ${app.store.directory}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
}
