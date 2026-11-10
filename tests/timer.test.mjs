import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../js/timer.js';

const segs = [{ id: 'a', durationSec: 60 }, { id: 'b', durationSec: 120 }, { id: 'c', durationSec: 60 }];
const S = 1000;

test('경과 시간은 실제 시각 기준(백그라운드 후 따라잡기)', () => {
  let t = T.start(T.createTimer(segs), 0);
  // 앱이 백그라운드에 있다가 130초 후 복귀(그 사이 tick 없음)
  const r = T.tick(t, segs, 130 * S);
  assert.equal(r.t.segIndex, 1);
  assert.equal(r.t.log[0].status, 'done');
  assert.equal(Math.round(T.segElapsedMs(r.t, 130 * S) / S), 70);
});
test('일시정지 중에는 시간이 흐르지 않음', () => {
  let t = T.start(T.createTimer(segs), 0);
  t = T.pause(t, 30 * S);
  assert.equal(T.activeMs(t, 500 * S), 30 * S);
  t = T.start(t, 500 * S);
  assert.equal(T.activeMs(t, 510 * S), 40 * S);
});
test('모든 구간 종료 시 정확히 계획 시간에서 멈춤', () => {
  let t = T.start(T.createTimer(segs), 0);
  const r = T.tick(t, segs, 999 * S);
  assert.equal(r.t.finished, true);
  assert.equal(T.totalActualSec(r.t), 240);
  assert.ok(r.events.some((e) => e.type === 'finished'));
});
test('다음 구간(건너뛰기)은 실제 수행 시간만 기록', () => {
  let t = T.start(T.createTimer(segs), 0);
  t = T.skip(t, segs, 20 * S);
  assert.equal(t.log[0].actualSec, 20);
  assert.equal(t.log[0].status, 'partial');
  assert.equal(t.log[0].checked, false);
  t = T.skip(t, segs, 20 * S); // 바로 건너뜀
  assert.equal(t.log[1].status, 'skipped');
  assert.equal(t.log[1].actualSec, 0);
});
test('중도 종료해도 수행 기록 보존', () => {
  let t = T.start(T.createTimer(segs), 0);
  t = T.finishEarly(t, segs, 100 * S);
  assert.equal(t.finished, true);
  assert.equal(t.log[0].actualSec, 60);
  assert.equal(t.log[1].actualSec, 40);
  assert.equal(t.log[2].actualSec, 0);
  assert.equal(T.totalActualSec(t), 100);
});
test('체크 토글', () => {
  let t = T.toggleCheck(T.createTimer(segs), 1);
  assert.equal(t.log[1].checked, true);
  t = T.toggleCheck(t, 1);
  assert.equal(t.log[1].checked, false);
});
test('상태는 JSON 저장 후 복원해도 동일하게 동작(새로고침 대비)', () => {
  let t = T.start(T.createTimer(segs), 0);
  const restored = JSON.parse(JSON.stringify(t));
  assert.equal(T.tick(restored, segs, 90 * S).t.segIndex, 1);
});
