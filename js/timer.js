// timer.js — 실제 시각(Date.now) 기준 타이머. setInterval 횟수를 세지 않으므로
// iPhone Safari가 백그라운드에서 스크립트를 멈춰도 돌아오면 정확한 경과 시간으로 따라잡습니다.
// 모든 함수는 새 상태를 돌려주는 순수 함수입니다(테스트 가능, 저장 가능).

export function createTimer(segments) {
  return {
    running: false,
    accumMs: 0,          // 마지막 재개 이전까지 누적된 활동 시간
    resumedAt: null,     // 마지막 재개 시각(벽시계 ms)
    segIndex: 0,
    segStartMs: 0,       // 현재 구간이 시작된 활동 시간 지점
    finished: false,
    log: segments.map((s) => ({ segId: s.id, actualSec: 0, checked: false, status: 'pending' })),
  };
}
export const activeMs = (t, now) => t.accumMs + (t.running && t.resumedAt != null ? now - t.resumedAt : 0);
export const segElapsedMs = (t, now) => Math.max(0, activeMs(t, now) - t.segStartMs);

export function start(t, now) {
  if (t.running || t.finished) return t;
  return { ...t, running: true, resumedAt: now };
}
export function pause(t, now) {
  if (!t.running) return t;
  return { ...t, running: false, accumMs: activeMs(t, now), resumedAt: null };
}
/** 구간 시간이 끝났으면 자동 완료·자동 체크 후 다음 구간으로. 여러 구간이 지났으면 모두 처리. */
export function tick(t, segments, now) {
  if (t.finished) return { t, events: [] };
  let x = { ...t, log: t.log.map((l) => ({ ...l })) };
  const events = [];
  const act = activeMs(x, now);
  while (x.segIndex < segments.length) {
    const dur = segments[x.segIndex].durationSec * 1000;
    if (act - x.segStartMs < dur) break;
    x.log[x.segIndex] = { ...x.log[x.segIndex], actualSec: segments[x.segIndex].durationSec, checked: true, status: 'done' };
    x.segStartMs += dur;
    x.segIndex++;
    events.push({ type: 'segment-complete', index: x.segIndex - 1 });
  }
  if (x.segIndex >= segments.length) {
    // 정확히 계획 시간에서 멈춤(초과 시간은 기록하지 않음)
    x = { ...x, running: false, resumedAt: null, accumMs: x.segStartMs, finished: true };
    events.push({ type: 'finished' });
  }
  return { t: x, events };
}
/** 현재 구간을 실제 수행한 시간만큼 기록하고 다음 구간으로 */
export function skip(t, segments, now) {
  const { t: cur } = tick(t, segments, now);
  if (cur.finished) return cur;
  const x = { ...cur, log: cur.log.map((l) => ({ ...l })) };
  const el = Math.floor(segElapsedMs(x, now) / 1000);
  const l = x.log[x.segIndex];
  x.log[x.segIndex] = { ...l, actualSec: el, status: el > 0 ? 'partial' : 'skipped' };
  x.segStartMs = activeMs(x, now);
  x.segIndex++;
  if (x.segIndex >= segments.length) return { ...x, running: false, accumMs: activeMs(x, now), resumedAt: null, finished: true };
  return x;
}
/** 운동을 중간에 종료: 진행 중이던 구간의 실제 시간만 기록 */
export function finishEarly(t, segments, now) {
  const { t: cur } = tick(t, segments, now);
  if (cur.finished) return cur;
  const x = { ...cur, log: cur.log.map((l) => ({ ...l })) };
  const el = Math.floor(segElapsedMs(x, now) / 1000);
  if (el > 0) x.log[x.segIndex] = { ...x.log[x.segIndex], actualSec: el, status: 'partial' };
  return { ...x, running: false, accumMs: activeMs(x, now), resumedAt: null, finished: true };
}
export function toggleCheck(t, i) {
  const log = t.log.map((l, j) => (j === i ? { ...l, checked: !l.checked } : l));
  return { ...t, log };
}
export function totalActualSec(t) {
  return t.log.reduce((a, l) => a + (l.actualSec || 0), 0);
}
