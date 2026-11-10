// app.js — 화면 렌더링과 사용자 흐름. 계산은 logic.js, 시간은 timer.js가 담당합니다.
import * as L from './logic.js';
import * as T from './timer.js';
import { db } from './db.js';
import { character } from './character.js';

const APP_VERSION = '1.0.0';
const $app = document.getElementById('app');
const S = {
  screen: 'home', profile: null, workouts: [], choice: null, active: null, draft: null,
  viewId: null, viewFrom: 'home', histMonth: null, histDay: null, pf: null, ui: {}, sound: true,
  lastBackup: null, lastDistSource: 'machine', saving: false, theme: 'auto', persisted: null,
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const num = (v) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const fmtDate = (d, opt = { month: 'long', day: 'numeric', weekday: 'long' }) => new Intl.DateTimeFormat('ko-KR', opt).format(d);
const CHECK = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const BOAT = '<svg class="boat" viewBox="0 0 30 18" aria-hidden="true"><path d="M3 10h24l-4 6H7z" fill="var(--ink)"/><circle cx="15" cy="6.5" r="4" fill="var(--char-body)" stroke="var(--ink)" stroke-width="1.2"/><path d="M5 3l20 12" stroke="var(--ink)" stroke-width="1.6" stroke-linecap="round"/></svg>';

/** 붙여 넣은 페이스: "2:05", "2.05", "205" 모두 허용 */
function parsePaceInput(v) {
  if (v == null) return null;
  let t = String(v).trim();
  if (!t) return null;
  if (/^\d{3,4}$/.test(t)) t = `${t.slice(0, -2)}:${t.slice(-2)}`;
  else if (/^\d{1,2}\.\d{2}$/.test(t)) t = t.replace('.', ':');
  return L.parseClock(t);
}
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

/* ───────── 오디오·화면 꺼짐 방지 ───────── */
let ac = null, wakeLock = null;
function unlockAudio() {
  try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch { /* 소리 없이 진행 */ }
}
function beep(freq = 880, dur = 0.12, when = 0) {
  if (!ac || !S.sound) return;
  try {
    const o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime + when;
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.03);
  } catch { /* 무시 */ }
}
async function requestWake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { /* 지원 안 함 */ }
}
function releaseWake() { try { wakeLock?.release(); } catch { /* */ } wakeLock = null; }

/* ───────── 프로그램 ───────── */
function currentProgram(choice = S.choice) {
  const p = L.generateProgram({ goal: choice.goal, minutes: choice.minutes, level: S.profile?.level || 'beginner', custom: choice.custom, extraReps: choice.extraReps || 0 });
  return L.attachTargets(p, S.profile, S.workouts);
}
function hrSnap() {
  const c = L.hrContext(S.profile);
  return c ? { rest: c.rest, max: c.max, estimated: c.estimated } : null;
}
const saveChoice = () => db.set('choice', S.choice);
const saveActive = () => (S.active ? db.set('active', S.active) : db.del('active'));
const saveDraftLocal = (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => db.set('draft', S.draft), 300); }; })();

