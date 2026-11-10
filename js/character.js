// character.js — 로잉머신 위의 작은 캐릭터 '노리'. SVG + SMIL 애니메이션(가벼움, 외부 파일 없음).
// state: home | warmup | work | steady | rest | cooldown | done
const reduce = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const P = {
  legFinish: 'M92,86 L121,82 L150,86', legCatch: 'M114,86 L128,60 L150,86',
  armFinish: 'M88,60 L100,72 L106,68', armCatch: 'M110,60 L130,64 L150,66',
};

export function character(state = 'home', size = 'md') {
  const anim = !reduce() && state !== 'done';
  const dur = { work: 1.5, steady: 2.4, warmup: 3, home: 3.4, rest: 4, cooldown: 4 }[state] || 3;
  const kt = 'keyTimes="0;0.62;1"';
  const a = (attr, from, to) => (anim ? `<animate attributeName="${attr}" values="${from};${to};${from}" ${kt} dur="${dur}s" repeatCount="indefinite"/>` : '');
  const sleepy = state === 'rest' || state === 'cooldown';
  const eyes = sleepy
    ? `<path d="M81,56 q3,3 6,0 M91,56 q3,3 6,0" stroke="var(--char-ink)" stroke-width="2" fill="none" stroke-linecap="round"/>`
    : `<circle cx="84" cy="55" r="2.8" fill="var(--char-ink)"/><circle cx="94" cy="55" r="2.8" fill="var(--char-ink)"/>`;
  const mouth = state === 'work'
    ? `<ellipse cx="90" cy="65" rx="3" ry="2.4" fill="var(--char-ink)"/>`
    : `<path d="M86,63 q4,4 8,0" stroke="var(--char-ink)" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  const sweat = state === 'work' ? `<path d="M66,40 q-4,7 0,9 q4,-2 0,-9z" fill="var(--sky-deep)" opacity=".7">${anim ? `<animate attributeName="opacity" values="0;.8;0" dur="${dur * 2}s" repeatCount="indefinite"/>` : ''}</path>` : '';

  if (state === 'done') {
    const conf = [[40, 20, 'var(--peach)'], [62, 8, 'var(--sky-deep)'], [120, 14, 'var(--mint-deep)'], [140, 30, 'var(--peach)'], [30, 44, 'var(--mint-deep)'], [150, 6, 'var(--sun)']]
      .map(([x, y, c], i) => `<rect x="${x}" y="${y}" width="6" height="6" rx="1.5" fill="${c}" transform="rotate(${i * 25} ${x + 3} ${y + 3})">${reduce() ? '' : `<animate attributeName="y" values="${y};${y + 10};${y}" dur="${1.6 + i * 0.2}s" repeatCount="indefinite"/>`}</rect>`).join('');
    return `<svg class="char char-${size}" viewBox="0 0 220 130" role="img" aria-label="운동을 마치고 기뻐하는 캐릭터">
      ${machine()}${conf}
      <g>${reduce() ? '' : '<animateTransform attributeName="transform" type="translate" values="0,0;0,-5;0,0" dur="0.9s" repeatCount="indefinite"/>'}
        <rect x="62" y="90" width="30" height="8" rx="4" fill="var(--machine-2)"/>
        <path d="M92,86 L121,82 L150,86" stroke="var(--char-limb)" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M70,52 L60,26 M96,52 L108,26" stroke="var(--char-limb)" stroke-width="6" fill="none" stroke-linecap="round"/>
        <ellipse cx="80" cy="62" rx="22" ry="26" fill="var(--char-body)"/>
        <path d="M81,54 q3,-4 6,0 M91,54 q3,-4 6,0" stroke="var(--char-ink)" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <ellipse cx="80" cy="62" rx="3.5" ry="2.4" fill="var(--blush)"/><ellipse cx="100" cy="62" rx="3.5" ry="2.4" fill="var(--blush)"/>
        <path d="M85,63 q5,7 10,0z" fill="var(--char-ink)"/>
      </g></svg>`;
  }
  const label = { home: '로잉머신에 앉아 기다리는 캐릭터', warmup: '가볍게 노를 젓는 캐릭터', work: '힘차게 노를 젓는 캐릭터', steady: '일정하게 노를 젓는 캐릭터', rest: '숨을 고르는 캐릭터', cooldown: '편안하게 정리하는 캐릭터' }[state] || '로잉 캐릭터';
  return `<svg class="char char-${size}" viewBox="0 0 220 130" role="img" aria-label="${label}">
    ${machine()}
    <line x1="106" y1="68" x2="182" y2="80" stroke="var(--machine)" stroke-width="1.6" stroke-dasharray="3 3">${a('x1', 106, 150)}${a('y1', 68, 66)}</line>
    <path d="${P.legFinish}" stroke="var(--char-limb)" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round">${a('d', P.legFinish, P.legCatch)}</path>
    <g>${anim ? `<animateTransform attributeName="transform" type="translate" values="0,0;22,0;0,0" ${kt} dur="${dur}s" repeatCount="indefinite"/>` : ''}
      <rect x="62" y="90" width="30" height="8" rx="4" fill="var(--machine-2)"/>
      <ellipse cx="78" cy="62" rx="22" ry="26" fill="var(--char-body)"/>
      ${eyes}${mouth}${sweat}
      <ellipse cx="79" cy="61" rx="3.5" ry="2.4" fill="var(--blush)"/><ellipse cx="99" cy="61" rx="3.5" ry="2.4" fill="var(--blush)"/>
    </g>
    <path d="${P.armFinish}" stroke="var(--char-limb)" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round">${a('d', P.armFinish, P.armCatch)}</path>
    <rect x="104" y="62" width="5" height="12" rx="2.5" fill="var(--char-ink)">${a('x', 104, 148)}</rect>
  </svg>`;
}
function machine() {
  return `<g>
    <rect x="18" y="98" width="172" height="8" rx="4" fill="var(--machine)"/>
    <rect x="26" y="104" width="7" height="14" rx="3" fill="var(--machine)"/><rect x="176" y="104" width="7" height="14" rx="3" fill="var(--machine)"/>
    <circle cx="186" cy="80" r="20" fill="var(--machine-2)"/><circle cx="186" cy="80" r="8" fill="var(--machine)"/>
    <rect x="148" y="70" width="8" height="28" rx="3" fill="var(--machine)" transform="rotate(-14 152 84)"/>
    <path d="M186,60 L176,36" stroke="var(--machine)" stroke-width="4" stroke-linecap="round"/>
    <rect x="164" y="22" width="24" height="16" rx="4" fill="var(--machine-2)"/><rect x="168" y="26" width="16" height="8" rx="2" fill="var(--screen)"/>
  </g>`;
}
