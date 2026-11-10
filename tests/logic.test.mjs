import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';

const NOW = new Date('2026-11-10T09:00:00');
const levels = ['beginner', 'intermediate', 'advanced'];

/* ── 운동 시간 합계 ── */
test('모든 목적·시간·숙련도에서 구간 합계 = 선택 시간', () => {
  for (const goal of L.GOAL_IDS) for (const level of levels) for (const m of [5, 7, 10, 12, 15, 20, 25, 30, 45, 60, 90, 120]) {
    const p = L.generateProgram({ goal, minutes: m, level });
    assert.equal(L.sumSec(p.segments), m * 60, `${goal}/${level}/${m}`);
    assert.equal(p.plannedSec, m * 60);
    assert.ok(p.segments.every((s) => s.durationSec > 0), `0초 구간 없음 ${goal}/${level}/${m}`);
    assert.ok(p.segments[0].phase === 'warmup' && p.segments.at(-1).phase === 'cooldown');
  }
});
test('요청서 예시: 30분 인터벌(중급) = 웜업 5 + (3분+2분)×4 + 쿨다운 5', () => {
  const p = L.generateProgram({ goal: 'interval', minutes: 30, level: 'intermediate' });
  assert.deepEqual(p.repeat, { workSec: 180, restSec: 120, reps: 4, zoneId: 4 });
  const warm = L.sumSec(p.segments.filter((s) => s.phase === 'warmup'));
  const cool = L.sumSec(p.segments.filter((s) => s.phase === 'cooldown'));
  assert.equal(warm, 300); assert.equal(cool, 300);
  assert.equal(p.intervalsPlanned, 4);
});
test('짧은 인터벌(10분)도 반복 2회 이상', () => {
  for (const level of levels) {
    const p = L.generateProgram({ goal: 'interval', minutes: 10, level });
    assert.ok(p.repeat.reps >= 2, level);
  }
});
test('사용자 지정 인터벌 변경 시 전체 시간 재계산', () => {
  const p = L.generateProgram({ goal: 'interval', minutes: 30, level: 'intermediate', custom: { workSec: 60, restSec: 90, reps: 6, zoneId: 5 } });
  assert.equal(p.plannedSec, 300 + 6 * 150 + 240); // 웜업5 + 15분 + 쿨다운4
  assert.equal(L.sumSec(p.segments), p.plannedSec);
  assert.equal(p.intervalsPlanned, 6);
  const noRest = L.generateProgram({ goal: 'interval', minutes: 20, custom: { workSec: 60, restSec: 0, reps: 3 } });
  assert.equal(noRest.segments.filter((s) => s.kind === 'rest').length, 0);
});
test('잘못된 사용자 지정 값은 무시하고 기본 구성', () => {
  const p = L.generateProgram({ goal: 'interval', minutes: 30, custom: { workSec: 0, restSec: 60, reps: 3 } });
  assert.equal(p.isCustom, false);
  assert.equal(p.plannedSec, 1800);
});
test('extraReps(추천)로 반복 1회 증가', () => {
  const a = L.generateProgram({ goal: 'interval', minutes: 30, level: 'intermediate' });
  const b = L.generateProgram({ goal: 'interval', minutes: 30, level: 'intermediate', extraReps: 1 });
  assert.equal(b.repeat.reps, a.repeat.reps + 1);
  assert.equal(L.sumSec(b.segments), b.plannedSec);
});

/* ── 심박수 계산 ── */
test('카르보넨 공식', () => {
  assert.equal(L.karvonenTarget(60, 190, 0.6), 138); // 60 + 130×0.6
  const ctx = L.hrContext({ restHR: 60, maxHR: 190 });
  assert.deepEqual(L.zoneHR(ctx, 3), [138, 151]);
  assert.equal(ctx.reserve, 130);
  assert.equal(ctx.estimated, false);
});
test('HRR%와 %HRmax를 혼동하지 않음', () => {
  const ctx = L.hrContext({ restHR: 60, maxHR: 190 });
  // %HRmax 60%면 114bpm이지만 HRR 60%는 138bpm
  assert.notEqual(L.zoneHR(ctx, 3)[0], Math.round(190 * 0.6));
  assert.ok(Math.abs(L.hrToHrr(138, ctx) - 0.6) < 0.01);
});
test('최대 심박 추정(Tanaka) 및 표시', () => {
  assert.equal(L.estimateMaxHR(40), 180);
  const ctx = L.hrContext({ restHR: 55, birthYear: 1986 }, NOW);
  assert.equal(ctx.max, 180); assert.equal(ctx.estimated, true);
});
test('심박 정보가 없거나 비정상이면 null', () => {
  assert.equal(L.hrContext({}), null);
  assert.equal(L.hrContext({ restHR: 60 }), null); // 최대·나이 없음
  assert.equal(L.hrContext({ restHR: 60, maxHR: 80 }), null);
  assert.equal(L.hrContext({ restHR: 10, maxHR: 190 }), null);
});
test('HRR → 구간', () => {
  assert.equal(L.zoneForHrr(0.2), 0);
  assert.equal(L.zoneForHrr(0.55), 2);
  assert.equal(L.zoneForHrr(0.72), 4);
  assert.equal(L.zoneForHrr(1.05), 5);
});