/* ───────── 공통 조각 ───────── */
function lane(segs, progressSec = null, doneIdx = -1) {
  const total = L.sumSec(segs) || 1;
  const pct = progressSec == null ? null : Math.min(100, (progressSec / total) * 100);
  return `<div class="lane" role="img" aria-label="구간 타임라인">
    ${segs.map((s, i) => `<div class="seg z${s.zoneId} ${i < doneIdx ? 'done' : ''}" style="flex:${s.durationSec}"></div>`).join('')}
    ${pct == null ? '' : `<div class="wake" id="wake" style="width:${pct}%"></div><div id="boat" style="position:absolute;inset:0;pointer-events:none"><span style="position:absolute;top:50%;left:${pct}%;transform:translate(-50%,-50%)">${BOAT}</span></div>`}
  </div>`;
}
function tags(t) {
  const z = L.getZone(t.zoneId);
  return `<div class="tags">
    <span class="tag zone z${z.id}">${z.short}</span>
    <span class="tag">RPE ${t.rpe[0]}–${t.rpe[1]}</span>
    ${t.hr ? `<span class="tag">심박 ${t.hr[0]}–${t.hr[1]}</span>` : ''}
    ${t.pace ? `<span class="tag">${L.fmtPaceRange(t.pace)} /500m</span>` : ''}
    <span class="tag">${t.spm[0]}–${t.spm[1]} spm</span>
  </div>`;
}
const PHASES = [['warmup', '1 웜업'], ['main', '2 본운동'], ['cooldown', '3 쿨다운']];
function programList(p) {
  return PHASES.map(([ph, label]) => {
    const xs = p.segments.filter((s) => s.phase === ph);
    if (!xs.length) return '';
    return `<div class="phase-title">${label} · ${L.fmtDuration(L.sumSec(xs))}</div><ul class="seglist">${xs.map((s) => `
      <li class="segitem z${s.zoneId}">
        <div class="spread"><span class="name">${esc(s.name)}</span><span class="dur">${L.fmtClock(s.durationSec)}</span></div>
        ${tags(s.target)}
        <div class="note">${esc(s.desc)}${s.target.hrNote ? `<br>${esc(s.target.hrNote)}` : ''}</div>
      </li>`).join('')}</ul>`;
  }).join('');
}
function contextNotes(p) {
  const n = [];
  if (!p.context.hr) n.push('심박 정보가 없어 RPE(자각강도)로 안내해요. 설정에 안정시 심박수를 넣으면 목표 심박이 표시돼요.');
  else if (p.context.hr.estimated) n.push(`최대 심박수 ${p.context.hr.max}bpm은 나이로 추정한 값(208 − 0.7 × 나이)이에요. 실제와 10bpm 이상 다를 수 있어요.`);
  if (!p.context.anchor) n.push('기준 기록이 없어 페이스는 제시하지 않아요. 설정에 2,000m 기록 등을 넣으면 목표 페이스가 표시돼요.');
  else n.push(`페이스: ${p.context.anchor.label}`);
  return n.map((x) => `<p class="note">${esc(x)}</p>`).join('');
}
function stepper(label, value, act, k, step, display) {
  return `<div class="field"><span class="label">${label}</span>
    <div class="row"><button class="btn sm" data-act="${act}" data-k="${k}" data-d="${-step}" aria-label="${label} 줄이기">−</button>
    <span class="big-num" style="font-size:24px;min-width:84px;text-align:center">${display ?? value}</span>
    <button class="btn sm" data-act="${act}" data-k="${k}" data-d="${step}" aria-label="${label} 늘리기">+</button></div></div>`;
}
const NAV = [
  ['home', '홈', '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>'],
  ['history', '기록', '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>'],
  ['stats', '분석', '<path d="M5 19V11M12 19V5M19 19v-6"/>'],
  ['settings', '설정', '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>'],
];
function nav() {
  const cur = { result: S.viewFrom, post: 'home' }[S.screen] || S.screen;
  return `<nav class="nav" aria-label="메인 메뉴">${NAV.map(([id, label, path]) => `
    <button data-act="go" data-v="${id}" ${cur === id ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>${label}</button>`).join('')}</nav>`;
}

/* ───────── 홈 ───────── */
function homeView() {
  const p = currentProgram();
  const rec = L.recommend(S.workouts, S.profile || {});
  const isRepeat = !!p.repeat;
  const c = S.choice;
  const customMin = !L.DURATIONS.includes(c.minutes) || S.ui.customMin;
  const needBackup = S.workouts.length >= 3 && (!S.lastBackup || (Date.now() - new Date(S.lastBackup)) / 86400000 > 14);
  return `
  <div class="topbar"><span class="date">${fmtDate(new Date())}</span></div>
  <div class="hero">${character('home', 'md')}<h1>오늘은 어떤 로잉 훈련을 할까요?</h1></div>
  ${S.active ? `<div class="banner"><h3>진행 중인 운동이 있어요</h3><p class="small">${esc(L.GOALS[S.active.program.goal].name)} · ${L.fmtDuration(S.active.program.plannedSec)}</p>
    <div class="row"><button class="btn primary sm" data-act="resume-active">이어서 하기</button><button class="btn sm" data-act="end-active">종료하고 기록</button></div></div>` : ''}
  ${needBackup ? `<div class="banner" style="background:var(--mint)"><p class="small">기록이 기기에만 저장돼 있어요. Safari 데이터가 지워지면 사라지니 가끔 백업해 두세요.</p><button class="btn sm" data-act="export">지금 백업하기</button></div>` : ''}
  <section class="card tint" aria-labelledby="rec-h">
    <h2 id="rec-h">${rec.dataEnough ? '오늘의 추천' : '추천(일반 수준)'}</h2>
    <p><b>${esc(L.GOALS[rec.goal].name)} ${rec.minutes}분${rec.extraReps ? ' · 반복 +1회' : ''}</b></p>
    ${rec.reasons.map((r) => `<p class="small">${esc(r)}</p>`).join('')}
    ${rec.insights.map((r) => `<p class="small">📈 ${esc(r.text)}</p>`).join('')}
    <button class="btn sm" data-act="apply-rec">추천대로 설정</button>
    <span class="small muted"> 언제든 아래에서 바꿀 수 있어요.</span>
  </section>
  <h2>훈련 목적</h2>
  <div class="goals" role="group" aria-label="훈련 목적">
    ${Object.values(L.GOALS).map((g) => `
    <button class="goal g-${g.id}" data-act="goal" data-v="${g.id}" aria-pressed="${c.goal === g.id}">
      <span class="letter">${g.letter}</span><span><span class="t">${g.name}</span><br><span class="d">${g.desc}</span></span>
    </button>`).join('')}
  </div>
  <h2 style="margin-top:20px">운동 시간</h2>
  <div class="chips" role="group" aria-label="운동 시간">
    ${L.DURATIONS.map((m) => `<button class="chip" data-act="min" data-v="${m}" aria-pressed="${!customMin && c.minutes === m}">${m}분</button>`).join('')}
    <button class="chip" data-act="min-custom" aria-pressed="${customMin}">직접 입력</button>
  </div>
  ${customMin ? `<div class="field" style="margin-top:10px"><label for="cmin">운동 시간(분, 5–120)</label><input id="cmin" type="number" inputmode="numeric" min="5" max="120" value="${c.minutes}" data-field="customMinutes"></div>` : ''}
  <section class="card" style="margin-top:18px" aria-labelledby="prog-h">
    <div class="spread"><h2 id="prog-h">오늘의 프로그램</h2><span class="big-num" style="font-size:22px">${L.fmtDuration(p.plannedSec)}</span></div>
    ${lane(p.segments)}
    <div class="lane-legend"><span>웜업</span><span>본운동</span><span>쿨다운</span></div>
    ${p.plannedSec !== c.minutes * 60 ? `<p class="note">조정한 구성에 맞춰 전체 시간이 ${L.fmtDuration(p.plannedSec)}로 다시 계산됐어요.</p>` : ''}
    ${contextNotes(p)}
    ${isRepeat ? customEditor(p) : ''}
    ${programList(p)}
  </section>
  <div style="height:70px"></div>
  <div class="sticky-cta"><button class="btn primary big block" data-act="start" ${S.active ? 'disabled' : ''}>운동 준비하기 · ${L.fmtDuration(p.plannedSec)}</button></div>`;
}
function customEditor(p) {
  const r = p.repeat;
  const paceShown = p.customPaceSec ? L.fmtPace(p.customPaceSec) : '자동';
  return `<details class="collapse card soft" style="margin-top:12px" data-ui="cust" ${S.ui.cust ? 'open' : ''}>
    <summary>인터벌 직접 조정</summary>
    <div class="grid2">
      ${stepper('운동 구간', r.workSec, 'cust', 'workSec', 15, L.fmtClock(r.workSec))}
      ${stepper('회복 구간', r.restSec, 'cust', 'restSec', 15, L.fmtClock(r.restSec))}
      ${stepper('반복 횟수', r.reps, 'cust', 'reps', 1, `${r.reps}회`)}
      ${stepper('목표 페이스', 0, 'cust', 'paceSec', 1, paceShown)}
    </div>
    <div class="field"><span class="label">운동 강도</span>
      <div class="seg-ctl">${[3, 4, 5].map((z) => `<button data-act="cust-zone" data-v="${z}" aria-pressed="${r.zoneId === z}">${L.getZone(z).short}</button>`).join('')}</div></div>
    <div class="row wrap"><button class="btn sm" data-act="cust-reset">기본 구성으로</button>${p.customPaceSec ? '<button class="btn sm" data-act="cust-pace-auto">페이스 자동</button>' : ''}</div>
    <p class="note">바꾸면 전체 시간이 바로 다시 계산돼요. 강도와 시간을 한 번에 크게 올리지 않는 것을 권해요.</p>
  </details>`;
}

/* ───────── 운동 진행 ───────── */
function phaseState(seg) {
  if (!seg) return 'done';
  if (seg.phase === 'warmup') return 'warmup';
  if (seg.phase === 'cooldown') return 'cooldown';
  if (seg.kind === 'rest') return 'rest';
  return seg.kind === 'work' || seg.zoneId >= 4 ? 'work' : 'steady';
}
function trainView() {
  const a = S.active, p = a.program, t = a.timer, now = Date.now();
  const seg = p.segments[t.segIndex];
  const next = p.segments[t.segIndex + 1];
  const notStarted = !t.running && t.accumMs === 0;
  const remain = seg ? seg.durationSec - T.segElapsedMs(t, now) / 1000 : 0;
  const act = T.activeMs(t, now) / 1000;
  const checked = t.log.filter((l) => l.checked).length;
  return `<div class="train">
    <div class="train-top">
      <div class="spread"><span class="goal-name">${esc(L.GOALS[p.goal].name)}</span>
        <button class="btn ghost sm" data-act="sound" aria-pressed="${S.sound}">${S.sound ? '🔔 소리 켬' : '🔕 소리 끔'}</button></div>
      <div class="spread small muted num"><span id="el">${L.fmtClock(act)} / ${L.fmtClock(p.plannedSec)}</span><span id="pct">${Math.floor((act / p.plannedSec) * 100)}% · 체크 ${checked}/${p.segments.length}</span></div>
      <div style="margin-top:6px">${lane(p.segments, act, t.segIndex)}</div>
    </div>
    <section class="now" aria-live="polite">
      ${character(notStarted ? 'home' : phaseState(seg), 'sm')}
      ${seg ? `<span class="phase-pill ${seg.phase === 'main' && seg.kind !== 'rest' ? 'main' : ''}">${{ warmup: '웜업', main: seg.kind === 'rest' ? '회복' : '본운동', cooldown: '쿨다운' }[seg.phase]}</span>
      <p class="segname">${esc(seg.name)}</p>
      <div class="timer ${t.running ? '' : 'paused'}" id="tm" role="timer">${L.fmtClock(Math.ceil(remain))}</div>
      <div class="targets">
        <div class="tgt"><div class="k">목표 강도</div><div class="v" style="font-size:16px">${L.getZone(seg.zoneId).name}</div></div>
        <div class="tgt"><div class="k">RPE</div><div class="v">${seg.target.rpe[0]}–${seg.target.rpe[1]}</div></div>
        <div class="tgt"><div class="k">심박(bpm)</div><div class="v">${seg.target.hr ? `${seg.target.hr[0]}–${seg.target.hr[1]}` : '<span style="font-size:14px">RPE 기준</span>'}</div></div>
        <div class="tgt"><div class="k">페이스 /500m</div><div class="v">${seg.target.pace ? L.fmtPaceRange(seg.target.pace) : '<span style="font-size:14px">느낌대로</span>'}</div></div>
        <div class="tgt" style="grid-column:1/-1"><div class="k">SPM</div><div class="v">${seg.target.spm[0]}–${seg.target.spm[1]}</div></div>
      </div>
      <p class="note">${esc(seg.desc)}${seg.target.hrNote ? ` ${esc(seg.target.hrNote)}` : ''}</p>
      <p class="next">${next ? `다음: ${esc(next.name)} · ${L.fmtClock(next.durationSec)}` : '마지막 구간이에요'}</p>` : '<p class="segname">모든 구간 완료!</p>'}
    </section>
    ${notStarted
      ? `<button class="btn primary big block" data-act="t-start">로잉머신에 앉았어요 · 시작</button>
         <button class="btn block" data-act="t-cancel">취소하고 돌아가기</button>`
      : `${seg ? `<button class="bigcheck" data-act="t-check" data-v="${t.segIndex}" aria-pressed="${t.log[t.segIndex].checked}"><span class="box">${CHECK}</span>이 구간 완료</button>` : ''}
      <div class="controls">
        <button class="btn big" data-act="t-pause">${t.running ? '일시정지' : '재개'}</button>
        <button class="btn big" data-act="t-skip" ${seg ? '' : 'disabled'}>다음 구간</button>
        <button class="btn danger full" data-act="t-end">운동 종료</button>
      </div>`}
    <details class="collapse card soft" data-ui="clist" ${S.ui.clist !== false ? 'open' : ''}>
      <summary>체크리스트 ${checked}/${p.segments.length}</summary>
      <ul class="checklist">${p.segments.map((s, i) => {
        const l = t.log[i];
        const st = i === t.segIndex ? '진행 중' : l.status === 'done' ? '완료' : l.status === 'partial' ? `${L.fmtClock(l.actualSec)} 수행` : l.status === 'skipped' ? '건너뜀' : L.fmtClock(s.durationSec);
        return `<li class="${i === t.segIndex ? 'current' : ''} ${l.checked ? 'checked' : ''}">
          <button class="cb" data-act="t-check" data-v="${i}" aria-pressed="${l.checked}" aria-label="${esc(s.name)} 완료 표시">${CHECK}</button>
          <span class="nm">${esc(s.name)}</span><span class="st">${st}</span></li>`;
      }).join('')}</ul>
    </details>
  </div>`;
}
let loop = null, lastBeepKey = '';
function startLoop() {
  stopLoop();
  loop = setInterval(trainTick, 250);
}
function stopLoop() { if (loop) clearInterval(loop); loop = null; }
function trainTick() {
  if (S.screen !== 'train' || !S.active) return stopLoop();
  const a = S.active, p = a.program, now = Date.now();
  const { t, events } = T.tick(a.timer, p.segments, now);
  if (events.length) {
    a.timer = t; saveActive();
    if (events.some((e) => e.type === 'finished')) { beep(660, 0.15); beep(880, 0.15, 0.18); beep(1100, 0.3, 0.36); releaseWake(); stopLoop(); goPost(); return; }
    beep(880, 0.12); beep(1175, 0.2, 0.15);
    render();
    return;
  }
  const seg = p.segments[t.segIndex];
  if (!seg) return;
  const remain = Math.ceil(seg.durationSec - T.segElapsedMs(t, now) / 1000);
  const act = T.activeMs(t, now) / 1000;
  const tm = document.getElementById('tm');
  if (tm) tm.textContent = L.fmtClock(remain);
  const el = document.getElementById('el');
  if (el) el.textContent = `${L.fmtClock(act)} / ${L.fmtClock(p.plannedSec)}`;
  const pct = Math.min(100, (act / p.plannedSec) * 100);
  const wake = document.getElementById('wake');
  if (wake) wake.style.width = `${pct}%`;
  const boat = document.querySelector('#boat > span');
  if (boat) boat.style.left = `${pct}%`;
  const pe = document.getElementById('pct');
  if (pe) pe.textContent = `${Math.floor(pct)}% · 체크 ${t.log.filter((l) => l.checked).length}/${p.segments.length}`;
  if (t.running && remain <= 3 && remain >= 1) {
    const key = `${t.segIndex}:${remain}`;
    if (key !== lastBeepKey) { lastBeepKey = key; beep(660, 0.08); }
  }
}

/* ───────── 운동 후 기록 ───────── */
function goPost() {
  const a = S.active;
  if (!a) return go('home');
  const t = a.timer, p = a.program;
  const workIdx = p.segments.map((s, i) => (s.kind === 'work' ? i : -1)).filter((i) => i >= 0);
  S.draft = {
    mode: 'new', id: a.id,
    actualSec: T.totalActualSec(t) || Math.round(T.activeMs(t, Date.now()) / 1000),
    completed: t.log.every((l) => l.checked),
    intervalsDone: p.intervalsPlanned ? workIdx.filter((i) => t.log[i].checked).length : null,
    memo: '', avgHR: null, maxHR: null, distance: null, distanceSource: S.lastDistSource, avgPaceSec: null, avgSpm: null,
    machineNote: '', rpe: null, condition: null, pain: false,
  };
  db.set('draft', S.draft);
  go('post');
}
function draftPlan() {
  const d = S.draft;
  if (d.mode === 'new') return S.active?.program;
  if (d.mode === 'edit') return S.workouts.find((w) => w.id === d.id)?.plan;
  return d.plan;
}
function postView() {
  const d = S.draft, plan = draftPlan();
  if (!plan) return '<p>기록할 운동을 찾을 수 없어요.</p><button class="btn" data-act="discard">닫기</button>';
  const prev = L.findPrevious({ id: d.id, createdAt: d.createdAt || S.active?.startedAt || new Date().toISOString(), goal: plan.goal, plan }, S.workouts)?.prev;
  const ph = (v, f = (x) => x) => (prev && L.isNum(prev[v]) ? `지난번 ${f(prev[v])}` : '');
  const g = d.rpe ? L.rpeGroup(d.rpe) : null;
  const am = Math.floor((d.actualSec || 0) / 60), as = Math.round((d.actualSec || 0) % 60);
  const err = S.ui.postErr || {};
  return `
  <h1>${d.mode === 'edit' ? '기록 수정' : '오늘 운동은 어떠셨나요?'}</h1>
  <p class="muted small">${esc(L.GOALS[plan.goal].name)} · 계획 ${L.fmtDuration(plan.plannedSec)}. 빈칸은 그대로 두어도 저장돼요.</p>
  ${d.mode === 'manual' ? `<section class="card">
    <div class="field"><label for="mdate">운동한 날짜</label><input id="mdate" type="date" value="${esc(d.date)}" max="${L.localDateStr()}" data-field="date"></div>
    <div class="grid2">
      <div class="field"><label for="mgoal">훈련 목적</label><select id="mgoal" data-field="goal">${Object.values(L.GOALS).map((x) => `<option value="${x.id}" ${x.id === plan.goal ? 'selected' : ''}>${x.name}</option>`).join('')}</select></div>
      <div class="field"><label for="mmin">계획 시간(분)</label><input id="mmin" type="number" inputmode="numeric" min="5" max="120" value="${plan.minutes}" data-field="minutes"></div>
    </div>
    <p class="note">타이머 없이 입력한 기록이라 체크리스트 항목은 평가에서 빠져요.</p></section>` : ''}
  <section class="card">
    <h2>얼마나 힘들었나요? (RPE)</h2>
    <div class="rpe-grid" role="group" aria-label="자각적 운동강도 1에서 10">
      ${Array.from({ length: 10 }, (_, i) => i + 1).map((v) => `<button class="rpe-btn r${v}" data-act="rpe" data-v="${v}" aria-pressed="${d.rpe === v}" aria-label="RPE ${v} ${L.RPE_LABELS[v]}">${v}</button>`).join('')}
    </div>
    <p class="small" style="margin-top:8px;min-height:1.5em">${d.rpe ? `<b>${d.rpe} · ${L.RPE_LABELS[d.rpe]}</b> — ${g.hint}` : '운동 전체를 돌아보며 하나를 골라 주세요.'}</p>
    <details class="collapse"><summary class="small">RPE 척도 보기</summary>
      <p class="small muted">0~10 자각강도 척도(세션 RPE, Foster 수정 CR-10)를 사용해요.</p>
      ${L.RPE_GROUPS.map((x) => `<p class="small"><b>${x.range[0]}–${x.range[1]}</b> ${x.label} · ${x.hint}</p>`).join('')}
    </details>
    <h2 style="margin-top:14px">컨디션</h2>
    <div class="seg-ctl" style="grid-auto-flow:row;grid-template-columns:1fr 1fr;border-radius:20px">
      ${Object.entries(L.CONDITIONS).map(([k, v]) => `<button data-act="cond" data-v="${k}" aria-pressed="${d.condition === k}">${v}</button>`).join('')}
    </div>
    <label class="check-line" style="margin-top:8px"><input type="checkbox" data-field="pain" ${d.pain ? 'checked' : ''}>통증이나 이상 증상이 있었어요</label>
  </section>
  <section class="card">
    <h2>기본 기록</h2>
    <div class="field"><span class="label">실제 운동 시간</span>
      <div class="grid2"><input type="number" inputmode="numeric" min="0" max="300" aria-label="분" value="${am}" data-field="actualMin"><input type="number" inputmode="numeric" min="0" max="59" aria-label="초" value="${as}" data-field="actualSecPart"></div>
      <span class="hint">분 · 초</span></div>
    <div class="field"><span class="label">운동 완료 여부</span>
      <div class="seg-ctl"><button data-act="completed" data-v="1" aria-pressed="${d.completed}">끝까지 완료</button><button data-act="completed" data-v="0" aria-pressed="${!d.completed}">중간에 멈춤</button></div></div>
    ${plan.intervalsPlanned ? stepper(`수행한 인터벌 (계획 ${plan.intervalsPlanned}회)`, d.intervalsDone, 'ivl', 'n', 1, `${d.intervalsDone ?? 0}회`) : ''}
    <div class="field"><label for="memo">메모</label><textarea id="memo" data-field="memo" placeholder="오늘 느낌, 자세, 특이사항">${esc(d.memo)}</textarea></div>
  </section>
  <details class="collapse card" data-ui="watch" ${S.ui.watch || L.isNum(d.avgHR) ? 'open' : ''}>
    <summary>Apple Watch 정보 (선택)</summary>
    <p class="note" style="margin-top:0">운동 앱 기록에서 확인한 값을 옮겨 적어 주세요.</p>
    <div class="grid2">
      <div class="field"><label for="ahr">평균 심박수(bpm)</label><input id="ahr" type="number" inputmode="numeric" value="${d.avgHR ?? ''}" placeholder="${ph('avgHR')}" data-field="avgHR">${err.avgHR ? `<span class="hint" style="color:var(--rose)">${err.avgHR}</span>` : ''}</div>
      <div class="field"><label for="mhr">최대 심박수(bpm)</label><input id="mhr" type="number" inputmode="numeric" value="${d.maxHR ?? ''}" placeholder="${ph('maxHR')}" data-field="maxHR">${err.maxHR ? `<span class="hint" style="color:var(--rose)">${err.maxHR}</span>` : ''}</div>
    </div>
  </details>
  <details class="collapse card" data-ui="erg" ${S.ui.erg || L.isNum(d.distance) ? 'open' : ''}>
    <summary>로잉머신 정보 (선택)</summary>
    <div class="field"><label for="dist">이동 거리(m)</label><input id="dist" type="number" inputmode="numeric" value="${d.distance ?? ''}" placeholder="${ph('distance')}" data-field="distance">
      <div class="seg-ctl"><button data-act="dsrc" data-v="machine" aria-pressed="${d.distanceSource === 'machine'}">머신 측정값</button><button data-act="dsrc" data-v="manual" aria-pressed="${d.distanceSource === 'manual'}">직접 추정값</button></div></div>
    <div class="grid2">
      <div class="field"><label for="apace">평균 페이스 /500m</label><input id="apace" inputmode="decimal" value="${d.avgPaceSec != null ? L.fmtPace(d.avgPaceSec) : ''}" placeholder="${prev?.avgPaceSec ? `지난번 ${L.fmtPace(prev.avgPaceSec)}` : '예: 2:05 또는 205'}" data-field="avgPace">${err.avgPace ? `<span class="hint" style="color:var(--rose)">${err.avgPace}</span>` : ''}</div>
      <div class="field"><label for="aspm">평균 SPM</label><input id="aspm" type="number" inputmode="numeric" value="${d.avgSpm ?? ''}" placeholder="${ph('avgSpm')}" data-field="avgSpm"></div>
    </div>
    <div class="field"><label for="mnote">기기 표시 정보</label><input id="mnote" value="${esc(d.machineNote)}" placeholder="예: 평균 165W, 저항 5" data-field="machineNote"></div>
  </details>
  <button class="btn primary big block" data-act="save" ${S.saving ? 'disabled' : ''}>${d.mode === 'edit' ? '수정 저장' : '저장하고 결과 보기'}</button>
  <button class="btn ghost block" style="margin-top:8px" data-act="discard">${d.mode === 'edit' ? '수정 취소' : '기록하지 않고 닫기'}</button>`;
}
function validateDraft(d) {
  const e = {};
  if (d.avgHR != null && (d.avgHR < 30 || d.avgHR > 230)) e.avgHR = '30–230 사이로 입력하세요';
  if (d.maxHR != null && (d.maxHR < 40 || d.maxHR > 240)) e.maxHR = '40–240 사이로 입력하세요';
  if (d.avgHR != null && d.maxHR != null && d.maxHR < d.avgHR) e.maxHR = '최대 심박수가 평균보다 낮아요';
  if (d._paceBad) e.avgPace = '2:05 형식으로 입력하세요';
  return e;
}
async function saveDraft() {
  if (S.saving) return;
  const d = S.draft, plan = draftPlan();
  const errs = validateDraft(d);
  if (Object.keys(errs).length) { S.ui.postErr = errs; S.ui.watch = true; S.ui.erg = true; render(); toast('입력값을 확인해 주세요'); return; }
  S.ui.postErr = null; S.saving = true; render();
  const fields = {
    actualSec: d.actualSec, completed: d.completed, intervalsDone: plan.intervalsPlanned ? d.intervalsDone : null, memo: d.memo,
    avgHR: d.avgHR, maxHR: d.maxHR, distance: d.distance, distanceSource: L.isNum(d.distance) ? d.distanceSource : null,
    avgPaceSec: d.avgPaceSec, avgSpm: d.avgSpm, machineNote: d.machineNote, rpe: d.rpe, condition: d.condition, pain: !!d.pain,
    updatedAt: new Date().toISOString(),
  };
  let w;
  if (d.mode === 'edit') {
    w = { ...S.workouts.find((x) => x.id === d.id), ...fields };
  } else if (d.mode === 'manual') {
    const created = new Date(`${d.date}T12:00:00`);
    w = L.migrateWorkout({ id: d.id, createdAt: created.toISOString(), date: d.date, goal: plan.goal, plan, segLog: null, hrSnapshot: hrSnap(), manual: true, ...fields });
  } else {
    const a = S.active;
    const startedAt = a.startedAt || new Date().toISOString();
    w = L.migrateWorkout({ id: a.id, createdAt: startedAt, date: L.localDateStr(new Date(startedAt)), goal: a.program.goal, plan: a.program, segLog: a.timer.log, hrSnapshot: a.hrSnapshot, ...fields });
  }
  try {
    await db.putWorkout(w);
  } catch (e) {
    S.saving = false; render(); toast('저장하지 못했어요. 저장 공간을 확인한 뒤 다시 시도하세요.'); return;
  }
  S.workouts = L.upsertWorkout(S.workouts, w);
  if (d.mode === 'new') { S.active = null; await db.del('active'); }
  if (L.isNum(d.distance)) { S.lastDistSource = d.distanceSource; db.set('lastDistSource', d.distanceSource); }
  S.draft = null; await db.del('draft');
  S.saving = false;
  if (navigator.storage?.persist && !S.persisted) navigator.storage.persist().then((x) => { S.persisted = x; }).catch(() => {});
  S.viewId = w.id; S.viewFrom = d.mode === 'new' ? 'home' : 'history';
  toast(d.mode === 'edit' ? '수정했어요' : '저장했어요');
  go('result');
}

/* ───────── 결과 ───────── */
function ring(score) {
  const r = 40, c = 2 * Math.PI * r, v = score == null ? 0 : score / 100;
  return `<svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--line)" stroke-width="10"/>
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--mint-deep)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c * v} ${c}" transform="rotate(-90 50 50)"/></svg>`;
}
const statusLabel = { ok: '목표 범위', high: '목표보다 높음', low: '목표보다 낮음', fast: '계획보다 빠름', slow: '계획보다 느림' };
function resultView() {
  const w = S.workouts.find((x) => x.id === S.viewId);
  if (!w) return '<p>기록을 찾을 수 없어요.</p>';
  const perf = L.evaluatePerformance(w), inten = L.evaluateIntensity(w), prevInfo = L.findPrevious(w, S.workouts);
  const fb = L.generateFeedback(w, perf, inten, prevInfo);
  const fresh = S.viewFrom === 'home';
  const rows = [
    ['목표 운동 시간', L.fmtDuration(w.plan.plannedSec)],
    ['실제 운동 시간', L.isNum(w.actualSec) ? L.fmtDuration(w.actualSec) : null],
    ['평균 심박수', L.isNum(w.avgHR) ? `${w.avgHR}bpm` : null],
    ['최대 심박수', L.isNum(w.maxHR) ? `${w.maxHR}bpm` : null],
    ['자각강도', L.isNum(w.rpe) ? `${w.rpe}/10` : null],
    ['수행한 인터벌', w.plan.intervalsPlanned ? (L.isNum(w.intervalsDone) ? `${w.intervalsDone}/${w.plan.intervalsPlanned}` : null) : undefined],
    ['거리', L.isNum(w.distance) ? `${w.distance.toLocaleString()}m ${w.distanceSource === 'machine' ? '(측정)' : '(추정)'}` : null],
    ['평균 페이스', L.isNum(w.avgPaceSec) ? `${L.fmtPace(w.avgPaceSec)} /500m` : null],
    ['평균 SPM', L.isNum(w.avgSpm) ? `${w.avgSpm}` : null],
    ['컨디션', w.condition ? L.CONDITIONS[w.condition] : null],
  ].filter((r) => r[1] !== undefined);
  const shown = rows.filter((r) => r[1] != null), missing = rows.filter((r) => r[1] == null).map((r) => r[0]);
  const hr = inten.hr;
  return `
  <div class="hero">${character('done', fresh ? 'md' : 'sm')}
    <h1>${fresh ? '오늘도 로잉 완료! 🚣' : esc(fmtDate(L.parseLocalDate(w.date), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }))}</h1>
    <p class="muted">${esc(L.GOALS[w.goal].name)}${w.manual ? ' · 직접 입력한 기록' : ''}</p></div>
  <section class="card"><h2>운동 요약</h2>
    <div class="kv">${shown.map(([k, v]) => `<span>${k}</span><span class="v">${esc(v)}</span>`).join('')}</div>
    ${missing.length ? `<p class="note">입력하지 않은 항목: ${missing.join(', ')}</p>` : ''}
    ${w.memo ? `<p class="small" style="margin-top:8px">📝 ${esc(w.memo)}</p>` : ''}
    ${w.machineNote ? `<p class="small">기기: ${esc(w.machineNote)}</p>` : ''}
    ${w.pain ? '<p class="small" style="color:var(--rose)">통증·이상 증상 기록 있음</p>' : ''}
  </section>
  <section class="card"><h2>훈련 수행도</h2>
    <div class="score">${ring(perf.score)}<div><div class="big-num">${perf.score == null ? '–' : `${perf.score}점`}</div>
      <p class="small muted">${perf.score == null ? '계산에 쓸 데이터가 없어요' : '계획한 운동을 얼마나 수행했는지'}</p></div></div>
    <div style="margin-top:10px">${perf.components.filter((c) => !c.notApplicable).map((c) => `
      <div class="comp"><span>${c.label} <span class="muted small">(가중치 ${c.weight})</span></span><span class="num"><b>${c.value == null ? '제외' : `${Math.round(c.value * 100)}%`}</b></span>
      <span class="why">${esc(c.value == null ? c.reason : c.detail || '')}</span></div>`).join('')}</div>
    <p class="note">이 점수는 앱 자체의 계획 수행 지표이며, 의학적으로 검증된 체력 점수가 아니에요.</p>
    <details class="collapse"><summary class="small">계산 방법</summary><p class="small muted">${esc(perf.formula)}</p><p class="small muted">${esc(L.PACE_RULE)}</p></details>
  </section>
  <section class="card"><h2>운동 강도 평가</h2>
    <h3>심박수 (측정값)</h3>
    ${hr.unavailable ? `<p class="small muted">평가 불가 — ${esc(hr.unavailable)}</p>` : `
      <p><span class="status ${hr.status}">${statusLabel[hr.status]}</span></p>
      <div class="kv small"><span>실제 평균 강도</span><span class="v">HRR ${hr.actualPct}% · ${hr.zoneId ? L.getZone(hr.zoneId).short : '회복 미만'}</span>
      <span>계획 평균 강도</span><span class="v">HRR ${hr.plannedPct}% (±${L.HR_TOLERANCE * 100}%p)</span>
      ${inten.maxHr ? `<span>최대 심박</span><span class="v">HRR ${inten.maxHr.pct}%</span>` : ''}</div>
      ${hr.note ? `<p class="note">${esc(hr.note)}</p>` : ''}
      ${hr.estimatedMax ? '<p class="note">최대 심박이 나이 추정값이라 오차가 있을 수 있어요.</p>' : ''}`}
    <h3 style="margin-top:12px">자각강도 RPE (주관)</h3>
    ${!inten.rpe || inten.rpe.unavailable ? `<p class="small muted">평가 불가 — ${esc(inten.rpe?.unavailable || '계획 정보 없음')}</p>` : `
      <p><span class="status ${inten.rpe.status}">${statusLabel[inten.rpe.status]}</span> <span class="small">기록 ${inten.rpe.value} · 계획 ${inten.rpe.lo}–${inten.rpe.hi} (±1 허용)</span></p>`}
    ${inten.gap ? `<p class="small">${inten.gap.flagged ? '⚠️ 심박 강도와 느낀 강도의 차이가 커요(3 이상). 피로·수면·더위·측정 오차 등이 원인일 수 있어요.' : '심박 강도와 느낀 강도가 비슷해요.'}</p>` : ''}
    ${inten.pace ? `<h3 style="margin-top:12px">페이스 (측정값)</h3><p><span class="status ${inten.pace.status === 'ok' ? 'ok' : inten.pace.status === 'fast' ? 'high' : 'low'}">${statusLabel[inten.pace.status]}</span> <span class="small">실제 ${L.fmtPace(w.avgPaceSec)} · 계획 평균 ${L.fmtPace(inten.pace.target)}</span></p>` : ''}
    <details class="collapse"><summary class="small">평가 기준</summary><p class="small muted">평균 심박을 HRR 비율((평균 심박 − 안정시) ÷ (최대 − 안정시))로 바꿔, 실제 수행한 구간의 계획 강도(시간 가중 평균)와 비교해요. ±7.5%p 안이면 목표 범위예요. 운동 당시의 안정시·최대 심박 설정값을 기준으로 해요. 강도가 높다고 더 좋은 평가를 주지 않아요.</p></details>
  </section>
  ${prevInfo ? compareCard(w, prevInfo) : ''}
  ${fb.length ? `<section class="card"><h2>다음 훈련을 위한 피드백</h2><ul class="feedback">${fb.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
  <div class="stack">
    ${fresh ? '<button class="btn primary big block" data-act="go" data-v="home">홈으로</button>' : '<button class="btn block" data-act="go" data-v="history">기록 목록으로</button>'}
    <div class="grid2"><button class="btn" data-act="edit" data-v="${w.id}">기록 수정</button><button class="btn danger" data-act="delete" data-v="${w.id}">삭제</button></div>
  </div>`;
}
function compareCard(w, info) {
  const p = info.prev;
  const sc = (x) => L.evaluatePerformance(x).score;
  const f = (x, k) => ({
    time: L.isNum(x.actualSec) ? L.fmtClock(x.actualSec) : '–',
    hr: L.isNum(x.avgHR) ? `${x.avgHR}` : '–',
    pace: L.isNum(x.avgPaceSec) ? L.fmtPace(x.avgPaceSec) : '–',
    rpe: L.isNum(x.rpe) ? `${x.rpe}/10` : '–',
    score: sc(x) == null ? '–' : `${sc(x)}점`,
  }[k]);
  const rows = [['운동 시간', 'time'], ['평균 심박', 'hr'], ['평균 페이스', 'pace'], ['RPE', 'rpe'], ['수행도', 'score']];
  return `<section class="card"><h2>지난 기록과 비교</h2>
    <p class="small muted">${info.match === 'same' ? '같은 프로그램' : '같은 목적·시간'} · 지난번 ${esc(p.date)}</p>
    <div class="compare"><span></span><span class="h">지난번</span><span class="h">이번</span>
      ${rows.map(([l, k]) => `<span class="small">${l}</span><span class="v">${f(p, k)}</span><span class="v">${f(w, k)}</span>`).join('')}</div>
    <p class="note">한 번의 비교로 체력 변화를 판단하지 않아요. 같은 훈련이 4회 이상 쌓이면 분석 탭에서 추세를 보여 드려요.</p></section>`;
}

/* ───────── 기록 ───────── */
function historyView() {
  const m = S.histMonth || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const ym = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
  const monthWs = S.workouts.filter((w) => (w.date || '').startsWith(ym));
  const byDay = {};
  monthWs.forEach((w) => { (byDay[w.date] = byDay[w.date] || []).push(w); });
  const first = (m.getDay() + 6) % 7, days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const today = L.localDateStr();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push('<span></span>');
  for (let d = 1; d <= days; d++) {
    const ds = `${ym}-${String(d).padStart(2, '0')}`, n = byDay[ds]?.length || 0;
    cells.push(`<button data-act="day" data-v="${ds}" class="${n ? 'has' : ''} ${ds === today ? 'today' : ''} ${S.histDay === ds ? 'sel' : ''}" aria-label="${d}일${n ? ` 운동 ${n}회` : ''}">${d}${n ? `<span class="dots">${'<i></i>'.repeat(Math.min(n, 3))}</span>` : ''}</button>`);
  }
  const list = (S.histDay ? byDay[S.histDay] || [] : monthWs).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return `<h1>기록</h1>
  <section class="card">
    <div class="spread" style="margin-bottom:8px"><button class="btn sm" data-act="month" data-v="-1" aria-label="이전 달">‹</button>
      <h2 style="margin:0">${m.getFullYear()}년 ${m.getMonth() + 1}월</h2><button class="btn sm" data-act="month" data-v="1" aria-label="다음 달">›</button></div>
    <div class="cal">${['월', '화', '수', '목', '금', '토', '일'].map((x) => `<span class="dow">${x}</span>`).join('')}${cells.join('')}</div>
    <p class="small muted" style="margin-top:8px">이번 달 ${monthWs.length}회${S.histDay ? ` · ${S.histDay} 선택됨 <button class="btn ghost sm" data-act="day" data-v="">전체 보기</button>` : ''}</p>
  </section>
  ${list.length ? `<ul class="wlist">${list.map(witem).join('')}</ul>` : `<div class="card soft center"><p>${S.histDay ? '이 날은 기록이 없어요.' : '이 달에는 아직 기록이 없어요.'}</p><button class="btn primary" data-act="go" data-v="home">운동하러 가기</button></div>`}
  <button class="btn block" style="margin-top:14px" data-act="manual">타이머 없이 기록 직접 추가</button>`;
}
function witem(w) {
  const sc = L.evaluatePerformance(w).score;
  const g = L.GOALS[w.goal];
  return `<li><button class="witem g-${w.goal}" data-act="view" data-v="${w.id}">
    <span class="letter" style="background:var(--${{ endurance: 'z3', base: 'z2', interval: 'z4', performance: 'z5', recovery: 'z1' }[w.goal]})">${g.letter}</span>
    <span><b>${esc(g.name)}</b><br><span class="small muted">${esc(w.date)} · ${L.isNum(w.actualSec) ? L.fmtDuration(w.actualSec) : '시간 미입력'}${L.isNum(w.rpe) ? ` · RPE ${w.rpe}` : ''}</span></span>
    <span class="sc">${sc == null ? '–' : sc}</span></button></li>`;
}

/* ───────── 분석 ───────── */
function lineChart(points, { invert = false, fmt = (v) => Math.round(v) } = {}) {
  const pts = points.slice(-20);
  if (pts.length < 2) return `<p class="small muted">기록이 2개 이상 있어야 그래프를 그릴 수 있어요. (현재 ${pts.length}개)</p>`;
  const W = 320, H = 130, pl = 36, pr = 10, pt = 10, pb = 22;
  const vs = pts.map((p) => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (lo === hi) { lo -= 1; hi += 1; }
  const x = (i) => pl + (i * (W - pl - pr)) / (pts.length - 1);
  const y = (v) => { const f = (v - lo) / (hi - lo); return pt + (invert ? f : 1 - f) * (H - pt - pb); };
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 ${pts.length}개 기록 추이">
    <line class="axis" x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}"/>
    <text x="2" y="${y(hi) + 4}">${fmt(hi)}</text><text x="2" y="${y(lo) + 4}">${fmt(lo)}</text>
    <text x="${pl}" y="${H - 6}">${pts[0].date.slice(5)}</text><text x="${W - pr}" y="${H - 6}" text-anchor="end">${pts.at(-1).date.slice(5)}</text>
    <path class="lineP" d="${d}"/>${pts.map((p, i) => `<circle class="dot" cx="${x(i)}" cy="${y(p.v)}" r="3"/>`).join('')}</svg>`;
}
function statsView() {
  if (!S.workouts.length) return `<h1>분석</h1><div class="card center">${character('home', 'sm')}<p>첫 운동을 기록하면 여기에서 변화를 볼 수 있어요.</p><button class="btn primary" data-act="go" data-v="home">운동하러 가기</button></div>`;
  const s = L.computeStats(S.workouts, S.profile || {});
  const rec = L.recommend(S.workouts, S.profile || {});
  const total = s.count;
  const shareColors = { endurance: 'z3', base: 'z2', interval: 'z4', performance: 'z5', recovery: 'z1' };
  const maxW = Math.max(s.consistency.target, ...s.consistency.weeks.map((w) => w.count), 1);
  const chartCard = (title, pts, opt, miss) => `<section class="card"><div class="spread"><h2>${title}</h2>${miss ? `<span class="small muted">누락 ${miss}회</span>` : ''}</div>${lineChart(pts, opt)}</section>`;
  return `<h1>분석</h1>
  <section class="card tint"><h2>개인화 피드백</h2>
    ${!rec.dataEnough ? `<p>개인화 분석을 위한 기록이 더 필요해요. (${total}/${L.MIN_RECORDS}회)</p>` : ''}
    <p><b>다음 추천: ${esc(L.GOALS[rec.goal].name)} ${rec.minutes}분${rec.extraReps ? ' · 반복 +1회' : ''}</b></p>
    ${rec.reasons.map((r) => `<p class="small">${esc(r)}</p>`).join('')}
    ${rec.insights.length ? rec.insights.map((r) => `<p class="small">📈 ${esc(r.text)}</p>`).join('') : '<p class="small muted">같은 훈련이 4회 이상 쌓이면 페이스·심박 추세를 알려 드려요.</p>'}
    <button class="btn sm" data-act="apply-rec">이 추천으로 홈에서 준비</button>
  </section>
  <div class="stats-grid">
    <div class="stat"><div class="k">이번 주</div><div class="v">${s.weekCount}<span class="small">/${s.consistency.target}회</span></div><div class="s">주간 목표</div></div>
    <div class="stat"><div class="k">이번 달</div><div class="v">${s.monthCount}회</div><div class="s">전체 ${total}회</div></div>
    <div class="stat"><div class="k">누적 로잉 시간</div><div class="v" style="font-size:20px">${L.fmtDuration(s.totalSec)}</div><div class="s">평균 ${s.avgSec ? L.fmtDuration(s.avgSec) : '–'}</div></div>
    <div class="stat"><div class="k">누적 거리</div><div class="v" style="font-size:20px">${(s.distMeasured / 1000).toFixed(1)}km</div><div class="s">머신 측정 ${s.distMeasuredN}회${s.distManualN ? ` · 추정 ${(s.distManual / 1000).toFixed(1)}km 별도` : ''}</div></div>
  </div>
  <section class="card"><div class="spread"><h2>운동 지속성</h2><span class="small muted">최근 8주</span></div>
    <div class="bars">${s.consistency.weeks.map((w) => `<div class="b ${w.count >= s.consistency.target ? 'met' : ''}"><i style="height:${(w.count / maxW) * 100}%"></i><span>${w.count}</span></div>`).join('')}</div>
    <p class="small" style="margin-top:8px">주간 목표(${s.consistency.target}회) 달성 ${s.consistency.weeksMet}/7주 · 연속 달성 ${s.consistency.streak}주</p>
  </section>
  <section class="card"><h2>훈련 목적별 비중</h2>
    <div class="share">${Object.entries(s.goalShare).map(([g, n]) => `<span style="flex:${n};background:var(--${shareColors[g]})"></span>`).join('')}</div>
    <div class="kv small">${Object.entries(s.goalShare).map(([g, n]) => `<span><i class="swatch" style="background:var(--${shareColors[g]})"></i>${L.GOALS[g].name}</span><span class="v">${n}회 · ${Math.round((n / total) * 100)}%</span>`).join('')}</div>
  </section>
  ${chartCard('수행도 점수', s.series.score, {}, total - s.series.score.length)}
  ${chartCard('평균 심박수', s.series.hr, {}, s.missing.hr)}
  ${chartCard('평균 페이스 (위로 갈수록 빠름)', s.series.pace, { invert: true, fmt: L.fmtPace }, s.missing.pace)}
  ${chartCard('RPE', s.series.rpe, {}, s.missing.rpe)}
  ${chartCard('안정시 심박수', s.series.restHR, {}, 0)}
  <p class="note">서로 다른 목적의 운동이 섞인 추이예요. 같은 훈련끼리의 비교는 각 기록의 결과 화면과 위 개인화 피드백에서 확인하세요.</p>`;
}

/* ───────── 설정 ───────── */
function pfVal(k) { const v = S.pf[k]; return v == null ? '' : v; }
function settingsView() {
  if (!S.pf) S.pf = profileToForm(S.profile || {});
  const pf = S.pf;
  const prof = formToProfile(pf, S.profile || {}).profile;
  const ctx = L.hrContext(prof), anchor = L.paceAnchor(prof, S.workouts);
  const age = L.ageFrom(prof);
  return `<h1>설정</h1>
  <section class="card"><h2>개인 프로필</h2>
    <div class="field"><span class="label">운동 숙련도</span><div class="seg-ctl">${Object.entries(L.LEVELS).map(([k, v]) => `<button data-act="pf-level" data-v="${k}" aria-pressed="${pf.level === k}">${v}</button>`).join('')}</div></div>
    <div class="grid2">
      <div class="field"><label for="by">출생연도</label><input id="by" type="number" inputmode="numeric" placeholder="예: 1990" value="${pfVal('birthYear')}" data-pf="birthYear"></div>
      <div class="field"><label for="pt">선호 운동 시간대</label><select id="pt" data-pf="preferredTime">${['', '아침', '점심', '저녁', '밤', '상관없음'].map((x) => `<option value="${x}" ${pf.preferredTime === x ? 'selected' : ''}>${x || '선택 안 함'}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label for="pg">주된 운동 목표</label><select id="pg" data-pf="goal"><option value="">선택 안 함</option>${Object.values(L.GOALS).map((g) => `<option value="${g.id}" ${pf.goal === g.id ? 'selected' : ''}>${g.name}</option>`).join('')}</select></div>
    ${stepper('주간 운동 목표', pf.weeklyTarget, 'pf-week', 'weeklyTarget', 1, `주 ${pf.weeklyTarget}회`)}
  </section>
  <section class="card"><h2>심박수 (선택)</h2>
    <div class="grid2">
      <div class="field"><label for="rhr">안정시 심박수</label><input id="rhr" type="number" inputmode="numeric" placeholder="예: 60" value="${pfVal('restHR')}" data-pf="restHR"><span class="hint">아침에 일어나 누운 채 측정</span></div>
      <div class="field"><label for="xhr">최대 심박수</label><input id="xhr" type="number" inputmode="numeric" placeholder="${age ? `추정 ${L.estimateMaxHR(age)}` : '예: 185'}" value="${pfVal('maxHR')}" data-pf="maxHR"><span class="hint">실측값이 없으면 비워 두세요</span></div>
    </div>
    ${!pf.maxHR && age ? `<p class="note">나이로 추정한 최대 심박수는 ${L.estimateMaxHR(age)}bpm(208 − 0.7 × ${age})이에요. 실제 최대 심박수와 10bpm 이상 차이 날 수 있어요. 고강도 운동 중 Apple Watch에 기록된 최고값이 더 높다면 그 값을 입력하세요.</p>` : ''}
    ${ctx ? zoneTable(ctx) : '<p class="note">안정시 심박수와 최대 심박수(또는 출생연도)를 넣으면 카르보넨 공식으로 목표 심박 구간을 계산해요. 넣지 않아도 RPE 기준으로 모든 기능을 쓸 수 있어요.</p>'}
  </section>
  <section class="card"><h2>로잉 기준 기록 (선택)</h2>
    <p class="note" style="margin-top:0">모르는 항목은 비워 두세요. 형식: 분:초 (예: 7:45, 2:05)</p>
    <div class="grid2">
      <div class="field"><label for="tk">2,000m 기록</label><input id="tk" inputmode="decimal" placeholder="7:45" value="${pfVal('twoK')}" data-pf="twoK"></div>
      <div class="field"><label for="p5">500m 최고 기록</label><input id="p5" inputmode="decimal" placeholder="1:45" value="${pfVal('pb500')}" data-pf="pb500"></div>
      <div class="field"><label for="rs">최근 지속 운동 평균 /500m</label><input id="rs" inputmode="decimal" placeholder="2:20" value="${pfVal('recentSteady')}" data-pf="recentSteady"></div>
      <div class="field"><label for="cp">편안한 페이스 /500m</label><input id="cp" inputmode="decimal" placeholder="2:25" value="${pfVal('comfort')}" data-pf="comfort"></div>
      <div class="field"><label for="ps">선호 SPM</label><input id="ps" type="number" inputmode="numeric" placeholder="22" value="${pfVal('preferredSpm')}" data-pf="preferredSpm"></div>
    </div>
    ${anchor ? `<p class="note">페이스 계산 기준: ${esc(anchor.label)} → 2,000m 환산 페이스 약 ${L.fmtPace(anchor.base)}/500m. 기록이 여러 개면 2,000m → 최근 기록 → 지속 페이스 → 편안한 페이스 → 500m 순으로 하나만 사용해요.</p>` : ''}
    ${S.ui.pfErr ? `<p class="small" style="color:var(--rose)">${esc(S.ui.pfErr)}</p>` : ''}
    <button class="btn primary block" data-act="pf-save">프로필 저장</button>
  </section>
  <section class="card"><h2>데이터 백업 · 복원</h2>
    <p class="small">기록은 이 기기의 Safari 저장소에만 있어요. 기기를 바꾸거나 Safari 데이터를 지우면 사라지니 JSON 파일로 백업해 iCloud Drive 등에 보관하세요.</p>
    <p class="small muted">마지막 백업: ${S.lastBackup ? esc(new Date(S.lastBackup).toLocaleString('ko-KR')) : '없음'} · 기록 ${S.workouts.length}개</p>
    <div class="grid2"><button class="btn" data-act="export">백업 파일 저장</button><label class="btn" for="imp">백업에서 복원</label></div>
    <input id="imp" type="file" accept="application/json,.json" class="hidden" data-field="import">
    <p class="note">복원은 기존 기록에 더하는 방식이에요. 이미 있는 기록은 건너뛰어 중복되지 않아요.</p>
  </section>
  <section class="card"><h2>화면</h2>
    <div class="seg-ctl">${[['auto', '자동'], ['light', '라이트'], ['dark', '다크']].map(([k, v]) => `<button data-act="theme" data-v="${k}" aria-pressed="${S.theme === k}">${v}</button>`).join('')}</div>
  </section>
  <section class="card soft"><h2>앱 정보</h2>
    <p class="small">로잉버디 v${APP_VERSION} · 모든 데이터는 기기에만 저장되며 외부로 전송되지 않아요.</p>
    <p class="small muted">저장 공간 보호: ${S.persisted === true ? '영구 저장 허용됨' : S.persisted === false ? '브라우저가 상황에 따라 정리할 수 있음 — 홈 화면에 추가해 쓰고 백업을 권장해요' : '확인 중'}</p>
    <p class="small muted">심박수·RPE·평가는 운동 강도를 가늠하는 참고 정보이며 의학적 진단이 아니에요. 통증, 어지러움, 가슴 불편감이 있으면 운동을 멈추세요.</p>
    <button class="btn danger sm" data-act="wipe">모든 데이터 삭제</button>
  </section>`;
}
function zoneTable(ctx) {
  return `<table class="zone-table"><thead><tr><th>구간</th><th>HRR</th><th>목표 심박</th><th>RPE</th></tr></thead><tbody>
    ${L.ZONES.map((z) => { const r = L.zoneHR(ctx, z.id); return `<tr><td><i class="swatch" style="background:var(--z${z.id})"></i>${z.name}</td><td class="num">${Math.round(z.hrr[0] * 100)}–${Math.round(z.hrr[1] * 100)}%</td><td class="num">${r[0]}–${r[1]}</td><td class="num">${z.rpe[0]}–${z.rpe[1]}</td></tr>`; }).join('')}
  </tbody></table>
  <p class="note">목표 심박 = 안정시 ${ctx.rest} + (최대 ${ctx.max} − 안정시 ${ctx.rest}) × 강도 비율. 심박수 예비량(HRR) = ${ctx.reserve}bpm. 참고로 ACSM은 HRR 40–59%를 중강도, 60–89%를 고강도로 분류해요.</p>`;
}
function profileToForm(p) {
  return {
    level: p.level || 'beginner', birthYear: p.birthYear ?? '', preferredTime: p.preferredTime || '', goal: p.goal || '', weeklyTarget: p.weeklyTarget || 3,
    restHR: p.restHR ?? '', maxHR: p.maxHR ?? '',
    twoK: L.isNum(p.twoKSec) ? L.fmtClock(p.twoKSec) : '', pb500: L.isNum(p.pb500Sec) ? L.fmtClock(p.pb500Sec) : '',
    recentSteady: L.isNum(p.recentSteadyPaceSec) ? L.fmtClock(p.recentSteadyPaceSec) : '', comfort: L.isNum(p.comfortPaceSec) ? L.fmtClock(p.comfortPaceSec) : '',
    preferredSpm: p.preferredSpm ?? '',
  };
}
function formToProfile(pf, base) {
  const errs = [];
  const clock = (v, label, lo, hi) => {
    if (v === '' || v == null) return null;
    const s = parsePaceInput(v);
    if (s == null || s < lo || s > hi) { errs.push(`${label} 형식을 확인하세요`); return null; }
    return s;
  };
  const rng = (v, label, lo, hi) => {
    const n = num(v);
    if (n == null) return null;
    if (n < lo || n > hi) { errs.push(`${label}는 ${lo}–${hi} 사이여야 해요`); return null; }
    return Math.round(n);
  };
  const profile = {
    ...base, level: pf.level, preferredTime: pf.preferredTime, goal: pf.goal || null, weeklyTarget: pf.weeklyTarget,
    birthYear: rng(pf.birthYear, '출생연도', 1920, new Date().getFullYear() - 8),
    restHR: rng(pf.restHR, '안정시 심박수', 30, 120), maxHR: rng(pf.maxHR, '최대 심박수', 120, 230),
    twoKSec: clock(pf.twoK, '2,000m 기록', 300, 900), pb500Sec: clock(pf.pb500, '500m 기록', 60, 240),
    recentSteadyPaceSec: clock(pf.recentSteady, '지속 페이스', 80, 300), comfortPaceSec: clock(pf.comfort, '편안한 페이스', 80, 300),
    preferredSpm: rng(pf.preferredSpm, '선호 SPM', 14, 40),
  };
  if (profile.restHR != null && profile.maxHR != null && profile.maxHR - profile.restHR < 30) errs.push('최대 심박수와 안정시 심박수 차이가 너무 작아요');
  return { profile, errs };
}
async function saveProfile() {
  const { profile, errs } = formToProfile(S.pf, S.profile || {});
  if (errs.length) { S.ui.pfErr = errs.join(' · '); render(); return; }
  S.ui.pfErr = null;
  const prevRest = S.profile?.restHR;
  const hist = [...(profile.restHRHistory || [])];
  if (profile.restHR != null && profile.restHR !== prevRest) {
    const today = L.localDateStr();
    const i = hist.findIndex((h) => h.date === today);
    if (i >= 0) hist[i] = { date: today, value: profile.restHR }; else hist.push({ date: today, value: profile.restHR });
  }
  S.profile = L.migrateProfile({ ...profile, restHRHistory: hist, updatedAt: new Date().toISOString() });
  await db.set('profile', S.profile);
  S.pf = profileToForm(S.profile);
  toast('프로필을 저장했어요');
  render();
}

/* ───────── 백업 ───────── */
async function exportBackup() {
  const json = JSON.stringify(L.buildBackup(S.profile, S.workouts), null, 2);
  const name = `rowing-buddy-backup-${L.localDateStr()}.json`;
  const mark = () => { S.lastBackup = new Date().toISOString(); db.set('lastBackup', S.lastBackup); render(); };
  try {
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: '로잉버디 백업' });
      mark(); toast('백업 파일을 공유했어요. "파일에 저장"으로 보관하세요.'); return;
    }
  } catch (e) { if (e?.name === 'AbortError') return; }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  mark(); toast('백업 파일을 저장했어요');
}
async function importBackup(file) {
  let obj;
  try { obj = JSON.parse(await file.text()); } catch { toast('JSON 파일을 읽을 수 없어요'); return; }
  const v = L.validateBackup(obj);
  if (!v.ok) { toast(v.error); return; }
  const { merged, added, skipped, invalid } = L.mergeWorkouts(S.workouts, obj.workouts);
  const newOnes = merged.slice(S.workouts.length);
  if (newOnes.length) await db.putWorkouts(newOnes);
  S.workouts = merged;
  if (obj.profile && (!S.profile || confirm('백업 파일의 프로필로 현재 프로필을 바꿀까요?\n(취소하면 현재 프로필을 유지해요)'))) {
    S.profile = L.migrateProfile(obj.profile); await db.set('profile', S.profile); S.pf = null;
  }
  toast(`복원 완료: 새 기록 ${added}개${skipped ? `, 중복 ${skipped}개 건너뜀` : ''}${invalid ? `, 손상 ${invalid}개 제외` : ''}`);
  render();
}

/* ───────── 온보딩 ───────── */
function onboardingView() {
  const o = S.ui.onb || (S.ui.onb = { level: 'beginner', weeklyTarget: 3, birthYear: '', restHR: '' });
  return `<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="onb-h">
    <div class="hero">${character('home', 'sm')}<h1 id="onb-h">반가워요! 로잉버디예요</h1>
    <p class="muted small">딱 두 가지만 알려 주세요. 나머지는 나중에 설정에서 채워도 돼요.</p></div>
    <div class="field"><span class="label">운동 숙련도</span><div class="seg-ctl">${Object.entries(L.LEVELS).map(([k, v]) => `<button data-act="onb-level" data-v="${k}" aria-pressed="${o.level === k}">${v}</button>`).join('')}</div></div>
    ${stepper('주간 운동 목표', o.weeklyTarget, 'onb-week', 'w', 1, `주 ${o.weeklyTarget}회`)}
    <details class="collapse"><summary>심박 정보도 입력하기 (선택)</summary>
      <div class="grid2"><div class="field"><label for="obY">출생연도</label><input id="obY" type="number" inputmode="numeric" value="${esc(o.birthYear)}" data-onb="birthYear" placeholder="1990"></div>
      <div class="field"><label for="obR">안정시 심박수</label><input id="obR" type="number" inputmode="numeric" value="${esc(o.restHR)}" data-onb="restHR" placeholder="60"></div></div>
    </details>
    <button class="btn primary big block" data-act="onb-done">시작하기</button>
  </div></div>`;
}
async function finishOnboarding() {
  const o = S.ui.onb;
  const by = num(o.birthYear), rest = num(o.restHR);
  S.profile = L.migrateProfile({
    level: o.level, weeklyTarget: o.weeklyTarget,
    birthYear: by && by > 1920 && by < new Date().getFullYear() - 8 ? Math.round(by) : null,
    restHR: rest && rest >= 30 && rest <= 120 ? Math.round(rest) : null,
    restHRHistory: rest && rest >= 30 && rest <= 120 ? [{ date: L.localDateStr(), value: Math.round(rest) }] : [],
    createdAt: new Date().toISOString(),
  });
  await db.set('profile', S.profile);
  S.ui.onb = null; S.pf = null;
  render();
}

/* ───────── 라우팅·렌더 ───────── */
function go(screen) {
  if (screen !== 'train') stopLoop();
  S.screen = screen;
  if (screen === 'settings') S.pf = null;
  render();
  window.scrollTo(0, 0);
}
function render() {
  const views = { home: homeView, train: trainView, post: postView, result: resultView, history: historyView, stats: statsView, settings: settingsView };
  const noNav = ['train', 'post'].includes(S.screen);
  let html = (views[S.screen] || homeView)();
  if (!noNav) html += nav();
  if (!S.profile && S.ready) html += onboardingView();
  $app.innerHTML = html;
  $app.classList.toggle('no-nav', noNav);
  if (S.screen === 'train' && S.active?.timer.running && !loop) startLoop();
}

/* ───────── 이벤트 ───────── */
const actions = {
  go: (v) => go(v),
  goal: (v) => { S.choice = { ...S.choice, goal: v, custom: null, extraReps: 0 }; saveChoice(); render(); },
  min: (v) => { S.ui.customMin = false; S.choice = { ...S.choice, minutes: Number(v), extraReps: 0 }; saveChoice(); render(); },
  'min-custom': () => { S.ui.customMin = true; render(); document.getElementById('cmin')?.focus(); },
  'apply-rec': () => {
    const r = L.recommend(S.workouts, S.profile || {});
    S.choice = { goal: r.goal, minutes: r.minutes, custom: null, extraReps: r.extraReps || 0 };
    S.ui.customMin = !L.DURATIONS.includes(r.minutes);
    saveChoice(); toast('추천 프로그램으로 설정했어요'); go('home');
  },
  cust: (v, el) => {
    const p = currentProgram();
    const c = { ...(S.choice.custom || { ...p.repeat, paceSec: p.customPaceSec }) };
    const k = el.dataset.k, d = Number(el.dataset.d);
    if (k === 'paceSec') {
      const work = p.segments.find((s) => s.kind === 'work');
      const startPace = c.paceSec || (work?.target.pace ? Math.round((work.target.pace[0] + work.target.pace[1]) / 2) : 150);
      c.paceSec = L.clamp(startPace + (c.paceSec ? d : 0), 70, 300);
    } else {
      const lim = { workSec: [15, 1200], restSec: [0, 600], reps: [1, 20] }[k];
      c[k] = L.clamp(c[k] + d, lim[0], lim[1]);
    }
    S.ui.cust = true; S.choice = { ...S.choice, custom: c, extraReps: 0 }; saveChoice(); render();
  },
  'cust-zone': (v) => { const p = currentProgram(); S.choice = { ...S.choice, custom: { ...(S.choice.custom || { ...p.repeat, paceSec: p.customPaceSec }), zoneId: Number(v) } }; saveChoice(); render(); },
  'cust-reset': () => { S.choice = { ...S.choice, custom: null }; saveChoice(); render(); },
  'cust-pace-auto': () => { S.choice = { ...S.choice, custom: { ...S.choice.custom, paceSec: null } }; saveChoice(); render(); },
  start: () => {
    if (S.active) return;
    const program = currentProgram();
    S.active = { id: uuid(), startedAt: null, program, hrSnapshot: hrSnap(), timer: T.createTimer(program.segments) };
    saveActive(); unlockAudio(); go('train');
  },
  'resume-active': () => { unlockAudio(); if (S.active.timer.finished) goPost(); else { go('train'); if (S.active.timer.running) requestWake(); } },
  'end-active': () => {
    if (!S.active.startedAt) { S.active = null; saveActive(); render(); return; }
    if (!confirm('진행 중인 운동을 종료하고 기록 화면으로 갈까요?')) return;
    S.active.timer = T.finishEarly(S.active.timer, S.active.program.segments, Date.now());
    saveActive(); goPost();
  },
  't-start': () => {
    unlockAudio(); beep(880, 0.1);
    const now = Date.now();
    S.active.startedAt = new Date(now).toISOString();
    S.active.timer = T.start(S.active.timer, now);
    saveActive(); requestWake(); render(); startLoop();
  },
  't-cancel': () => { S.active = null; saveActive(); go('home'); },
  't-pause': () => {
    const now = Date.now(), t = S.active.timer;
    if (t.running) { S.active.timer = T.pause(t, now); releaseWake(); stopLoop(); }
    else { unlockAudio(); S.active.timer = T.start(t, now); requestWake(); startLoop(); }
    saveActive(); render();
  },
  't-skip': () => {
    S.active.timer = T.skip(S.active.timer, S.active.program.segments, Date.now());
    saveActive();
    if (S.active.timer.finished) { releaseWake(); stopLoop(); goPost(); } else render();
  },
  't-check': (v) => { S.active.timer = T.toggleCheck(S.active.timer, Number(v)); saveActive(); render(); },
  't-end': () => {
    if (!confirm('운동을 종료할까요? 지금까지 수행한 기록은 그대로 저장돼요.')) return;
    S.active.timer = T.finishEarly(S.active.timer, S.active.program.segments, Date.now());
    saveActive(); releaseWake(); stopLoop(); goPost();
  },
  sound: () => { S.sound = !S.sound; db.set('sound', S.sound); unlockAudio(); render(); },
  rpe: (v) => { S.draft.rpe = Number(v); saveDraftLocal(); render(); },
  cond: (v) => { S.draft.condition = S.draft.condition === v ? null : v; saveDraftLocal(); render(); },
  completed: (v) => { S.draft.completed = v === '1'; saveDraftLocal(); render(); },
  ivl: (v, el) => { const plan = draftPlan(); S.draft.intervalsDone = L.clamp((S.draft.intervalsDone || 0) + Number(el.dataset.d), 0, plan.intervalsPlanned); saveDraftLocal(); render(); },
  dsrc: (v) => { S.draft.distanceSource = v; saveDraftLocal(); render(); },
  save: () => saveDraft(),
  discard: async () => {
    const d = S.draft;
    if (d?.mode === 'new' && !confirm('이번 운동을 기록하지 않고 닫을까요? 운동 내용이 사라져요.')) return;
    if (d?.mode === 'new') { S.active = null; await db.del('active'); }
    S.draft = null; await db.del('draft'); S.ui.postErr = null;
    go(d?.mode === 'edit' ? 'result' : d?.mode === 'manual' ? 'history' : 'home');
  },
  view: (v) => { S.viewId = v; S.viewFrom = 'history'; go('result'); },
  edit: (v) => {
    const w = S.workouts.find((x) => x.id === v);
    S.draft = { mode: 'edit', id: w.id, actualSec: w.actualSec, completed: w.completed, intervalsDone: w.intervalsDone, memo: w.memo || '', avgHR: w.avgHR, maxHR: w.maxHR, distance: w.distance, distanceSource: w.distanceSource || S.lastDistSource, avgPaceSec: w.avgPaceSec, avgSpm: w.avgSpm, machineNote: w.machineNote || '', rpe: w.rpe, condition: w.condition, pain: !!w.pain };
    db.set('draft', S.draft); go('post');
  },
  delete: async (v) => {
    if (!confirm('이 기록을 삭제할까요? 되돌릴 수 없어요.')) return;
    await db.deleteWorkout(v);
    S.workouts = S.workouts.filter((w) => w.id !== v);
    toast('삭제했어요'); go('history');
  },
  manual: () => {
    const plan = currentProgram();
    S.draft = { mode: 'manual', id: uuid(), date: L.localDateStr(), plan, actualSec: plan.plannedSec, completed: true, intervalsDone: plan.intervalsPlanned || null, memo: '', avgHR: null, maxHR: null, distance: null, distanceSource: S.lastDistSource, avgPaceSec: null, avgSpm: null, machineNote: '', rpe: null, condition: null, pain: false };
    db.set('draft', S.draft); go('post');
  },
  day: (v) => { S.histDay = v || null; render(); },
  month: (v) => { const m = S.histMonth || new Date(new Date().getFullYear(), new Date().getMonth(), 1); S.histMonth = new Date(m.getFullYear(), m.getMonth() + Number(v), 1); S.histDay = null; render(); },
  'pf-level': (v) => { S.pf.level = v; render(); },
  'pf-week': (v, el) => { S.pf.weeklyTarget = L.clamp(S.pf.weeklyTarget + Number(el.dataset.d), 1, 7); render(); },
  'pf-save': () => saveProfile(),
  export: () => exportBackup(),
  theme: (v) => { S.theme = v; applyTheme(); db.set('theme', v); render(); },
  wipe: async () => {
    if (!confirm('모든 기록과 프로필을 삭제할까요? 백업하지 않았다면 되돌릴 수 없어요.')) return;
    if (!confirm('정말 삭제할까요?')) return;
    await db.clearAll();
    Object.assign(S, { profile: null, workouts: [], active: null, draft: null, pf: null, lastBackup: null });
    S.choice = { goal: 'base', minutes: 20, custom: null, extraReps: 0 };
    toast('모든 데이터를 삭제했어요'); go('home');
  },
  'onb-level': (v) => { S.ui.onb.level = v; render(); },
  'onb-week': (v, el) => { S.ui.onb.weeklyTarget = L.clamp(S.ui.onb.weeklyTarget + Number(el.dataset.d), 1, 7); render(); },
  'onb-done': () => finishOnboarding(),
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el.dataset.v, el); }
});
document.addEventListener('toggle', (e) => { const k = e.target?.dataset?.ui; if (k) S.ui[k] = e.target.open; }, true);
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.pf && S.pf) { S.pf[el.dataset.pf] = el.value; return; }
  if (el.dataset.onb && S.ui.onb) { S.ui.onb[el.dataset.onb] = el.value; return; }
  const f = el.dataset.field;
  if (!f) return;
  if (f === 'customMinutes') return; // change에서 처리
  if (f === 'import') return;
  const d = S.draft;
  if (!d) return;
  if (f === 'actualMin' || f === 'actualSecPart') {
    const m = num(document.querySelector('[data-field="actualMin"]').value) || 0, s = num(document.querySelector('[data-field="actualSecPart"]').value) || 0;
    d.actualSec = Math.max(0, Math.round(m * 60 + Math.min(59, s)));
  } else if (f === 'avgPace') { d.avgPaceSec = parsePaceInput(el.value); d._paceBad = !!el.value.trim() && d.avgPaceSec == null; }
  else if (['avgHR', 'maxHR', 'distance', 'avgSpm'].includes(f)) { const n = num(el.value); d[f] = n == null ? null : Math.round(n); }
  else if (f === 'pain') d.pain = el.checked;
  else if (f === 'memo' || f === 'machineNote' || f === 'date') d[f] = el.value;
  saveDraftLocal();
});
document.addEventListener('change', (e) => {
  const el = e.target, f = el.dataset.field;
  if (el.dataset.pf && S.pf) { S.pf[el.dataset.pf] = el.value; return; }
  if (f === 'customMinutes') {
    const n = Math.round(num(el.value) || 0);
    if (n >= 5 && n <= 120) { S.choice = { ...S.choice, minutes: n, extraReps: 0 }; saveChoice(); render(); } else toast('5–120분 사이로 입력하세요');
  } else if (f === 'import' && el.files?.[0]) { importBackup(el.files[0]); el.value = ''; }
  else if (f === 'pain' && S.draft) { S.draft.pain = el.checked; saveDraftLocal(); }
  else if ((f === 'goal' || f === 'minutes') && S.draft?.mode === 'manual') {
    const goal = f === 'goal' ? el.value : S.draft.plan.goal;
    const minutes = f === 'minutes' ? L.clamp(Math.round(num(el.value) || 20), 5, 120) : S.draft.plan.minutes;
    S.draft.plan = currentProgram({ goal, minutes, custom: null, extraReps: 0 });
    S.draft.actualSec = S.draft.plan.plannedSec;
    S.draft.intervalsDone = S.draft.plan.intervalsPlanned || null;
    saveDraftLocal(); render();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.screen === 'train' && S.active) {
    if (S.active.timer.running) { requestWake(); if (!loop) startLoop(); }
    trainTick();
  }
});

function applyTheme() {
  if (S.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = S.theme;
}

/* ───────── 시작 ───────── */
async function init() {
  const [profile, workouts, choice, active, draft, sound, lastBackup, lastDist, theme] = await Promise.all([
    db.get('profile'), db.allWorkouts(), db.get('choice'), db.get('active'), db.get('draft'), db.get('sound'), db.get('lastBackup'), db.get('lastDistSource'), db.get('theme'),
  ]);
  S.profile = L.migrateProfile(profile);
  S.workouts = (workouts || []).map(L.migrateWorkout);
  S.choice = choice && L.GOALS[choice.goal] ? choice : { goal: S.profile?.goal || 'base', minutes: 20, custom: null, extraReps: 0 };
  S.active = active || null;
  S.draft = draft || null;
  S.sound = sound !== false;
  S.lastBackup = lastBackup;
  S.lastDistSource = lastDist || 'machine';
  S.theme = theme || 'auto';
  applyTheme();
  // 기록 화면 도중 새로고침/앱 종료 → 입력하던 내용 복원
  if (S.draft && (S.draft.mode !== 'new' || S.active)) S.screen = 'post';
  else if (S.draft) { S.draft = null; db.del('draft'); }
  if (S.screen !== 'post' && S.active?.timer.finished) goPost();
  if (navigator.storage?.persisted) navigator.storage.persisted().then((x) => { S.persisted = x; }).catch(() => {});
  S.ready = true;
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
}
init();
