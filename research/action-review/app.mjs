const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let pending = true, rows = [], current = null, answers = {}, active = 0, history = [], nextOffset = null, busy = false;
$('reviewer').value = localStorage.getItem('action-reviewer') || '';
const reviewer = () => $('reviewer').value.trim();
const draftKey = () => `action-draft:${reviewer()}:${current?.raceKey}`;
async function api(url, options) { const response = await fetch(url, options); const body = await response.json(); if (!response.ok) throw Error(body.error || response.status); return body; }
function notify(error) { $('message').textContent = error?.message || error || ''; }
function draft() { if (!current || current.priorReview) return; localStorage.setItem(draftKey(), JSON.stringify({ answers, active, initiative: $('initiative')?.value, bante: $('bante')?.value, other: $('other')?.value, source: $('source')?.value, evidence: $('independent')?.checked })); }
async function status() {
  const { coverage: c, collector } = await api('/api/status');
  $('connection').textContent = collector.mode === 'SOURCE_NOT_CONFIGURED' ? '自動接続：未設定' : `自動接続：${collector.lastError ? '要確認' : '稼働'} / queue ${collector.queueDepth}`;
  const stats = [['収集レース', `${c.taggedRaces} / 300`], ['確認済み / 未確認', `${c.reviewedRaces} / ${c.pendingRaces}`], ['AUTO_DIRECT / STRONG_PROXY', `${c.AUTO_DIRECT} / ${c.STRONG_PROXY}`], ['CONFIRMED / SUPPORTED', `${c.CONFIRMED} / ${c.STRONGLY_SUPPORTED}`], ['UNKNOWN率（人の回答）', c.unknownRate === null ? '—' : `${Math.round(c.unknownRate * 100)}%`]];
  $('coverage').innerHTML = stats.map(([label, value], i) => `<div class="stat"><span>${label}</span><b>${value}</b>${i === 0 ? `<progress max="300" value="${c.taggedRaces}"></progress>` : ''}</div>`).join('');
  $('details').innerHTML = `<table><tr><th>state</th><th>全件</th><th>確認 / 支持</th><th>目標60</th></tr>${Object.entries(c.states).map(([key, row]) => `<tr><td>${key}</td><td>${row.total}</td><td>${row.confirmed} / ${row.supported}</td><td><progress max="60" value="${row.confirmed + row.supported}"></progress></td></tr>`).join('')}</table><h2>conditional cell / 目標50件</h2>${Object.entries(c.conditionalCells).map(([key, count]) => `<p>${esc(key)}：${count} / 50 <progress max="50" value="${count}"></progress></p>`).join('') || '<p>独立した確認データがまだありません。</p>'}<p>collector failures: ${collector.failures} / heap guard: ${collector.heapGuards} / RSS: ${Math.round(collector.memory.rss / 1048576)} MB</p><p>${esc(collector.lastError || '')}</p>`;
}
async function list(append = false) {
  const data = await api(`/api/races?reviewer=${encodeURIComponent(reviewer())}&pending=${pending ? 1 : 0}&offset=${append ? nextOffset : 0}`);
  rows = append ? [...rows, ...data.rows] : data.rows; nextOffset = data.nextOffset;
  $('races').innerHTML = rows.map(row => `<button data-race="${esc(row.raceKey)}">${esc(row.raceKey)}<br>${esc(row.venue || '')} ${row.reviewed ? '確認済み' : '未確認'}</button>`).join('') || '<p class="empty">対象レースはありません。</p>';
  $('more').hidden = nextOffset === null;
  for (const button of $('races').querySelectorAll('button')) button.onclick = () => openRace(button.dataset.race).catch(notify);
}
function riderOptions(riders, value) { return '<option value="">未指定</option>' + riders.map(r => `<option value="${esc(r.riderId)}" ${r.riderId === value ? 'selected' : ''}>${r.number} ${esc(r.name || r.riderId)}</option>`).join(''); }
async function openRace(key, remember = true) {
  draft();
  if (remember && current && current.raceKey !== key) history.push(current.raceKey);
  current = await api(`/api/race/${encodeURIComponent(key)}?reviewer=${encodeURIComponent(reviewer())}`);
  localStorage.setItem(`action-last:${reviewer()}`, key);
  const saved = JSON.parse(localStorage.getItem(draftKey()) || '{}'); answers = saved.answers || {}; active = saved.active || 0;
  if (current.priorReview) Object.assign(saved, {source:current.priorReview.evidenceSource,evidence:current.priorReview.independentEvidence,initiative:current.priorReview.targetRiders?.initiative,bante:current.priorReview.targetRiders?.bante,other:current.priorReview.targetRiders?.other});
  if (current.priorReview) answers = Object.fromEntries(current.priorReview.judgments.map(j => [j.questionId, { value: ({ CLEAN_LEAD:'CLEAN',CONTESTED_LEAD:'CONTESTED',PRESERVED:'INTACT' })[j.finalHumanJudgment.stateValue] || j.finalHumanJudgment.stateValue, status: j.finalHumanJudgment.verificationStatus }]));
  const c = current.reviewCase, riders = c.lineup.flatMap(line => line.riders);
  $('review').innerHTML = `<h1>${esc(key)} ${esc(current.record.venueName || '')} ${current.record.raceNo}R</h1><div class="metadata">${esc(current.record.scheduledStartAt || '日時情報なし')} ${current.priorReview ? '／ この確認者は保存済み' : ''}</div><div class="metadata">並び：${c.lineup.map(line => line.riders.map(r => `${r.number} ${esc(r.name || '')}`).join(' → ')).join(' ／ ')}</div><div class="metadata">主導権候補：${esc(c.initiativeCandidate?.number || '不明')} ／ 番手候補：${esc(c.banteCandidate?.number || '不明')}</div><div class="chips">${current.tags.filter(t => t.collectionLane !== 'MANUAL_REVIEW').map(t => `<span class="chip">${t.collectionLane === 'AUTO_DIRECT' ? 'AUTO_DIRECT' : 'STRONG_PROXY'} · ${esc(t.riderId)} ${t.stateType}=${t.stateValue} (${t.verificationStatus})</span>`).join('') || '自動候補なし'}</div><div>${current.record.officialVideoUrls.map(url => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">公式映像を開く ↗</a>`).join(' ') || '公式映像URL：未取得（必要なら公式サイトで確認）'}</div><div class="targets"><label>主導権選手 <select id="initiative">${riderOptions(riders, saved.initiative)}</select></label><label>番手選手 <select id="bante">${riderOptions(riders, saved.bante)}</select></label><label>Q5対象選手 <select id="other">${riderOptions(riders, saved.other)}</select></label><label>確認の強さ <select id="strength"><option>CONFIRMED</option><option>STRONGLY_SUPPORTED</option><option>POSSIBLE</option></select></label></div><div id="questions"></div><div class="evidence"><input id="source" type="text" aria-label="映像URLまたは観測メモ" placeholder="映像URL・確認時刻、または独立した観測メモ" value="${esc(saved.source || '')}"><label><input type="checkbox" id="independent" ${saved.evidence ? 'checked' : ''}>映像・独立観測で確認した</label></div><div class="actions"><button id="previous">前Rへ戻る</button><button id="unknown-all">全項目 UNKNOWN</button><button id="save" class="primary" ${current.priorReview ? 'disabled' : ''}>保存して次へ</button></div>`;
  renderQuestions();
  for (const id of ['initiative','bante','other','source','independent']) $(id).onchange = draft;
  $('previous').onclick = previous; $('save').onclick = () => save().catch(notify);
  $('unknown-all').onclick = () => { if (current.priorReview) return; for (const q of c.questions.filter(q => !q.optional)) answers[q.id] = {value:'UNKNOWN',status:'UNKNOWN'}; renderQuestions(); draft(); };
}
function renderQuestions() {
  $('questions').innerHTML = current.reviewCase.questions.map((q, i) => `<section class="question ${active === i ? 'active' : ''}" data-question="${i}"><h2>Q${i+1} ${esc(q.label)} ${q.optional ? '（任意）' : ''}</h2><div class="choices">${q.values.map((value,j) => `<button data-q="${i}" data-v="${value}" aria-pressed="${answers[q.id]?.value === value}" ${current.priorReview ? 'disabled' : ''}>${j+1} ${value}</button>`).join('')}${answers[q.id] ? `<span>${answers[q.id].status}</span>` : ''}</div></section>`).join('');
  for (const button of $('questions').querySelectorAll('button')) button.onclick = () => choose(Number(button.dataset.q), button.dataset.v);
}
function choose(index, value) { if (current.priorReview) return; const q = current.reviewCase.questions[index]; answers[q.id] = {value,status:value === 'UNKNOWN' ? 'UNKNOWN' : $('strength').value}; active = Math.min(index + 1, 3); renderQuestions(); draft(); }
async function previous() { const key = history.pop(); if (key) await openRace(key, false); }
async function save() {
  if (!current || current.priorReview || busy) return;
  if (!reviewer()) throw Error('確認者IDを入力してください');
  busy = true; $('save').disabled = true;
  try {
    await api('/api/review', { method:'POST', headers:{'content-type':'application/json','x-research-review':'1'}, body:JSON.stringify({raceKey:current.raceKey,reviewerId:reviewer(),answers,evidenceSource:$('source').value,independentEvidence:$('independent').checked,initiativeRiderId:$('initiative').value,banteRiderId:$('bante').value,otherRiderId:$('other').value}) });
    localStorage.removeItem(draftKey()); current.priorReview = true;
    const old = current.raceKey; await list(); await status(); notify('保存しました');
    const next = rows.find(row => row.raceKey !== old && !row.reviewed);
    if (next) await openRace(next.raceKey); else { current = null; $('review').innerHTML = '<h1>未確認レースはありません</h1><p>保存済みデータは「確認済みを含む」から参照できます。</p>'; }
  } finally { busy = false; if ($('save') && !current?.priorReview) $('save').disabled = false; }
}
document.addEventListener('keydown', event => {
  if (!current || busy || ['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)) return;
  const q = current.reviewCase.questions[active];
  if (event.ctrlKey && event.key === 'Enter') { event.preventDefault(); save().catch(notify); }
  else if (event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); previous().catch(notify); }
  else if (/^[1-6]$/.test(event.key) && q.values[Number(event.key)-1]) choose(active,q.values[Number(event.key)-1]);
  else if (event.key.toLowerCase() === 'u') choose(active,'UNKNOWN');
  else if (['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); active = Math.max(0,Math.min(4,active+(event.key === 'ArrowDown' ? 1 : -1))); renderQuestions(); draft(); }
});
$('reviewer').onchange = async () => { localStorage.setItem('action-reviewer',reviewer()); current = null; await list(); $('review').innerHTML = '<h1>レースを選択してください</h1>'; };
$('pending').onclick = () => { pending = true; list().catch(notify); };
$('all').onclick = () => { pending = false; list().catch(notify); };
$('more').onclick = () => list(true).catch(notify);
$('refresh').onclick = () => Promise.all([status(),list()]).catch(notify);
try { await status(); await list(); const last = localStorage.getItem(`action-last:${reviewer()}`); if (last) await openRace(last); } catch (error) { notify(error); }
setInterval(() => status().catch(notify),30000);