/* ── 페이스 계산 ── */
test('페이스 파싱·포맷', () => {
  assert.equal(L.parseClock('2:05'), 125);
  assert.equal(L.parseClock('7:30.5'), 450.5);
  assert.equal(L.parseClock('1:02:03'), 3723);
  assert.equal(L.parseClock('2:75'), null);
  assert.equal(L.parseClock('125'), null);
  assert.equal(L.parseClock(''), null);
  assert.equal(L.fmtPace(125), '2:05');
  assert.equal(L.fmtClock(3723), '1:02:03');
});
test('2,000m 기록 → 구간별 페이스', () => {
  const a = L.paceAnchor({ twoKSec: 480 }); // 2:00/500m
  assert.equal(a.base, 120); assert.equal(a.estimated, false);
  assert.deepEqual(L.zonePace(a, 2), [138, 145]);
  assert.deepEqual(L.zonePace(a, 5), [117, 123]);
});
test('기준 기록 우선순위 · 기록 없으면 페이스 미제시', () => {
  assert.equal(L.paceAnchor({ twoKSec: 480, comfortPaceSec: 150 }).source, '2k');
  assert.equal(L.paceAnchor({ comfortPaceSec: 150, pb500Sec: 100 }).source, 'comfort');
  assert.equal(L.paceAnchor({}), null);
  const p = L.attachTargets(L.generateProgram({ goal: 'base', minutes: 20 }), {});
  assert.ok(p.segments.every((s) => s.target.pace === null && s.target.hr === null));
  assert.ok(p.segments.every((s) => s.target.rpe && s.target.spm));
});
test('과거 저강도 기록 3회 이상이면 기준 페이스로 사용', () => {
  const ws = [150, 152, 148].map((v, i) => ({ goal: 'base', avgPaceSec: v, rpe: 4, createdAt: `2026-11-0${i + 1}T10:00:00` }));
  const a = L.paceAnchor({ comfortPaceSec: 170 }, ws);
  assert.equal(a.source, 'history'); assert.equal(a.base, 130);
});
test('짧은 인터벌 구간은 목표 심박을 강요하지 않음', () => {
  const p = L.attachTargets(L.generateProgram({ goal: 'interval', minutes: 20, level: 'beginner' }), { restHR: 60, maxHR: 190 });
  const work = p.segments.filter((s) => s.kind === 'work');
  assert.ok(work.every((s) => s.durationSec >= 180 || s.target.hr === null));
  assert.ok(work.every((s) => s.target.hrNote));
});
test('계획 평균 페이스는 거리 기준(시간 가중 속도) 평균', () => {
  const plan = { segments: [
    { durationSec: 600, zoneId: 1, target: { pace: [150, 150] } },
    { durationSec: 600, zoneId: 1, target: { pace: [100, 100] } },
  ] };
  // 거리: 2000 + 3000 = 5000m / 1200s → 120s/500m (단순 산술평균 125 아님)
  assert.equal(L.plannedAvgPace(plan), 120);
});

