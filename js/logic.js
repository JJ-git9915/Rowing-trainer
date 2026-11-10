// logic.js — 순수 계산 로직. DOM·저장소에 의존하지 않으므로 Node에서 그대로 테스트할 수 있습니다.
export const SCHEMA_VERSION = 1;
export const APP_ID = 'rowing-buddy';

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/* ───────── 강도 구간 (HRR 기준) ─────────
 * 모든 구간은 심박수 예비량(HRR) 백분율입니다. 최대심박 백분율(%HRmax)과 섞지 않습니다.
 * 참고: ACSM은 40–59% HRR을 '중강도', 60–89% HRR을 '고강도'로 분류합니다.
 * 이 앱의 구간 이름은 로잉 훈련용 이름이며, 경계값은 ACSM 분류와 일반적인 5구간 Karvonen 모델을 함께 고려했습니다.
 * RPE는 Foster 수정 CR-10(0–10) 세션 RPE 척도를 따릅니다.
 * paceOffset: 2,000m 평균 페이스(/500m) 대비 초 단위 가감(양수 = 더 느리게). 로잉 코칭에서 흔히 쓰는 범위를 보수적으로 사용.
 */
export const ZONES = [
  { id: 1, name: '매우 가벼운 강도', short: '회복', hrr: [0.30, 0.50], rpe: [1, 2], spm: [18, 20], paceOffset: [25, 35] },
  { id: 2, name: '저강도 지속 운동', short: '저강도', hrr: [0.50, 0.60], rpe: [2, 3], spm: [18, 22], paceOffset: [18, 25] },
  { id: 3, name: '중강도 유산소 운동', short: '중강도', hrr: [0.60, 0.70], rpe: [3, 4], spm: [20, 24], paceOffset: [12, 18] },
  { id: 4, name: '고강도 지속 운동', short: '고강도', hrr: [0.70, 0.85], rpe: [5, 6], spm: [24, 28], paceOffset: [5, 10] },
  { id: 5, name: '매우 높은 강도', short: '최고강도', hrr: [0.85, 1.00], rpe: [7, 9], spm: [28, 32], paceOffset: [-3, 3] },
];
export const getZone = (id) => ZONES.find((z) => z.id === id) || ZONES[0];

export const RPE_LABELS = {
  0: '휴식', 1: '아주 쉬움', 2: '쉬움', 3: '보통', 4: '약간 힘듦', 5: '힘듦',
  6: '힘듦', 7: '매우 힘듦', 8: '매우 힘듦', 9: '거의 최대', 10: '최대',
};
export const RPE_GROUPS = [
  { range: [1, 2], label: '쉬움', hint: '대화가 아주 편해요' },
  { range: [3, 4], label: '보통~약간 힘듦', hint: '대화는 가능해요' },
  { range: [5, 6], label: '힘듦', hint: '짧은 문장만 가능해요' },
  { range: [7, 8], label: '매우 힘듦', hint: '말하기 어려워요' },
  { range: [9, 10], label: '거의 최대', hint: '오래 버틸 수 없어요' },
];
export const rpeGroup = (v) => RPE_GROUPS.find((g) => v >= g.range[0] && v <= g.range[1]) || null;

export const CONDITIONS = { good: '컨디션 좋음', normal: '보통', tired: '피곤함', very_tired: '매우 피곤함' };

export const GOALS = {
  endurance: { id: 'endurance', letter: 'A', name: '심폐지구력 향상', desc: '일정한 강도로 오래 젓는 유산소 운동', bullets: ['지속적인 유산소 능력 향상', '안정적인 페이스 유지', '심박수 또는 RPE 목표'] },
  base: { id: 'base', letter: 'B', name: '기초 체력·체지방 관리', desc: '꾸준히 할 수 있는 중저강도 운동', bullets: ['지속 가능한 중저강도', '꾸준한 운동 시간 확보', '강도보다 지속성 중시'] },
  interval: { id: 'interval', letter: 'C', name: '인터벌 트레이닝', desc: '빠른 구간과 회복 구간 반복', bullets: ['고강도·회복 반복', '시간·반복 수 조절 가능', '숙련도별 구성'] },
  performance: { id: 'performance', letter: 'D', name: '로잉 퍼포먼스 향상', desc: '목표 페이스를 오래 유지하는 연습', bullets: ['/500m 페이스 향상', '2,000m 기록 향상', '이전 기록 기반 목표'] },
  recovery: { id: 'recovery', letter: 'E', name: '회복·저강도 운동', desc: '가볍게 움직이며 피로 풀기', bullets: ['낮은 운동 강도', '운동 후 피로 관리', '가벼운 회복 로잉'] },
};
export const GOAL_IDS = Object.keys(GOALS);
export const LEVELS = { beginner: '초급', intermediate: '중급', advanced: '고급' };
export const DURATIONS = [10, 15, 20, 30, 45, 60];
export const HARD_GOALS = ['interval', 'performance'];

