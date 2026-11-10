// 모바일 사용 시나리오 테스트 — 실제 app.js를 가상 DOM(jsdom)에서 실행해 화면 흐름을 검증합니다.
// 실행: npm install && npm run test:scenario
import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'https://example.github.io/rowing-buddy/', pretendToBeVisual: true });
const { window } = dom;
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'localStorage', 'File', 'Blob']) {
  try { globalThis[k] = window[k]; } catch { Object.defineProperty(globalThis, k, { value: window[k], configurable: true }); }
}
globalThis.location = window.location;
globalThis.confirm = window.confirm = () => true;
window.scrollTo = () => {};
globalThis.matchMedia = () => ({ matches: false });

let fakeNow = Date.parse('2026-11-10T07:00:00');
const realNow = Date.now;
Date.now = () => fakeNow;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => window.document.querySelector(s);
const $$ = (s) => [...window.document.querySelectorAll(s)];
const click = (sel) => { const el = typeof sel === 'string' ? $(sel) : sel; assert.ok(el, `요소 없음: ${sel}`); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); };
const type = (sel, v) => { const el = $(sel); assert.ok(el, `입력 없음: ${sel}`); el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); el.dispatchEvent(new window.Event('change', { bubbles: true })); };
const text = () => $('#app').textContent;
const step = (name) => console.log('✓', name);

await import('../js/app.js');
await sleep(150);

// 1. 첫 실행: 최소 설정 온보딩
assert.ok(text().includes('반가워요'), '온보딩 표시');
click('[data-act="onb-level"][data-v="intermediate"]');
click('[data-act="onb-done"]');
await sleep(50);
assert.ok(text().includes('오늘은 어떤 로잉 훈련을 할까요?'));
assert.ok(text().includes('개인화 분석을 위한 기록이 더 필요해요'));
step('온보딩 → 홈, 기록 부족 안내');

// 2. 심박 정보 없음 → RPE 안내, 기준 기록 없음 → 페이스 미제시
assert.ok(text().includes('RPE(자각강도)로 안내'));
assert.ok(text().includes('페이스는 제시하지 않아요'));
step('심박·페이스 데이터 없이도 프로그램 생성');

// 3. 인터벌 30분 선택 → 예시 구성
click('[data-act="goal"][data-v="interval"]');
click('[data-act="min"][data-v="30"]');
assert.ok(text().includes('빠른 로잉 4/4'), '중급 30분 = 4회 반복');
assert.ok(text().includes('30분'));
// 반복 +1 → 전체 시간 재계산
$('details[data-ui="cust"]').open = true;
click('[data-act="cust"][data-k="reps"][data-d="1"]');
assert.ok(text().includes('빠른 로잉 5/5'));
assert.ok(text().includes('다시 계산'));
click('[data-act="cust-reset"]');
assert.ok(text().includes('빠른 로잉 4/4'));
step('인터벌 생성·수정·재계산');

// 4. 운동 시작 → 준비 화면 → 시작
click('[data-act="start"]');
await sleep(20);
assert.ok($('[data-act="t-start"]'), '준비 버튼');
click('[data-act="t-start"]');
await sleep(20);
assert.equal($('#tm').textContent, '2:30', '첫 구간(가볍게 시작 2:30)');

// 5. 백그라운드 3분 후 복귀 → 실제 경과 시간으로 따라잡기
fakeNow += 180000;
window.document.dispatchEvent(new window.Event('visibilitychange'));
await sleep(400);
assert.ok(text().includes('점진적으로 올리기'));
assert.equal($('#tm').textContent, '2:00', '두 번째 구간 30초 경과');
step('실제 경과 시간 기반 타이머');

// 6. 일시정지 중 시간 정지
click('[data-act="t-pause"]');
fakeNow += 600000;
await sleep(300);
click('[data-act="t-pause"]'); // 재개
await sleep(300);
assert.equal($('#tm').textContent, '2:00');
step('일시정지/재개');

// 7. 새로고침 대비: 진행 상태가 저장됨 → 다음 구간, 체크
click('[data-act="t-skip"]');
await sleep(20);
assert.ok(text().includes('빠른 로잉 1/4'));
click('.bigcheck');
assert.equal($('.bigcheck').getAttribute('aria-pressed'), 'true');
step('다음 구간 · 완료 체크');

// 8. 중간 종료 → 기록 화면
fakeNow += 60000;
click('[data-act="t-end"]');
await sleep(50);
assert.ok(text().includes('오늘 운동은 어떠셨나요?'));
const min = Number($('[data-field="actualMin"]').value), sec = Number($('[data-field="actualSecPart"]').value);
assert.equal(min * 60 + sec, 150 + 30 + 60, '실제 수행 시간만 기록(웜업 2:30 + 0:30 + 1:00)');
step('중도 종료해도 수행 기록 보존');

// 9. 선택 입력 일부만 → 저장
click('[data-act="rpe"][data-v="6"]');
click('[data-act="cond"][data-v="good"]');
$('details[data-ui="watch"]').open = true;
type('#ahr', '250');
click('[data-act="save"]');
await sleep(50);
assert.ok(text().includes('30–230 사이'), '비정상 심박 차단');
type('#ahr', '142');
type('#apace', '205');
click('[data-act="save"]');
await sleep(100);
assert.ok(text().includes('오늘도 로잉 완료'));
assert.ok(text().includes('기준 기록이 없어 목표 페이스가 없었어요'), '목표 없는 페이스는 평가 제외');
assert.ok(text().includes('안정시 심박수(또는'), '심박 컨텍스트 없으면 강도 평가 불가 사유');
assert.ok(text().includes('의학적으로 검증된 체력 점수가 아니에요'));
step('부분 입력 저장 · 결과 리포트 · 누락 사유 표시');

// 10. 중복 저장 방지: 같은 기록을 두 번 저장해도 1개
const { db } = await import('../js/db.js');
assert.equal((await db.allWorkouts()).length, 1);
click('[data-act="edit"]');
await sleep(20);
type('#memo', '다리 먼저!');
click('[data-act="save"]');
await sleep(100);
assert.equal((await db.allWorkouts()).length, 1);
assert.ok(text().includes('다리 먼저!'));
step('수정 저장 시 중복 없음');

// 11. 기록·분석·설정 화면
click('[data-act="go"][data-v="history"]');
assert.ok(text().includes('이번 달 1회'));
click('[data-act="go"][data-v="stats"]');
assert.ok(text().includes('운동 지속성'));
assert.ok(text().includes('기록이 2개 이상 있어야'));
click('[data-act="go"][data-v="settings"]');
type('#rhr', '58'); type('#xhr', '188');
click('[data-act="pf-save"]');
await sleep(50);
assert.ok(text().includes('목표 심박 = 안정시 58'));
assert.ok(text().includes('123–136'), '저강도 구간: 58 + 130 × 0.50~0.60');
step('기록 · 분석 · 설정(카르보넨 구간 표)');

Date.now = realNow;
console.log('\n모든 시나리오 통과');
process.exit(0);