/* ── 수행도·강도 평가, 데이터 누락 ── */
function makeWorkout(over = {}) {
  const plan = L.attachTargets(L.generateProgram({ goal: 'interval', minutes: 30, level: 'intermediate' }), { restHR: 60, maxHR: 190, twoKSec: 480 });
  return L.migrateWorkout({
    id: 'w1', createdAt: '2026-11-09T10:00:00.000Z', date: '2026-11-09', goal: 'interval', plan,
    segLog: plan.segments.map((s) => ({ segId: s.id, actualSec: s.durationSec, checked: true, status: 'done' })),
    hrSnapshot: { rest: 60, max: 190, estimated: false },
    actualSec: 1800, intervalsDone: 4, ...over,
  });
}
test('완료율 100%', () => {
  const r = L.evaluatePerformance(makeWorkout());
  assert.equal(r.score, 100);
});
test('누락된 항목은 0점이 아니라 계산에서 제외', () => {
  const r = L.evaluatePerformance(makeWorkout({ avgPaceSec: null }));
  const pace = r.components.find((c) => c.key === 'pace');
  assert.equal(pace.value, null); assert.ok(pace.reason);
  assert.equal(r.score, 100);
});
test('부분 수행: 시간 50%, 체크 절반, 인터벌 2/4', () => {
  const w = makeWorkout({ actualSec: 900, intervalsDone: 2 });
  w.segLog = w.segLog.map((l, i) => ({ ...l, checked: i < w.segLog.length / 2 }));
  const r = L.evaluatePerformance(w);
  const half = w.segLog.filter((l) => l.checked).length / w.segLog.length;
  const expected = Math.round(((0.5 * 40) + (half * 30) + (0.5 * 20)) / 90 * 100);
  assert.equal(r.score, expected);
});
test('타이머 없이 직접 입력한 기록: 체크리스트 항목 제외', () => {
  const r = L.evaluatePerformance(makeWorkout({ segLog: null }));
  assert.equal(r.components.find((c) => c.key === 'checklist').value, null);
});
test('모든 데이터가 없으면 점수 없음(임의 점수 금지)', () => {
  const r = L.evaluatePerformance(makeWorkout({ actualSec: null, segLog: null, intervalsDone: null }));
  assert.equal(r.score, null);
});
test('지속 운동에는 인터벌 항목이 해당 없음', () => {
  const plan = L.attachTargets(L.generateProgram({ goal: 'base', minutes: 20 }), {});
  const r = L.evaluatePerformance(L.migrateWorkout({ id: 'x', createdAt: 'a', plan, actualSec: 1200 }));
  assert.equal(r.components.find((c) => c.key === 'intervals').notApplicable, true);
  assert.equal(r.score, 100);
});
test('강도가 높다고 수행도 점수가 올라가지 않음', () => {
  const a = L.evaluatePerformance(makeWorkout({ avgHR: 150, rpe: 6 })).score;
  const b = L.evaluatePerformance(makeWorkout({ avgHR: 185, rpe: 10 })).score;
  assert.equal(a, b);
});
test('강도 평가: HRR 비교·심박 없음 처리', () => {
  const hi = L.evaluateIntensity(makeWorkout({ avgHR: 185 }));
  assert.equal(hi.hr.status, 'high');
  assert.ok(hi.hr.note, '인터벌은 평균 심박 한계 안내');
  const none = L.evaluateIntensity(makeWorkout({ avgHR: null }));
  assert.ok(none.hr.unavailable);
  const noCtx = L.evaluateIntensity(makeWorkout({ avgHR: 150, hrSnapshot: null }));
  assert.ok(noCtx.hr.unavailable);
});
test('중도 종료 시 수행한 구간만으로 계획 강도 계산', () => {
  const w = makeWorkout();
  w.segLog = w.segLog.map((l, i) => (i < 2 ? l : { ...l, actualSec: 0, checked: false }));
  const full = L.plannedAvgHrr(w.plan);
  const partial = L.plannedAvgHrr(w.plan, w.segLog);
  assert.ok(partial < full, '웜업만 했으면 계획 강도도 낮음');
});
test('RPE·심박 차이 감지', () => {
  const r = L.evaluateIntensity(makeWorkout({ avgHR: 100, rpe: 9 }));
  assert.equal(r.gap.flagged, true);
});

/* ── 중복 저장·복원 ── */
test('같은 id 저장은 덮어쓰기(중복 없음)', () => {
  let list = [];
  const w = makeWorkout();
  list = L.upsertWorkout(list, w);
  list = L.upsertWorkout(list, { ...w, memo: '수정' });
  assert.equal(list.length, 1); assert.equal(list[0].memo, '수정');
});
test('백업 복원 시 중복 방지', () => {
  const a = makeWorkout();
  const b = makeWorkout({ id: 'w2', createdAt: '2026-11-08T10:00:00.000Z' });
  const sameMoment = { ...a, id: 'other-id' };
  const r = L.mergeWorkouts([a], [a, b, sameMoment, { foo: 1 }]);
  assert.equal(r.added, 1); assert.equal(r.skipped, 2); assert.equal(r.invalid, 1);
  assert.equal(r.merged.length, 2);
});
test('백업 검증 및 구버전 기록 마이그레이션', () => {
  assert.equal(L.validateBackup({ app: 'x', workouts: [] }).ok, false);
  assert.equal(L.validateBackup(L.buildBackup(null, [])).ok, true);
  assert.equal(L.validateBackup({ app: 'rowing-buddy', schemaVersion: 99, workouts: [] }).ok, false);
  const old = L.migrateWorkout({ id: 'o', createdAt: '2026-01-02T03:00:00', goal: 'base' });
  assert.equal(old.schemaVersion, L.SCHEMA_VERSION);
  assert.equal(old.avgHR, null); assert.equal(old.date, '2026-01-02');
});