/* ───────── 시간·페이스 포맷 ───────── */
export function fmtClock(sec) {
  if (!isNum(sec)) return '–';
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
export function fmtDuration(sec) {
  if (!isNum(sec)) return '–';
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const parts = [];
  if (h) parts.push(`${h}시간`);
  if (m) parts.push(`${m}분`);
  if (r || !parts.length) parts.push(`${r}초`);
  return parts.join(' ');
}
/** "2:05", "2:05.3", "7:30", "1:02:03" → 초. 콜론이 없거나 형식이 틀리면 null */
export function parseClock(str) {
  if (str == null) return null;
  const t = String(str).trim();
  if (!/^\d{1,2}(:\d{1,2}){1,2}(\.\d+)?$/.test(t)) return null;
  const [main, frac] = t.split('.');
  const parts = main.split(':').map(Number);
  if (parts.slice(1).some((p) => p >= 60)) return null;
  let sec = parts.reduce((acc, p) => acc * 60 + p, 0);
  if (frac) sec += Number('0.' + frac);
  return sec;
}
export const fmtPace = (sec) => (isNum(sec) ? fmtClock(sec) : '–');
export const fmtPaceRange = (r) => (r ? (Math.round(r[0]) === Math.round(r[1]) ? fmtPace(r[0]) : `${fmtPace(r[0])}–${fmtPace(r[1])}`) : null);

/* ───────── 날짜 ───────── */
export function localDateStr(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
export function parseLocalDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
/** 월요일 시작 주 */
export function weekStart(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}
const DAY = 86400000;

/* ───────── 심박수 (카르보넨) ───────── */
export function ageFrom(profile, now = new Date()) {
  if (isNum(profile?.birthYear)) return now.getFullYear() - profile.birthYear;
  return null;
}
/** Tanaka 등(2001): 208 − 0.7 × 나이. 개인 오차가 ±10bpm 이상일 수 있음 */
export function estimateMaxHR(age) {
  return isNum(age) && age > 0 && age < 120 ? Math.round(208 - 0.7 * age) : null;
}
export function karvonenTarget(rest, max, frac) {
  return Math.round(rest + (max - rest) * frac);
}
/** 프로필에서 심박 계산 컨텍스트. 안정시 심박이 없거나 값이 이상하면 null */
export function hrContext(profile, now = new Date()) {
  const rest = profile?.restHR;
  if (!isNum(rest) || rest < 30 || rest > 120) return null;
  let max = profile.maxHR, estimated = false;
  if (!isNum(max)) { max = estimateMaxHR(ageFrom(profile, now)); estimated = true; }
  if (!isNum(max) || max - rest < 30) return null;
  return { rest, max, reserve: max - rest, estimated };
}
export function zoneHR(ctx, zoneId) {
  const z = getZone(zoneId);
  return [karvonenTarget(ctx.rest, ctx.max, z.hrr[0]), karvonenTarget(ctx.rest, ctx.max, z.hrr[1])];
}
export const hrToHrr = (hr, ctx) => (hr - ctx.rest) / ctx.reserve;
/** HRR 비율 → 구간 id (0 = 구간 1 미만) */
export function zoneForHrr(f) {
  if (f < ZONES[0].hrr[0]) return 0;
  for (const z of ZONES) if (f < z.hrr[1]) return z.id;
  return 5;
}

/* ───────── 페이스 기준 ───────── */
export const ANCHOR_OFFSET = { steady: 20, comfort: 22, history: 20, pb500: 13 };
export function historySteadyPace(workouts = []) {
  const xs = workouts
    .filter((w) => ['endurance', 'base'].includes(w.goal) && isNum(w.avgPaceSec) && (!isNum(w.rpe) || w.rpe <= 5))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 5)
    .map((w) => w.avgPaceSec);
  return xs.length >= 3 ? { pace: median(xs), n: xs.length } : null;
}
/** 2,000m 평균 페이스(/500m)로 환산한 기준값. 서로 다른 기록은 우선순위대로 하나만 사용(섞어서 평균내지 않음). */
export function paceAnchor(profile, workouts = []) {
  const p = profile || {};
  if (isNum(p.twoKSec) && p.twoKSec > 300) return { base: p.twoKSec / 4, source: '2k', label: '2,000m 기록 기준', estimated: false };
  const h = historySteadyPace(workouts);
  if (h) return { base: h.pace - ANCHOR_OFFSET.history, source: 'history', label: `최근 저강도 기록 ${h.n}회 기준(추정)`, estimated: true };
  if (isNum(p.recentSteadyPaceSec)) return { base: p.recentSteadyPaceSec - ANCHOR_OFFSET.steady, source: 'steady', label: '최근 지속 운동 페이스 기준(추정)', estimated: true };
  if (isNum(p.comfortPaceSec)) return { base: p.comfortPaceSec - ANCHOR_OFFSET.comfort, source: 'comfort', label: '편안한 페이스 기준(추정)', estimated: true };
  if (isNum(p.pb500Sec)) return { base: p.pb500Sec + ANCHOR_OFFSET.pb500, source: 'pb500', label: '500m 기록 기준(추정 오차 큼)', estimated: true };
  return null;
}
export function zonePace(anchor, zoneId) {
  const z = getZone(zoneId);
  return [Math.round(anchor.base + z.paceOffset[0]), Math.round(anchor.base + z.paceOffset[1])];
}

/* ───────── 프로그램 생성 ───────── */
const INTERVAL_CFG = {
  beginner: [
    { workSec: 120, restSec: 120, zoneId: 4, maxReps: 6 },
    { workSec: 60, restSec: 60, zoneId: 4, maxReps: 8 },
    { workSec: 30, restSec: 30, zoneId: 4, maxReps: 8 },
  ],
  intermediate: [
    { workSec: 180, restSec: 120, zoneId: 4, maxReps: 8 },
    { workSec: 120, restSec: 60, zoneId: 4, maxReps: 8 },
    { workSec: 60, restSec: 60, zoneId: 4, maxReps: 8 },
    { workSec: 30, restSec: 30, zoneId: 4, maxReps: 10 },
  ],
  advanced: [
    { workSec: 240, restSec: 120, zoneId: 5, maxReps: 6 },
    { workSec: 180, restSec: 90, zoneId: 5, maxReps: 6 },
    { workSec: 60, restSec: 60, zoneId: 5, maxReps: 8 },
    { workSec: 30, restSec: 30, zoneId: 5, maxReps: 10 },
  ],
};
const PERF_CFG = {
  beginner: [
    { workSec: 300, restSec: 120, zoneId: 3, maxReps: 4 },
    { workSec: 180, restSec: 60, zoneId: 3, maxReps: 5 },
    { workSec: 120, restSec: 60, zoneId: 3, maxReps: 5 },
  ],
  intermediate: [
    { workSec: 360, restSec: 120, zoneId: 4, maxReps: 5 },
    { workSec: 180, restSec: 60, zoneId: 4, maxReps: 5 },
    { workSec: 120, restSec: 60, zoneId: 4, maxReps: 5 },
  ],
  advanced: [
    { workSec: 480, restSec: 120, zoneId: 4, maxReps: 5 },
    { workSec: 240, restSec: 60, zoneId: 4, maxReps: 5 },
    { workSec: 120, restSec: 60, zoneId: 4, maxReps: 5 },
  ],
};
export function steadyZone(goal, level) {
  if (goal === 'recovery') return 1;
  if (goal === 'base') return 2;
  if (goal === 'endurance') return level === 'beginner' ? 2 : 3;
  return 2;
}
export function warmCoolSplit(totalSec, goal) {
  const T = totalSec / 60;
  if (T < 8) return [60, 60];
  if (goal === 'recovery') return [clamp(Math.round(T * 0.1), 2, 5) * 60, clamp(Math.round(T * 0.1), 2, 5) * 60];
  return [clamp(Math.round(T * 0.17), 2, 10) * 60, clamp(Math.round(T * 0.12), 2, 8) * 60];
}
const seg = (id, phase, kind, name, durationSec, zoneId, desc, extra = {}) => ({ id, phase, kind, name, durationSec, zoneId, desc, ...extra });
function splitEven(total, n) {
  const base = Math.floor(total / n / 30) * 30;
  const arr = Array(n).fill(base);
  arr[n - 1] = total - base * (n - 1);
  return arr;
}
function buildWarmup(sec) {
  if (sec >= 240) {
    const a = Math.floor(sec / 2 / 30) * 30;
    return [
      seg('w1', 'warmup', 'steady', '가볍게 시작', a, 1, '편하게 리듬을 잡아요. 다리 → 몸통 → 팔 순서를 확인하세요.'),
      seg('w2', 'warmup', 'steady', '점진적으로 올리기', sec - a, 2, '조금씩 힘을 실어 본운동을 준비해요.'),
    ];
  }
  return [seg('w1', 'warmup', 'steady', '가볍게 시작', sec, 1, '편하게 리듬을 잡으며 몸을 데워요.')];
}
function buildCooldown(sec) {
  if (sec >= 360) {
    const a = Math.floor(sec / 2 / 30) * 30;
    return [
      seg('c1', 'cooldown', 'steady', '천천히 낮추기', a, 1, '강도를 낮추고 호흡을 고르게 해요.'),
      seg('c2', 'cooldown', 'steady', '편안하게 정리', sec - a, 1, '아주 가볍게 저으며 마무리해요.'),
    ];
  }
  return [seg('c1', 'cooldown', 'steady', '쿨다운 로잉', sec, 1, '강도를 낮추고 호흡을 정리해요.')];
}
const STEADY_TEXT = {
  recovery: ['가벼운 로잉', '숨이 차지 않는 강도로 몸을 풀어요. 기록보다 편안함이 우선이에요.'],
  base: ['지속 로잉', '대화가 가능한 강도로 꾸준히 저어요. 오래 지속하는 것이 목표예요.'],
  endurance: ['유산소 지속 로잉', '일정한 페이스와 리듬을 유지해요. 후반에 무너지지 않게 조절하세요.'],
};
function buildSteadyMain(sec, zoneId, goal) {
  const n = Math.max(1, Math.ceil(sec / 600));
  const parts = splitEven(sec, n);
  const [name, desc] = STEADY_TEXT[goal] || STEADY_TEXT.base;
  return parts.map((p, i) => seg(`m${i + 1}`, 'main', 'steady', n > 1 ? `${name} ${i + 1}/${n}` : name, p, zoneId, desc));
}
function pickRepeatCfg(mainSec, list) {
  for (const c of list) {
    const reps = Math.min(c.maxReps, Math.floor(mainSec / (c.workSec + c.restSec)));
    if (reps >= 2) return { ...c, reps };
  }
  const c = list[list.length - 1];
  return { ...c, reps: Math.max(1, Math.floor(mainSec / (c.workSec + c.restSec))) };
}
function buildRepeatMain(cfg, goal) {
  const out = [];
  const workName = goal === 'interval' ? '빠른 로잉' : '페이스 유지';
  const workDesc = goal === 'interval'
    ? '힘 있게 밀어요. 마지막 반복까지 비슷한 페이스를 지킬 수 있는 강도로.'
    : '목표 페이스를 흔들림 없이 유지하는 연습이에요.';
  for (let i = 1; i <= cfg.reps; i++) {
    out.push(seg(`m${i}w`, 'main', 'work', `${workName} ${i}/${cfg.reps}`, cfg.workSec, cfg.zoneId, workDesc, { rep: i }));
    if (cfg.restSec > 0) out.push(seg(`m${i}r`, 'main', 'rest', `회복 로잉 ${i}/${cfg.reps}`, cfg.restSec, 1, '아주 가볍게 저으며 호흡을 회복해요. 완전히 멈추지 마세요.', { rep: i }));
  }
  return out;
}
export function validateCustom(c) {
  if (!c) return null;
  const workSec = Math.round(Number(c.workSec)), restSec = Math.round(Number(c.restSec)), reps = Math.round(Number(c.reps));
  if (!(workSec >= 10 && workSec <= 1800)) return null;
  if (!(restSec >= 0 && restSec <= 600)) return null;
  if (!(reps >= 1 && reps <= 20)) return null;
  const zoneId = [3, 4, 5].includes(Number(c.zoneId)) ? Number(c.zoneId) : 4;
  const paceSec = isNum(c.paceSec) && c.paceSec > 60 && c.paceSec < 400 ? c.paceSec : null;
  return { workSec, restSec, reps, zoneId, paceSec };
}
export const sumSec = (segments) => segments.reduce((s, x) => s + x.durationSec, 0);

/**
 * 프로그램 생성. custom이 있으면(인터벌·퍼포먼스) 웜업·쿨다운은 선택 시간 기준 그대로 두고
 * 본운동을 custom 값으로 다시 구성 → 전체 시간이 새로 계산됩니다.
 */
export function generateProgram({ goal, minutes, level = 'beginner', custom = null, extraReps = 0 }) {
  if (!GOALS[goal]) throw new Error('알 수 없는 훈련 목적');
  const mins = clamp(Math.round(Number(minutes) || 0), 5, 120);
  const totalSec = mins * 60;
  const lv = LEVELS[level] ? level : 'beginner';
  let [warm, cool] = warmCoolSplit(totalSec, goal);
  const mainSec = totalSec - warm - cool;
  let mainSegs, repeat = null;
  const isRepeat = goal === 'interval' || goal === 'performance';
  const cust = isRepeat ? validateCustom(custom) : null;
  if (isRepeat) {
    if (cust) {
      repeat = { workSec: cust.workSec, restSec: cust.restSec, reps: cust.reps, zoneId: cust.zoneId };
      mainSegs = buildRepeatMain(repeat, goal);
    } else {
      const list = (goal === 'interval' ? INTERVAL_CFG : PERF_CFG)[lv];
      repeat = pickRepeatCfg(mainSec, list);
      if (extraReps > 0) repeat.reps += extraReps;
      mainSegs = buildRepeatMain(repeat, goal);
      const leftover = mainSec - sumSec(mainSegs);
      if (leftover > 180) mainSegs.push(seg('mx', 'main', 'steady', '유산소 지속 로잉', leftover, 2, '남은 시간은 편안한 강도로 저어요.'));
      else if (leftover > 0) cool += leftover;
      else if (leftover < 0) cool = Math.max(60, cool + leftover); // extraReps로 늘어난 경우 쿨다운에서 흡수(최소 1분)
    }
  } else {
    mainSegs = buildSteadyMain(mainSec, steadyZone(goal, lv), goal);
  }
  const segments = [...buildWarmup(warm), ...mainSegs, ...buildCooldown(cool)];
  const plannedSec = sumSec(segments);
  const key = repeat
    ? `${goal}|${plannedSec}|${repeat.workSec}x${repeat.restSec}x${repeat.reps}z${repeat.zoneId}`
    : `${goal}|${plannedSec}`;
  return {
    schemaVersion: SCHEMA_VERSION, goal, level: lv, minutes: mins, plannedSec, segments,
    repeat: repeat ? { workSec: repeat.workSec, restSec: repeat.restSec, reps: repeat.reps, zoneId: repeat.zoneId } : null,
    intervalsPlanned: repeat ? repeat.reps : 0,
    customPaceSec: cust?.paceSec ?? null,
    isCustom: !!cust,
    key,
  };
}

/** 각 구간에 목표 심박·RPE·페이스·SPM을 붙입니다. */
export function attachTargets(program, profile, workouts = [], now = new Date()) {
  const hr = hrContext(profile, now);
  const anchor = paceAnchor(profile, workouts);
  const pref = isNum(profile?.preferredSpm) && profile.preferredSpm >= 16 && profile.preferredSpm <= 34 ? profile.preferredSpm : null;
  const segments = program.segments.map((s) => {
    const z = getZone(s.zoneId);
    const shortWork = s.kind === 'work' && s.durationSec < 180;
    let spm = z.spm;
    if (pref && s.kind === 'steady' && s.zoneId >= 2 && s.zoneId <= 3) spm = [clamp(pref - 1, z.spm[0] - 2, z.spm[1] + 2), clamp(pref + 1, z.spm[0] - 2, z.spm[1] + 2)];
    let pace = anchor ? zonePace(anchor, s.zoneId) : null;
    if (s.kind === 'work' && program.customPaceSec) pace = [program.customPaceSec, program.customPaceSec];
    return {
      ...s,
      target: {
        zoneId: s.zoneId, rpe: z.rpe, spm,
        hr: hr && !shortWork ? zoneHR(hr, s.zoneId) : null,
        hrNote: s.kind === 'work'
          ? (shortWork ? '짧은 구간은 심박이 늦게 올라와요. RPE와 페이스로 조절하세요.' : '심박은 구간 후반에야 올라가요. 참고용으로만 보세요.')
          : null,
        pace,
      },
    };
  });
  return {
    ...program, segments,
    context: {
      hr: hr ? { rest: hr.rest, max: hr.max, estimated: hr.estimated } : null,
      anchor: anchor ? { base: anchor.base, label: anchor.label, estimated: anchor.estimated } : null,
    },
  };
}

/* ───────── 평가 ───────── */
/** 실제 수행 시간 가중치. 체크리스트 로그가 있으면 실제 시간, 없으면 계획 시간. */
function weights(plan, segLog) {
  return plan.segments.map((s, i) => (segLog && segLog[i] ? segLog[i].actualSec || 0 : s.durationSec));
}
export function plannedAvgPace(plan, segLog = null) {
  const w = weights(plan, segLog);
  let t = 0, d = 0;
  for (let i = 0; i < plan.segments.length; i++) {
    if (!w[i]) continue;
    const p = plan.segments[i].target?.pace;
    if (!p) return null;
    const mid = (p[0] + p[1]) / 2;
    t += w[i];
    d += (w[i] * 500) / mid;
  }
  return d > 0 ? (500 * t) / d : null;
}
export function plannedAvgHrr(plan, segLog = null) {
  const w = weights(plan, segLog);
  let t = 0, acc = 0;
  plan.segments.forEach((s, i) => {
    if (!w[i]) return;
    const z = getZone(s.zoneId);
    t += w[i];
    acc += w[i] * ((z.hrr[0] + z.hrr[1]) / 2);
  });
  return t > 0 ? acc / t : null;
}
/** 세션 RPE 비교 기준: 반복형은 운동(work) 구간, 지속형은 본운동 구간의 시간 가중 RPE 범위 */
export function plannedSessionRpe(plan) {
  const hasWork = plan.segments.some((s) => s.kind === 'work');
  const xs = plan.segments.filter((s) => (hasWork ? s.kind === 'work' : s.phase === 'main'));
  const T = sumSec(xs);
  if (!T) return null;
  const lo = xs.reduce((a, s) => a + s.durationSec * getZone(s.zoneId).rpe[0], 0) / T;
  const hi = xs.reduce((a, s) => a + s.durationSec * getZone(s.zoneId).rpe[1], 0) / T;
  return { lo: Math.round(lo * 10) / 10, hi: Math.round(hi * 10) / 10 };
}

export const PERF_WEIGHTS = { time: 40, checklist: 30, intervals: 20, pace: 10 };
export const PERF_FORMULA = '훈련 수행도 = Σ(항목 점수 × 가중치) ÷ Σ(사용 가능한 항목의 가중치) × 100. 가중치: 시간 40, 체크리스트 30, 인터벌 20, 페이스 10. 데이터가 없는 항목은 0점 처리하지 않고 계산에서 빠집니다.';
export const PACE_RULE = '페이스 항목: 실제 평균 페이스가 수행 구간 기준 계획 평균보다 3초 이내로 느리거나 더 빠르면 100%, 그 이후 1초 늦을 때마다 약 8.3%씩 감점(15초 늦으면 0%).';

export function evaluatePerformance(w) {
  const plan = w.plan;
  const comps = [];
  if (isNum(w.actualSec) && plan?.plannedSec > 0) {
    comps.push({ key: 'time', label: '목표 시간 달성률', weight: PERF_WEIGHTS.time, value: clamp(w.actualSec / plan.plannedSec, 0, 1), detail: `${fmtDuration(w.actualSec)} / ${fmtDuration(plan.plannedSec)}` });
  } else comps.push({ key: 'time', label: '목표 시간 달성률', weight: PERF_WEIGHTS.time, value: null, reason: '실제 운동 시간이 입력되지 않았어요' });

  if (Array.isArray(w.segLog) && w.segLog.length) {
    const done = w.segLog.filter((x) => x.checked).length;
    comps.push({ key: 'checklist', label: '체크리스트 완료율', weight: PERF_WEIGHTS.checklist, value: done / w.segLog.length, detail: `${done} / ${w.segLog.length}구간` });
  } else comps.push({ key: 'checklist', label: '체크리스트 완료율', weight: PERF_WEIGHTS.checklist, value: null, reason: '타이머 없이 직접 입력한 기록이라 체크리스트가 없어요' });

  if (plan?.intervalsPlanned > 0) {
    if (isNum(w.intervalsDone)) comps.push({ key: 'intervals', label: '인터벌 수행률', weight: PERF_WEIGHTS.intervals, value: clamp(w.intervalsDone / plan.intervalsPlanned, 0, 1), detail: `${w.intervalsDone} / ${plan.intervalsPlanned}회` });
    else comps.push({ key: 'intervals', label: '인터벌 수행률', weight: PERF_WEIGHTS.intervals, value: null, reason: '수행한 인터벌 수가 입력되지 않았어요' });
  } else comps.push({ key: 'intervals', label: '인터벌 수행률', weight: PERF_WEIGHTS.intervals, value: null, reason: '인터벌이 없는 프로그램이에요', notApplicable: true });

  const target = plan ? plannedAvgPace(plan, w.segLog) : null;
  if (!isNum(w.avgPaceSec)) comps.push({ key: 'pace', label: '페이스 목표', weight: PERF_WEIGHTS.pace, value: null, reason: '평균 페이스가 입력되지 않았어요' });
  else if (target == null) comps.push({ key: 'pace', label: '페이스 목표', weight: PERF_WEIGHTS.pace, value: null, reason: '기준 기록이 없어 목표 페이스가 없었어요' });
  else {
    const diff = w.avgPaceSec - target;
    comps.push({ key: 'pace', label: '페이스 목표', weight: PERF_WEIGHTS.pace, value: diff <= 3 ? 1 : clamp(1 - (diff - 3) / 12, 0, 1), detail: `실제 ${fmtPace(w.avgPaceSec)} / 계획 평균 ${fmtPace(target)}` });
  }
  const used = comps.filter((c) => c.value != null);
  const wsum = used.reduce((a, c) => a + c.weight, 0);
  const score = wsum ? Math.round((used.reduce((a, c) => a + c.value * c.weight, 0) / wsum) * 100) : null;
  return { score, components: comps, formula: PERF_FORMULA };
}

export const HR_TOLERANCE = 0.075;
export function evaluateIntensity(w) {
  const plan = w.plan;
  const ctx = w.hrSnapshot && isNum(w.hrSnapshot.rest) && isNum(w.hrSnapshot.max) ? { ...w.hrSnapshot, reserve: w.hrSnapshot.max - w.hrSnapshot.rest } : null;
  const isRepeat = !!plan?.repeat;
  const out = { hr: null, maxHr: null, rpe: null, gap: null, pace: null, isRepeat };

  if (!isNum(w.avgHR)) out.hr = { unavailable: '평균 심박수가 입력되지 않았어요' };
  else if (!ctx) out.hr = { unavailable: '안정시 심박수(또는 최대 심박수·출생연도)가 없어 HRR을 계산할 수 없어요' };
  else {
    const actual = hrToHrr(w.avgHR, ctx);
    const planned = plannedAvgHrr(plan, w.segLog);
    const status = actual < planned - HR_TOLERANCE ? 'low' : actual > planned + HR_TOLERANCE ? 'high' : 'ok';
    out.hr = {
      actualPct: Math.round(actual * 100), plannedPct: Math.round(planned * 100), status,
      zoneId: zoneForHrr(actual), estimatedMax: !!ctx.estimated,
      note: isRepeat ? '인터벌은 평균 심박만으로 각 구간의 목표 달성 여부를 판단할 수 없어요. 세션 전체 평균만 비교했어요.' : null,
    };
  }
  if (isNum(w.maxHR) && ctx) {
    out.maxHr = { pct: Math.round(hrToHrr(w.maxHR, ctx) * 100), aboveProfile: w.maxHR > ctx.max };
  }
  if (isNum(w.rpe) && plan) {
    const p = plannedSessionRpe(plan);
    if (p) out.rpe = { value: w.rpe, lo: p.lo, hi: p.hi, status: w.rpe < p.lo - 1 ? 'low' : w.rpe > p.hi + 1 ? 'high' : 'ok' };
  } else if (!isNum(w.rpe)) out.rpe = { unavailable: 'RPE가 입력되지 않았어요' };
  if (out.hr && !out.hr.unavailable && out.rpe && !out.rpe.unavailable) {
    const z = out.hr.zoneId ? getZone(out.hr.zoneId) : null;
    const expected = z ? (z.rpe[0] + z.rpe[1]) / 2 : 0.5;
    const diff = w.rpe - expected;
    out.gap = { expected, diff, flagged: Math.abs(diff) >= 3 };
  }
  const target = plan ? plannedAvgPace(plan, w.segLog) : null;
  if (isNum(w.avgPaceSec) && target != null) {
    const diff = w.avgPaceSec - target;
    out.pace = { target, diff, status: diff < -5 ? 'fast' : diff > 5 ? 'slow' : 'ok' };
  }
  return out;
}

/** 같은 프로그램(key) → 같은 목적+시간 순으로 직전 기록을 찾습니다. */
export function findPrevious(w, workouts) {
  const earlier = workouts.filter((x) => x.id !== w.id && (x.createdAt || '') < (w.createdAt || '')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const same = earlier.find((x) => x.plan?.key && x.plan.key === w.plan?.key);
  if (same) return { prev: same, match: 'same' };
  const similar = earlier.find((x) => x.goal === w.goal && x.plan?.plannedSec === w.plan?.plannedSec);
  return similar ? { prev: similar, match: 'similar' } : null;
}

export function generateFeedback(w, perf, inten, prevInfo) {
  const fb = [];
  const t = perf.components.find((c) => c.key === 'time');
  if (t?.value != null) {
    if (t.value >= 0.95) fb.push('계획한 운동 시간을 거의 모두 수행했어요!');
    else if (t.value >= 0.7) fb.push(`계획한 시간의 ${Math.round(t.value * 100)}%를 수행했어요.`);
    else fb.push(`계획보다 짧게(${Math.round(t.value * 100)}%) 마쳤어요. 컨디션에 맞춘 선택도 좋은 훈련이에요.`);
  }
  if (inten.hr?.status === 'high') fb.push('오늘은 목표 강도보다 조금 높게 운동했어요.');
  if (inten.hr?.status === 'low') fb.push('오늘은 목표 강도보다 낮게 운동했어요.');
  if (inten.hr?.status === 'ok') fb.push('평균 심박 기준으로 목표 강도 범위 안에서 운동했어요.');
  if (inten.maxHr?.aboveProfile) fb.push('측정된 최대 심박수가 설정값보다 높아요. 설정에서 최대 심박수를 갱신해 보세요.');
  if (inten.gap?.flagged) fb.push(inten.gap.diff > 0
    ? '심박에 비해 몸이 더 힘들게 느꼈어요. 수면·피로·더위의 영향일 수 있어요.'
    : '심박에 비해 몸은 편하게 느꼈어요. 심박 측정값이나 최대 심박 설정을 확인해 보세요.');
  if (inten.pace?.status === 'fast') fb.push('계획보다 빠른 페이스로 운동했어요. 목적에 맞는 강도였는지 RPE와 함께 확인해 보세요.');
  if (prevInfo?.prev) {
    const p = prevInfo.prev;
    if (isNum(w.avgPaceSec) && isNum(p.avgPaceSec) && isNum(w.avgHR) && isNum(p.avgHR) && Math.abs(w.avgPaceSec - p.avgPaceSec) <= 2) {
      if (w.avgHR <= p.avgHR - 3) fb.push('지난번과 비슷한 페이스에서 평균 심박수가 낮아졌어요. (한 번의 비교라 추세는 기록이 더 쌓이면 확인돼요)');
      else if (w.avgHR >= p.avgHR + 3) fb.push('지난번과 비슷한 페이스에서 평균 심박수가 높았어요. 컨디션 영향일 수 있어요.');
    } else if (isNum(w.avgPaceSec) && isNum(p.avgPaceSec) && w.avgPaceSec <= p.avgPaceSec - 2) {
      fb.push(`지난번보다 평균 페이스가 ${Math.round(p.avgPaceSec - w.avgPaceSec)}초 빨라졌어요.`);
    }
  }
  if (isNum(w.rpe) && w.rpe >= 8) fb.push('오늘 RPE가 높았으니 다음 운동은 회복 중심으로 진행해 보세요.');
  if (w.condition === 'very_tired') fb.push('매우 피곤한 날이었어요. 충분히 쉬고 다음 운동은 가볍게 시작해요.');
  if (w.pain) fb.push('통증이나 이상 증상이 있었다면 강도를 높이지 마세요. 증상이 계속되면 전문가와 상담하세요.');
  return fb;
}

/* ───────── 통계 ───────── */
export function computeStats(workouts, profile, now = new Date()) {
  const ws = [...workouts].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  const wk = localDateStr(weekStart(now));
  const ym = localDateStr(now).slice(0, 7);
  const timed = ws.filter((w) => isNum(w.actualSec));
  const measured = ws.filter((w) => isNum(w.distance) && w.distanceSource === 'machine');
  const manual = ws.filter((w) => isNum(w.distance) && w.distanceSource !== 'machine');
  const goalShare = {};
  ws.forEach((w) => { goalShare[w.goal] = (goalShare[w.goal] || 0) + 1; });
  const series = (fn) => ws.map((w) => ({ date: w.date, v: fn(w) })).filter((p) => isNum(p.v));
  const s = {
    count: ws.length,
    weekCount: ws.filter((w) => w.date >= wk).length,
    monthCount: ws.filter((w) => (w.date || '').startsWith(ym)).length,
    totalSec: timed.reduce((a, w) => a + w.actualSec, 0),
    avgSec: timed.length ? timed.reduce((a, w) => a + w.actualSec, 0) / timed.length : null,
    distMeasured: measured.reduce((a, w) => a + w.distance, 0), distMeasuredN: measured.length,
    distManual: manual.reduce((a, w) => a + w.distance, 0), distManualN: manual.length,
    goalShare,
    series: {
      hr: series((w) => w.avgHR),
      rpe: series((w) => w.rpe),
      pace: series((w) => w.avgPaceSec),
      score: series((w) => evaluatePerformance(w).score),
      restHR: (profile?.restHRHistory || []).filter((p) => isNum(p.value)).map((p) => ({ date: p.date, v: p.value })),
    },
  };
  s.missing = { hr: ws.length - s.series.hr.length, rpe: ws.length - s.series.rpe.length, pace: ws.length - s.series.pace.length };
  // 지속성: 최근 8주(이번 주 포함)
  const target = isNum(profile?.weeklyTarget) ? profile.weeklyTarget : 3;
  const weeks = [];
  const cur = weekStart(now);
  for (let i = 7; i >= 0; i--) {
    const st = new Date(cur); st.setDate(st.getDate() - 7 * i);
    const en = new Date(st); en.setDate(en.getDate() + 7);
    const a = localDateStr(st), b = localDateStr(en);
    weeks.push({ start: a, count: ws.filter((w) => w.date >= a && w.date < b).length, current: i === 0 });
  }
  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].count >= target) streak++;
    else if (weeks[i].current) continue; // 진행 중인 주는 미달이어도 연속 기록을 끊지 않음
    else break;
  }
  s.consistency = { target, weeks, weeksMet: weeks.filter((w) => !w.current && w.count >= target).length, streak };
  return s;
}