/* ── 통계 ── */
test('통계: 누락 데이터 표시, 거리 측정/수동 구분, 주간 횟수', () => {
  const ws = [
    makeWorkout({ id: 'a', createdAt: '2026-11-09T10:00:00Z', date: '2026-11-09', avgHR: 150, distance: 6000, distanceSource: 'machine' }),
    makeWorkout({ id: 'b', createdAt: '2026-11-10T07:00:00Z', date: '2026-11-10', distance: 5000, distanceSource: 'manual' }),
    makeWorkout({ id: 'c', createdAt: '2026-10-20T07:00:00Z', date: '2026-10-20' }),
  ];
  const s = L.computeStats(ws, { weeklyTarget: 2 }, NOW);
  assert.equal(s.weekCount, 2); // 2026-11-09(월)~ 이번 주
  assert.equal(s.monthCount, 2);
  assert.equal(s.distMeasured, 6000); assert.equal(s.distManual, 5000);
  assert.equal(s.series.hr.length, 1); assert.equal(s.missing.hr, 2);
});

/* ── 개인화 추천 ── */
const rec = (over) => makeWorkout({ goal: 'base', ...over });
test('기록 부족 시 안내', () => {
  const r = L.recommend([rec({ id: '1' })], { level: 'beginner' }, NOW);
  assert.equal(r.dataEnough, false); assert.equal(r.rule, 'not-enough');
});
test('높은 피로 → 회복 운동', () => {
  const ws = [1, 2, 3].map((i) => rec({ id: String(i), createdAt: `2026-11-0${7 + i - 1}T10:00:00`, rpe: 8, condition: 'tired' }));
  const r = L.recommend(ws, { level: 'intermediate' }, NOW);
  assert.equal(r.goal, 'recovery'); assert.equal(r.rule, 'fatigue');
});
test('통증 기록 → 강도 증가 없이 회복', () => {
  const ws = [1, 2, 3].map((i) => rec({ id: String(i), createdAt: `2026-11-0${6 + i}T10:00:00`, rpe: 3, pain: i === 3 }));
  const r = L.recommend(ws, {}, NOW);
  assert.equal(r.rule, 'pain'); assert.equal(r.extraReps, 0);
});
test('안정적 완료 → 시간만 5분 증가(강도 동시 증가 없음)', () => {
  const ws = [3, 5, 7].map((d, i) => {
    const plan = L.attachTargets(L.generateProgram({ goal: 'base', minutes: 30 }), {});
    return L.migrateWorkout({ id: 'p' + i, goal: 'base', plan, actualSec: 1800, createdAt: `2026-11-0${d}T10:00:00`, date: `2026-11-0${d}`, rpe: 3, condition: 'good',
      segLog: plan.segments.map((s) => ({ actualSec: s.durationSec, checked: true })) });
  });
  const r = L.recommend(ws, { level: 'beginner', goal: 'base' }, NOW);
  assert.equal(r.goal, 'base'); assert.equal(r.minutes, 35); assert.equal(r.extraReps, 0);
});
test('한 번의 기록으로 추세를 단정하지 않음(최소 4회)', () => {
  const ws = [1, 2, 3].map((i) => rec({ id: String(i), createdAt: `2026-11-0${i}T10:00:00`, avgPaceSec: 140 - i * 5, avgHR: 150 }));
  assert.equal(L.trendInsights(ws).length, 0);
  const ws4 = [1, 2, 3, 4].map((i) => rec({ id: String(i), createdAt: `2026-11-0${i}T10:00:00`, avgPaceSec: 140 - i * 3, rpe: 5 }));
  assert.ok(L.trendInsights(ws4).some((x) => x.type === 'pace'));
});