/* ───────── 추세 인사이트 (여러 기록 필요) ───────── */
export function trendInsights(workouts) {
  const groups = {};
  workouts.forEach((w) => {
    const k = `${w.goal}|${w.plan?.plannedSec}`;
    (groups[k] = groups[k] || []).push(w);
  });
  const out = [];
  for (const list of Object.values(groups)) {
    const xs = list.filter((w) => isNum(w.avgPaceSec)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (xs.length < 4) continue;
    const n = xs.length >= 6 ? 3 : 2;
    const recent = xs.slice(-n), before = xs.slice(-2 * n, -n);
    const pR = mean(recent.map((w) => w.avgPaceSec)), pB = mean(before.map((w) => w.avgPaceSec));
    const rR = mean(recent.filter((w) => isNum(w.rpe)).map((w) => w.rpe)), rB = mean(before.filter((w) => isNum(w.rpe)).map((w) => w.rpe));
    const name = `${GOALS[xs[0].goal]?.name} ${Math.round((xs[0].plan?.plannedSec || 0) / 60)}분`;
    if (pB - pR >= 2 && (rR == null || rB == null || rR <= rB + 0.5)) {
      out.push({ type: 'pace', text: `${name}: 최근 ${n}회 평균 페이스가 이전 ${n}회보다 ${Math.round(pB - pR)}초 빨라졌어요(RPE는 비슷하거나 낮음). 퍼포먼스가 좋아지고 있을 가능성이 있어요.` });
    }
    const hrR = recent.filter((w) => isNum(w.avgHR)), hrB = before.filter((w) => isNum(w.avgHR));
    if (hrR.length === n && hrB.length === n && Math.abs(pR - pB) <= 2) {
      const d = mean(hrB.map((w) => w.avgHR)) - mean(hrR.map((w) => w.avgHR));
      if (d >= 3) out.push({ type: 'hr', text: `${name}: 비슷한 페이스에서 최근 ${n}회 평균 심박이 ${Math.round(d)}bpm 낮아졌어요. 운동 효율이 개선되었을 가능성이 있어요.` });
    }
  }
  return out;
}

/* ───────── 규칙 기반 개인화 추천 ───────── */
export const MIN_RECORDS = 3;
export function recommend(workouts, profile, now = new Date()) {
  const level = profile?.level || 'beginner';
  const ws = [...workouts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const ageH = (w) => (now - new Date(w.createdAt)) / 3600000;
  const defaultMin = level === 'beginner' ? 20 : 30;
  const recentMins = ws.slice(0, 10).map((w) => Math.round((w.plan?.plannedSec || 0) / 60)).filter((m) => m > 0);
  const typical = recentMins.length ? Number(Object.entries(recentMins.reduce((a, m) => ((a[m] = (a[m] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1])[0][0]) : defaultMin;
  const rec = { goal: null, minutes: typical, extraReps: 0, reasons: [], insights: trendInsights(workouts), dataEnough: ws.length >= MIN_RECORDS, rule: null };
  const done = (goal, minutes, rule, reason) => { rec.goal = goal; rec.minutes = minutes; rec.rule = rule; rec.reasons.push(reason); return rec; };

  if (ws.length < MIN_RECORDS) {
    return done(profile?.goal && GOALS[profile.goal] ? profile.goal : 'base', defaultMin, 'not-enough',
      `개인화 분석을 위한 기록이 더 필요해요. (현재 ${ws.length}회, ${MIN_RECORDS}회부터 분석) 우선 일반적인 수준으로 추천해요.`);
  }
  const last = ws[0];
  const recent7 = ws.filter((w) => ageH(w) <= 24 * 7);
  if (ws.slice(0, 2).some((w) => w.pain && ageH(w) <= 24 * 7)) {
    return done('recovery', 15, 'pain', '최근 운동에서 통증·이상 증상을 기록했어요. 강도를 올리지 않고 가벼운 회복 운동만 추천해요. 증상이 계속되면 운동을 쉬고 전문가와 상담하세요.');
  }
  const last3 = recent7.slice(0, 3);
  const highRpe = last3.filter((w) => isNum(w.rpe) && w.rpe >= 7).length;
  const tired = last3.filter((w) => ['tired', 'very_tired'].includes(w.condition)).length;
  if (highRpe >= 2 || tired >= 2 || (last.condition === 'very_tired' && ageH(last) <= 48)) {
    const why = [];
    if (highRpe >= 2) why.push(`최근 ${last3.length}회 중 ${highRpe}회 RPE 7 이상`);
    if (tired >= 2) why.push(`피곤함 기록 ${tired}회`);
    if (!why.length) why.push('직전 운동에서 매우 피곤함');
    return done('recovery', Math.min(20, typical), 'fatigue', `${why.join(', ')}이라 피로가 쌓였을 수 있어요. 회복 운동을 추천해요.`);
  }
  if (ageH(last) <= 36 && (HARD_GOALS.includes(last.goal) || (isNum(last.rpe) && last.rpe >= 7))) {
    return done('base', typical, 'after-hard', '최근 고강도 운동을 했어요. 다음 운동은 저강도로 회복을 도우면 좋아요.');
  }
  if (ageH(last) > 24 * 7) {
    const m = Math.max(15, Math.round((typical * 0.7) / 5) * 5);
    return done('base', m, 'comeback', `마지막 운동 후 ${Math.floor(ageH(last) / 24)}일이 지났어요. 평소보다 짧고 가볍게 다시 시작해요.`);
  }
  const hard7 = recent7.filter((w) => HARD_GOALS.includes(w.goal)).length;
  const rpeAvg = mean(ws.slice(0, 5).filter((w) => isNum(w.rpe)).map((w) => w.rpe));
  let goal;
  if (hard7 >= 3) { goal = 'endurance'; rec.reasons.push(`최근 7일 고강도 훈련이 ${hard7}회예요. 유산소 지속 운동으로 균형을 맞춰요.`); }
  else if (hard7 === 0 && level !== 'beginner' && (rpeAvg == null || rpeAvg <= 5)) { goal = 'interval'; rec.reasons.push('최근 7일간 고강도 훈련이 없고 피로 신호도 없어요. 인터벌로 자극을 줘 볼 수 있어요.'); }
  else {
    goal = profile?.goal && GOALS[profile.goal] ? profile.goal : last.goal;
    rec.reasons.push('피로 신호가 없어 평소 목표대로 진행해요.');
  }
  rec.goal = goal; rec.rule = 'normal';
  // 진행(progression): 같은 목적·시간을 최근 3회 안정적으로 완료 → 한 가지 요소만 소폭 증가
  const same = ws.filter((w) => w.goal === goal && Math.round((w.plan?.plannedSec || 0) / 60) === typical).slice(0, 3);
  if (same.length === 3) {
    const ok = same.every((w) => {
      const sc = evaluatePerformance(w).score;
      const p = plannedSessionRpe(w.plan);
      return sc != null && sc >= 90 && isNum(w.rpe) && p && w.rpe <= p.hi + 1;
    });
    if (ok) {
      if (HARD_GOALS.includes(goal)) { rec.extraReps = 1; rec.reasons.push('같은 훈련을 최근 3회 안정적으로 완료했어요(수행도 90점 이상, RPE 적정). 반복을 1회만 늘려 보는 선택지를 드려요. 강도는 그대로예요.'); }
      else if (typical < 60) { rec.minutes = typical + 5; rec.reasons.push('같은 훈련을 최근 3회 안정적으로 완료했어요(수행도 90점 이상, RPE 적정). 강도는 그대로 두고 시간만 5분 늘려 보는 선택지를 드려요.'); }
    }
  }
  return rec;
}

/* ───────── 데이터 마이그레이션 · 백업 ───────── */
export function migrateWorkout(w) {
  const base = {
    memo: '', avgHR: null, maxHR: null, distance: null, distanceSource: null, avgPaceSec: null, avgSpm: null,
    machineNote: '', rpe: null, condition: null, pain: false, intervalsDone: null, segLog: null, hrSnapshot: null, completed: false,
  };
  const out = { ...base, ...w, schemaVersion: SCHEMA_VERSION };
  if (!out.date && out.createdAt) out.date = localDateStr(new Date(out.createdAt));
  if (out.distanceSource && !['machine', 'manual'].includes(out.distanceSource)) out.distanceSource = 'manual';
  return out;
}
export function migrateProfile(p) {
  if (!p) return null;
  return { restHRHistory: [], weeklyTarget: 3, level: 'beginner', ...p, schemaVersion: SCHEMA_VERSION };
}
export function upsertWorkout(list, w) {
  const i = list.findIndex((x) => x.id === w.id);
  if (i < 0) return [...list, w];
  const copy = [...list];
  copy[i] = w;
  return copy;
}
export function buildBackup(profile, workouts, now = new Date()) {
  return { app: APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), profile: profile || null, workouts: workouts || [] };
}
export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'JSON 형식이 아니에요.' };
  if (obj.app !== APP_ID) return { ok: false, error: '로잉버디 백업 파일이 아니에요.' };
  if (!Array.isArray(obj.workouts)) return { ok: false, error: '운동 기록 목록이 없어요.' };
  if (isNum(obj.schemaVersion) && obj.schemaVersion > SCHEMA_VERSION) return { ok: false, error: '더 최신 버전의 앱에서 만든 백업이에요. 앱을 업데이트한 뒤 복원하세요.' };
  return { ok: true };
}
const fingerprint = (w) => `${w.createdAt}|${w.goal}|${w.plan?.plannedSec}`;
/** 같은 id 또는 같은 시작시각·목적·계획시간 기록은 건너뜁니다(중복 복원 방지). */
export function mergeWorkouts(existing, incoming) {
  const ids = new Set(existing.map((w) => w.id));
  const fps = new Set(existing.map(fingerprint));
  const merged = [...existing];
  let added = 0, skipped = 0, invalid = 0;
  for (const raw of incoming) {
    if (!raw || !raw.id || !raw.createdAt) { invalid++; continue; }
    const w = migrateWorkout(raw);
    if (ids.has(w.id) || fps.has(fingerprint(w))) { skipped++; continue; }
    ids.add(w.id); fps.add(fingerprint(w));
    merged.push(w);
    added++;
  }
  return { merged, added, skipped, invalid };
}
