import { memo, useId } from 'react';
import type { CreatureId, Equipped, PlayerPublic } from '@shared/types';
import { CREATURES, type Colorway } from '@shared/creatures';
import { stageForLevel, COSMETIC_BY_ID } from '@shared/progression';

export type CreatureState = 'idle' | 'happy' | 'victory' | 'defeat' | 'attack' | 'hit' | 'select' | 'enter' | 'guard' | 'evolve';

interface Props {
  creature: CreatureId;
  colorway?: number;
  equipped?: Partial<Equipped>;
  state?: CreatureState;
  flip?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** render without aura/cosmetics (for tiny avatars) */
  bare?: boolean;
  animKey?: string | number;
  /** creature level: drives the evolution form (Lv4 evolved, Lv8 final) */
  level?: number;
  /** force a form (for teasers) */
  stage?: 1 | 2 | 3;
  /** blacked-out mystery silhouette (evolution teaser) */
  silhouette?: boolean;
}

interface Anchors { headTop: { x: number; y: number; w: number }; eyes: { lx: number; rx: number; y: number; r: number }; shoulders: { y: number; w: number } }
interface Parts { back?: React.ReactNode; body: React.ReactNode; front?: React.ReactNode; anchors: Anchors; floats?: boolean }

const shade = (hex: string, amt: number) => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt)), g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt)), b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

function Eye({ x, y, r, c, pupil = '#1a1218', lid, sleepy }: { x: number; y: number; r: number; c: Colorway; pupil?: string; lid?: boolean; sleepy?: boolean }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={c.eye} />
      <circle cx={x + r * 0.15} cy={y + r * 0.1} r={r * 0.55} fill={pupil} />
      <circle cx={x + r * 0.35} cy={y - r * 0.35} r={r * 0.22} fill="#fff" opacity={0.9} />
      {sleepy && <path d={`M${x - r} ${y - r * 0.2} Q${x} ${y - r * 1.2} ${x + r} ${y - r * 0.2} L${x + r} ${y - r - 2} L${x - r} ${y - r - 2} Z`} fill={c.body} />}
      {lid !== false && <rect className="lid" x={x - r - 1} y={y - r - 1} width={r * 2 + 2} height={r * 2 + 2} rx={r} fill={c.body} style={{ transformBox: 'fill-box', transformOrigin: 'center top', animationDelay: `${-((x * 131 + y * 17) % 4500)}ms` } as React.CSSProperties} />}
    </g>
  );
}

// ---------------- species ----------------
function dragon(c: Colorway): Parts {
  const dark = shade(c.body, -28);
  return {
    anchors: { headTop: { x: 100, y: 56, w: 56 }, eyes: { lx: 88, rx: 112, y: 82, r: 6 }, shoulders: { y: 105, w: 70 } },
    back: (
      <g>
        <path className="wing" d="M78 104 C55 80 30 70 18 86 C32 90 40 104 46 118 C58 110 70 108 78 104Z" fill={c.accent} opacity={0.95} />
        <path className="wing r" d="M122 104 C145 80 170 70 182 86 C168 90 160 104 154 118 C142 110 130 108 122 104Z" fill={c.accent} opacity={0.95} />
        <path className="tail" d="M70 150 C40 160 24 140 30 118 C36 134 48 140 66 138" stroke={c.body} strokeWidth="12" fill="none" strokeLinecap="round" />
        <path d="M34 112 L22 108 L30 122 Z" fill={c.accent} />
      </g>
    ),
    body: (
      <g>
        <ellipse cx="80" cy="166" rx="12" ry="7" fill={dark} />
        <ellipse cx="120" cy="166" rx="12" ry="7" fill={dark} />
        <ellipse cx="100" cy="132" rx="38" ry="34" fill={c.body} />
        <ellipse cx="100" cy="140" rx="22" ry="21" fill={c.belly} />
        <path d="M100 140 h0" />
        {[0, 1, 2].map((i) => <line key={i} x1={84 + i * 16} y1={138 + i * 2} x2={116 - i * 2} y2={138 + i * 2} stroke={shade(c.belly, -30)} strokeWidth="1.5" opacity={0.5} />)}
        <path d="M86 60 L80 44 L94 54 Z" fill={c.accent} />
        <path d="M114 60 L120 44 L106 54 Z" fill={c.accent} />
        <circle cx="100" cy="84" r="30" fill={c.body} />
        <ellipse cx="100" cy="98" rx="18" ry="11" fill={shade(c.body, 18)} />
        <circle cx="94" cy="97" r="1.8" fill={dark} /><circle cx="106" cy="97" r="1.8" fill={dark} />
        <path d="M88 104 Q100 112 112 104" stroke={dark} strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M90 106 l3 5 M110 106 l-3 5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        <Eye x={88} y={82} r={6} c={c} /><Eye x={112} y={82} r={6} c={c} />
        <path className="flame" d="M100 110 C94 118 96 126 100 130 C104 126 106 118 100 110Z" fill={c.glow} opacity={0.9} />
        <path className="flame" d="M100 114 C97 118 98 124 100 126 C102 124 103 118 100 114Z" fill="#fff6d6" opacity={0.8} />
      </g>
    ),
  };
}

function wombat(c: Colorway): Parts {
  const dark = shade(c.body, -30);
  return {
    anchors: { headTop: { x: 100, y: 52, w: 70 }, eyes: { lx: 84, rx: 116, y: 90, r: 5 }, shoulders: { y: 100, w: 90 } },
    back: (
      <g>
        <circle cx="54" cy="126" r="22" fill="#8a5a36" stroke="#5a3a22" strokeWidth="3" />
        <circle cx="54" cy="126" r="7" fill={c.accent} />
        <path d="M54 110 v32 M38 126 h32" stroke="#5a3a22" strokeWidth="2" />
      </g>
    ),
    body: (
      <g>
        <rect x="68" y="150" width="22" height="22" rx="9" fill={dark} />
        <rect x="110" y="150" width="22" height="22" rx="9" fill={dark} />
        <ellipse cx="100" cy="128" rx="52" ry="44" fill={c.body} />
        <ellipse cx="100" cy="142" rx="30" ry="22" fill={c.belly} opacity={0.9} />
        <circle cx="70" cy="62" r="11" fill={c.body} /><circle cx="130" cy="62" r="11" fill={c.body} />
        <circle cx="70" cy="62" r="5" fill={c.belly} opacity={0.7} /><circle cx="130" cy="62" r="5" fill={c.belly} opacity={0.7} />
        <circle cx="100" cy="90" r="38" fill={c.body} />
        <rect x="62" y="70" width="76" height="10" rx="5" fill={c.accent} />
        <path d="M138 75 l12 -8 l-4 10 l6 6 z" fill={c.accent} />
        <ellipse cx="100" cy="106" rx="22" ry="14" fill={shade(c.body, 14)} />
        <rect x="90" y="100" width="20" height="12" rx="6" fill={dark} />
        <path d="M92 114 Q100 120 108 114" stroke={dark} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <Eye x={84} y={90} r={5} c={c} /><Eye x={116} y={90} r={5} c={c} />
        <path d="M78 84 l10 -4 M122 84 l-10 -4" stroke={dark} strokeWidth="3" strokeLinecap="round" />
      </g>
    ),
  };
}

function possum(c: Colorway): Parts {
  const dark = shade(c.body, -30);
  return {
    anchors: { headTop: { x: 100, y: 58, w: 48 }, eyes: { lx: 90, rx: 110, y: 84, r: 8 }, shoulders: { y: 108, w: 56 } },
    back: (
      <g>
        <path className="tail" d="M124 150 C160 160 178 130 160 108 C150 96 136 100 136 114 C136 126 150 128 154 118" stroke={c.accent} strokeWidth="11" fill="none" strokeLinecap="round" />
      </g>
    ),
    body: (
      <g>
        <ellipse cx="86" cy="166" rx="10" ry="6" fill={dark} /><ellipse cx="114" cy="166" rx="10" ry="6" fill={dark} />
        <ellipse cx="100" cy="132" rx="30" ry="36" fill={c.body} />
        <ellipse cx="100" cy="140" rx="17" ry="24" fill={c.belly} />
        <circle cx="78" cy="62" r="13" fill={c.body} /><circle cx="122" cy="62" r="13" fill={c.body} />
        <circle cx="78" cy="62" r="7" fill="#e8a0a8" /><circle cx="122" cy="62" r="7" fill="#e8a0a8" />
        <circle cx="100" cy="86" r="27" fill={c.body} />
        <path d="M82 96 L100 118 L118 96 Z" fill={c.belly} />
        <circle cx="100" cy="114" r="4" fill="#d96b7a" />
        <path d="M94 110 h12" stroke={dark} strokeWidth="1.5" opacity={0.6} />
        <Eye x={90} y={84} r={8} c={c} /><Eye x={110} y={84} r={8} c={c} />
        {/* stolen grape */}
        <circle cx="84" cy="128" r="7" fill="#6b2d5c" /><circle cx="90" cy="134" r="7" fill="#7a3568" /><circle cx="80" cy="137" r="6" fill="#5e2653" />
        <ellipse cx="78" cy="124" rx="6" ry="4" fill={c.body} /><ellipse cx="94" cy="128" rx="6" ry="4" fill={c.body} />
      </g>
    ),
  };
}

function owl(c: Colorway): Parts {
  const dark = shade(c.body, -30);
  return {
    anchors: { headTop: { x: 100, y: 48, w: 62 }, eyes: { lx: 86, rx: 114, y: 84, r: 10 }, shoulders: { y: 100, w: 80 } },
    back: (
      <g>
        <path d="M30 170 Q100 158 170 170" stroke="#5a3a22" strokeWidth="6" fill="none" strokeLinecap="round" />
        <path d="M60 165 q-6 -8 -2 -14 M140 165 q6 -8 2 -14" stroke="#7fb069" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
    ),
    body: (
      <g>
        <ellipse cx="100" cy="122" rx="40" ry="46" fill={c.body} />
        <path d="M62 110 C50 130 56 156 70 160 C72 140 70 122 62 110Z" fill={dark} />
        <path d="M138 110 C150 130 144 156 130 160 C128 140 130 122 138 110Z" fill={dark} />
        <ellipse cx="100" cy="134" rx="24" ry="26" fill={c.belly} />
        {[0, 1, 2].map((i) => <path key={i} d={`M${86 + i * 4} ${122 + i * 11} l7 6 l7 -6 l7 6 l7 -6`} stroke={shade(c.belly, -50)} strokeWidth="1.5" fill="none" opacity={0.5} />)}
        <path d="M88 166 l-4 6 M92 166 l0 7 M96 166 l4 6 M104 166 l-4 6 M108 166 l0 7 M112 166 l4 6" stroke="#e5ad48" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M72 64 L62 40 L86 56 Z" fill={c.body} /><path d="M128 64 L138 40 L114 56 Z" fill={c.body} />
        <circle cx="100" cy="80" r="34" fill={c.body} />
        <circle cx="86" cy="84" r="17" fill={c.belly} /><circle cx="114" cy="84" r="17" fill={c.belly} />
        <path d="M70 70 Q100 56 130 70" stroke={c.accent} strokeWidth="3" fill="none" strokeLinecap="round" />
        <Eye x={86} y={84} r={10} c={c} pupil="#15121a" /><Eye x={114} y={84} r={10} c={c} pupil="#15121a" />
        <path d="M94 98 L106 98 L100 108 Z" fill={c.accent} />
        <path d="M118 122 a10 10 0 1 0 0 1" fill={c.accent} opacity={0.0} />
        <path d="M110 134 a9 9 0 1 1 0 0.1 M113 134 a6 6 0 1 1 0 0.1" fill="none" />
      </g>
    ),
  };
}

function goblin(c: Colorway): Parts {
  const barrel = '#8a5a36', band = '#3f2a1a';
  const dark = shade(c.body, -30);
  return {
    anchors: { headTop: { x: 100, y: 64, w: 52 }, eyes: { lx: 90, rx: 110, y: 94, r: 6 }, shoulders: { y: 110, w: 70 } },
    body: (
      <g>
        <path d="M62 108 C58 130 58 150 62 170 L138 170 C142 150 142 130 138 108 Z" fill={barrel} />
        {[70, 82, 94, 106, 118, 130].map((x) => <line key={x} x1={x} y1="110" x2={x} y2="170" stroke={shade(barrel, -25)} strokeWidth="1.5" opacity={0.6} />)}
        <rect x="58" y="118" width="84" height="7" rx="3" fill={band} /><rect x="58" y="150" width="84" height="7" rx="3" fill={band} />
        <path d="M60 108 Q100 100 140 108" stroke={band} strokeWidth="8" fill="none" />
        {/* hands gripping rim */}
        <ellipse cx="72" cy="106" rx="9" ry="6" fill={c.body} /><ellipse cx="128" cy="106" rx="9" ry="6" fill={c.body} />
        <rect x="124" y="84" width="8" height="18" rx="3" fill="#c9a97a" transform="rotate(-20 128 93)" />
        {/* ears */}
        <path d="M74 86 L44 70 L72 100 Z" fill={c.body} /><path d="M126 86 L156 70 L128 100 Z" fill={c.body} />
        <path d="M70 88 L56 78 L72 96 Z" fill={shade(c.body, 20)} opacity={0.6} /><path d="M130 88 L144 78 L128 96 Z" fill={shade(c.body, 20)} opacity={0.6} />
        <circle cx="100" cy="92" r="28" fill={c.body} />
        <path d="M82 104 Q100 122 118 104 Q100 112 82 104Z" fill={dark} />
        <path d="M88 106 l3 6 M100 109 l0 7 M112 106 l-3 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        <circle cx="100" cy="100" r="4" fill={shade(c.body, -10)} />
        <Eye x={90} y={92} r={6} c={c} /><Eye x={110} y={92} r={6} c={c} />
        <path d="M82 84 l12 2 M118 84 l-12 2" stroke={dark} strokeWidth="2.5" strokeLinecap="round" />
      </g>
    ),
  };
}

function sprite(c: Colorway): Parts {
  const grape = '#6b2d5c';
  return {
    floats: true,
    anchors: { headTop: { x: 100, y: 48, w: 44 }, eyes: { lx: 92, rx: 108, y: 74, r: 6 }, shoulders: { y: 96, w: 50 } },
    back: (
      <g>
        <path className="wing" d="M84 104 C50 90 36 110 46 136 C62 128 74 118 84 104Z" fill={c.accent} opacity={0.85} />
        <path className="wing r" d="M116 104 C150 90 164 110 154 136 C138 128 126 118 116 104Z" fill={c.accent} opacity={0.85} />
        <path d="M84 104 C64 104 54 118 50 130 M116 104 C136 104 146 118 150 130" stroke={shade(c.accent, -40)} strokeWidth="1.5" fill="none" opacity={0.6} />
      </g>
    ),
    body: (
      <g>
        <path d="M100 150 C70 130 74 92 100 92 C126 92 130 130 100 150Z" fill={c.body} />
        <path d="M100 142 C86 130 88 104 100 104 C112 104 114 130 100 142Z" fill={c.belly} opacity={0.75} />
        <path d="M100 150 C104 160 94 166 100 176 C106 168 98 162 100 150" stroke={c.accent} strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="100" cy="74" r="23" fill={c.body} />
        {[[86, 52], [100, 46], [114, 52], [93, 58], [107, 58], [80, 62], [120, 62]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="7" fill={i % 2 ? shade(grape, 15) : grape} />)}
        <path d="M100 46 q4 -10 10 -12" stroke="#7fb069" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <Eye x={92} y={74} r={6} c={c} /><Eye x={108} y={74} r={6} c={c} />
        <path d="M94 86 Q100 91 106 86" stroke={shade(c.body, -40)} strokeWidth="2" fill="none" strokeLinecap="round" />
        <circle cx="84" cy="80" r="3" fill="#ffd6d6" opacity={0.6} /><circle cx="116" cy="80" r="3" fill="#ffd6d6" opacity={0.6} />
      </g>
    ),
  };
}

function barrel(c: Colorway): Parts {
  const dark = shade(c.body, -35);
  return {
    anchors: { headTop: { x: 100, y: 58, w: 70 }, eyes: { lx: 82, rx: 118, y: 100, r: 10 }, shoulders: { y: 80, w: 90 } },
    body: (
      <g>
        <rect x="70" y="150" width="20" height="24" rx="8" fill={dark} /><rect x="110" y="150" width="20" height="24" rx="8" fill={dark} />
        <ellipse cx="80" cy="174" rx="13" ry="5" fill={shade(dark, -10)} /><ellipse cx="120" cy="174" rx="13" ry="5" fill={shade(dark, -10)} />
        <path d="M50 92 C46 110 46 130 50 150 C70 158 130 158 150 150 C154 130 154 110 150 92 C130 84 70 84 50 92Z" fill={c.body} />
        {[62, 76, 90, 104, 118, 132].map((x) => <line key={x} x1={x} y1="86" x2={x} y2="156" stroke={dark} strokeWidth="1.5" opacity={0.5} />)}
        <path d="M48 66 C46 76 46 86 50 92 L150 92 C154 86 154 76 152 66 C130 60 70 60 48 66Z" fill={shade(c.body, 10)} />
        <ellipse cx="100" cy="64" rx="50" ry="9" fill={shade(c.body, 25)} />
        <rect x="46" y="100" width="108" height="8" rx="4" fill={c.accent} /><rect x="46" y="138" width="108" height="8" rx="4" fill={c.accent} />
        {/* tiny arms */}
        <ellipse cx="44" cy="124" rx="7" ry="11" fill={dark} transform="rotate(20 44 124)" /><ellipse cx="156" cy="124" rx="7" ry="11" fill={dark} transform="rotate(-20 156 124)" />
        {/* face */}
        <circle cx="82" cy="100" r="13" fill={c.belly} /><circle cx="118" cy="100" r="13" fill={c.belly} />
        <Eye x={82} y={100} r={9} c={{ ...c, eye: c.eye }} /><Eye x={118} y={100} r={9} c={c} />
        <rect x="94" y="114" width="12" height="10" rx="3" fill="#5a4a44" /><circle cx="100" cy="128" r="5" fill="#8a7a74" />
        <path d="M80 130 Q100 142 120 130" stroke={dark} strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
    ),
  };
}

function fox(c: Colorway): Parts {
  const dark = shade(c.body, -35);
  return {
    anchors: { headTop: { x: 100, y: 48, w: 56 }, eyes: { lx: 90, rx: 110, y: 84, r: 6 }, shoulders: { y: 108, w: 60 } },
    back: (
      <g>
        <path className="tail" d="M122 150 C150 166 180 150 176 118 C170 134 158 136 150 130 C160 118 156 104 148 100 C150 118 136 130 122 150Z" fill={c.body} />
        <path d="M176 118 C170 134 158 136 150 130 C156 124 160 116 162 108 C170 110 174 114 176 118Z" fill={c.belly} />
      </g>
    ),
    body: (
      <g>
        <ellipse cx="86" cy="168" rx="9" ry="5" fill={c.accent} /><ellipse cx="114" cy="168" rx="9" ry="5" fill={c.accent} />
        <ellipse cx="100" cy="134" rx="32" ry="34" fill={c.body} />
        <ellipse cx="100" cy="142" rx="17" ry="22" fill={c.belly} />
        <path d="M78 52 L70 80 L92 70 Z" fill={c.body} /><path d="M122 52 L130 80 L108 70 Z" fill={c.body} />
        <path d="M78 52 L74 66 L86 62 Z" fill={c.accent} /><path d="M122 52 L126 66 L114 62 Z" fill={c.accent} />
        <circle cx="100" cy="84" r="28" fill={c.body} />
        <path d="M76 90 Q100 128 124 90 Q100 100 76 90Z" fill={c.belly} />
        <circle cx="100" cy="108" r="3.5" fill={c.accent} />
        <path d="M94 112 Q100 117 106 112" stroke={dark} strokeWidth="2" fill="none" strokeLinecap="round" />
        <Eye x={90} y={84} r={6} c={c} sleepy /><Eye x={110} y={84} r={6} c={c} />
        {/* bow tie */}
        <path d="M100 116 L88 110 L88 122 Z M100 116 L112 110 L112 122 Z" fill={c.accent} /><circle cx="100" cy="116" r="2.5" fill={c.belly} />
      </g>
    ),
  };
}

/** The groom's Golden Stag: gold antlers, a tux, light rays and twinkles. Deliberately the flashiest thing in the game. */
function stag(c: Colorway): Parts {
  const dark = shade(c.body, -40);
  const antler = (m: 1 | -1) => {
    const X = (x: number) => (m === 1 ? x : 200 - x);
    const d = `M${X(90)} 62 C${X(84)} 46 ${X(76)} 34 ${X(62)} 18 M${X(84)} 47 L${X(68)} 44 M${X(79)} 38 L${X(84)} 20 M${X(71)} 28 L${X(56)} 30 M${X(66)} 23 L${X(66)} 10`;
    return (<g key={m}><path d={d} stroke={shade(c.accent, -45)} strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" /><path d={d} stroke={c.accent} strokeWidth="5.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /><path d={d} stroke="#fffbe8" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity={0.75} /></g>);
  };
  const star = (x: number, y: number, r: number, i: number) => <path key={i} className="stag-twinkle" style={{ animationDelay: `${-i * 0.55}s` }} d={`M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z`} fill="#fff6d6" />;
  return {
    anchors: { headTop: { x: 100, y: 60, w: 44 }, eyes: { lx: 91, rx: 109, y: 80, r: 5.5 }, shoulders: { y: 112, w: 58 } },
    back: (
      <g>
        <g className="stag-rays" opacity={0.13}>{Array.from({ length: 10 }, (_, i) => <path key={i} d="M100 110 L94 20 L106 20 Z" fill={c.glow} transform={`rotate(${i * 36} 100 110)`} />)}</g>
        {antler(1)}{antler(-1)}
        <ellipse cx="132" cy="128" rx="7" ry="9" fill={c.belly} />
      </g>
    ),
    body: (
      <g>
        {[72, 120].map((x) => <g key={x}><rect x={x} y="142" width="8" height="24" rx="3" fill={shade(dark, -25)} /><ellipse cx={x + 4} cy="167" rx="5.5" ry="3" fill="#1a1218" /></g>)}
        {[85, 107].map((x) => <g key={x}><rect x={x} y="146" width="8" height="24" rx="3" fill={dark} /><ellipse cx={x + 4} cy="171" rx="6" ry="3.5" fill="#1a1218" /></g>)}
        <ellipse cx="100" cy="134" rx="34" ry="26" fill={c.body} />
        {/* the tux */}
        <path d="M74 120 Q100 110 126 120 L122 156 Q100 163 78 156 Z" fill="#17131c" />
        <path d="M92 114 L100 142 L108 114 Z" fill="#fffaf2" />
        <path d="M91 114 L100 142 M109 114 L100 142" stroke={c.accent} strokeWidth="1.6" opacity={0.9} />
        <circle cx="100" cy="148" r="1.8" fill={c.accent} /><circle cx="100" cy="154" r="1.8" fill={c.accent} />
        <path d="M80 126 l8 3 M120 126 l-8 3" stroke={c.accent} strokeWidth="1.2" opacity={0.7} />
        {/* neck + head */}
        <path d="M89 118 L92 94 L108 94 L111 118 Z" fill={c.body} />
        <ellipse cx="73" cy="74" rx="13" ry="6" fill={c.body} transform="rotate(-25 73 74)" /><ellipse cx="73" cy="74" rx="8" ry="3" fill={c.belly} transform="rotate(-25 73 74)" />
        <ellipse cx="127" cy="74" rx="13" ry="6" fill={c.body} transform="rotate(25 127 74)" /><ellipse cx="127" cy="74" rx="8" ry="3" fill={c.belly} transform="rotate(25 127 74)" />
        <ellipse cx="100" cy="82" rx="21" ry="23" fill={c.body} />
        <path d="M100 62 L104 68 L100 74 L96 68 Z" fill={c.accent} stroke="#fffbe8" strokeWidth="0.8" />
        <ellipse cx="100" cy="98" rx="13" ry="10" fill={c.belly} />
        <ellipse cx="100" cy="93" rx="5.5" ry="3.6" fill="#2a1a10" /><ellipse cx="98.5" cy="92" rx="1.6" ry="1" fill="#fff" opacity={0.6} />
        <path d="M94 102 Q101 107 107 101" stroke={dark} strokeWidth="2" fill="none" strokeLinecap="round" />
        <Eye x={91} y={80} r={5.5} c={c} /><Eye x={109} y={80} r={5.5} c={c} />
        {/* gold bow tie */}
        <path d="M100 115 L88 109 L88 121 Z M100 115 L112 109 L112 121 Z" fill={c.accent} stroke={shade(c.accent, -50)} strokeWidth="1" /><circle cx="100" cy="115" r="2.6" fill={shade(c.accent, -30)} />
      </g>
    ),
    front: <g>{star(36, 72, 6, 0)}{star(164, 58, 7, 1)}{star(156, 142, 5, 2)}{star(44, 148, 5, 3)}{star(132, 26, 4, 4)}</g>,
  };
}

const BUILDERS: Record<CreatureId, (c: Colorway) => Parts> = { dragon, wombat, possum, owl, goblin, sprite, barrel, fox, stag };

// ---------------- cosmetics ----------------
function Hat({ id, a }: { id: string; a: Anchors }) {
  const { x, y, w } = a.headTop;
  // a crooked party cone: body, tip, stripe, pom (white needs an outline to show against a pale creature)
  const cone = (fill: string, tip: string, stripe: string, pom: string, stroke?: string) => (
    <g transform={`translate(${x + w * 0.22} ${y - 2}) rotate(14)`}><path d="M0 0 L-14 2 L0 -34 L14 2 Z" fill={fill} stroke={stroke} strokeWidth={stroke ? 1.2 : 0} /><path d="M-8 -16 L8 -16 L0 -34 Z" fill={tip} /><path d="M-11 -8 h22" stroke={stripe} strokeWidth="3" /><circle cx="0" cy="-35" r="4" fill={pom} /></g>
  );
  // a cracker crown: a tissue-paper band with a zig-zag of points, the back row peeking over the top
  const crown = (fill: string, stroke: string) => {
    const W = w / 2.1, pts = 5, step = (2 * W) / pts;
    const zig = (top: number, base: number) => `M${-W} 4 L${-W} ${base} ` + Array.from({ length: pts }, (_, i) => `L${-W + step * (i + 0.5)} ${top} L${-W + step * (i + 1)} ${base}`).join(' ') + ` L${W} 4 Z`;
    return (
      <g transform={`translate(${x} ${y - 2})`}>
        <path d={zig(-30, -16)} transform="translate(0 -3) scale(0.86 1)" fill={shade(fill, -40)} stroke={stroke} strokeWidth="1" />
        <path d={zig(-26, -12)} fill={fill} stroke={stroke} strokeWidth="1.2" strokeLinejoin="round" />
        <path d={`M${-W + 2} 0 h${2 * W - 4}`} stroke="rgba(255,255,255,.35)" strokeWidth="2" />
      </g>
    );
  };
  switch (id) {
    case 'hat_party': return cone('#E5AD48', '#76243A', '#F6EBDD', '#F07842');
    // Starter kit: Christmas-cracker paper crowns in five colours you can tell apart across a table
    case 'hat_party_blue': return crown('#2B5BD7', '#1A3A8F');
    case 'hat_party_purple': return crown('#8E3BCB', '#5A2187');
    case 'hat_party_white': return crown('#FFFAF2', '#c9c2c9');
    case 'hat_party_yellow': return crown('#F2D13A', '#B8961C');
    case 'hat_party_green': return crown('#2EA84A', '#1C6E30');
    case 'hat_santa': return (<g transform={`translate(${x} ${y + 2})`}><path d={`M${-w / 2.4} -3 L${w / 2.4} -3 Q${w / 3} -24 ${w / 1.5} -30 Q${w / 2.6} -20 ${w / 6} -14 Q0 -22 ${-w / 2.4} -3 Z`} fill="#c8102e" stroke="#8e0a21" strokeWidth="1.2" /><circle cx={w / 1.5} cy="-31" r="5" fill="#fffaf2" stroke="#d8cfc6" strokeWidth="1" /><rect x={-w / 2.4 - 2} y="-7" width={w / 1.2 + 4} height="9" rx="4.5" fill="#fffaf2" stroke="#d8cfc6" strokeWidth="1" /></g>);
    case 'hat_bunny': return (<g transform={`translate(${x} ${y + 2})`}>{[-1, 1].map((d) => <g key={d} transform={`translate(${d * w / 5} -4) rotate(${d * 12})`}><ellipse cx="0" cy="-20" rx="6.5" ry="22" fill="#fffaf2" stroke="#c9c2c9" strokeWidth="1.2" /><ellipse cx="0" cy="-19" rx="3.2" ry="15" fill="#F4A7B9" /></g>)}<rect x={-w / 2.6} y="-5" width={w / 1.3} height="5" rx="2.5" fill="#242127" /></g>);
    case 'hat_cork': return (<g>{[-2, -1, 0, 1, 2].map((i) => <rect key={i} x={x + i * (w / 5.2) - 5} y={y - 14 - (i === 0 ? 4 : Math.abs(i) === 1 ? 2 : 0)} width="10" height="16" rx="3" fill="#c9a97a" stroke="#8a6a46" strokeWidth="1.5" />)}<rect x={x - w / 2 + 2} y={y - 4} width={w - 4} height="6" rx="3" fill="#76243A" /></g>);
    case 'hat_crown': return (<g transform={`translate(${x} ${y})`}><path d={`M${-w / 2.4} 2 L${-w / 2.4} -22 L${-w / 4.8} -10 L0 -28 L${w / 4.8} -10 L${w / 2.4} -22 L${w / 2.4} 2 Z`} fill="#E5AD48" stroke="#c98a2a" strokeWidth="2" /><circle cx={-w / 4.8} cy="-4" r="3" fill="#F07842" /><circle cx="0" cy="-6" r="3.5" fill="#76243A" /><circle cx={w / 4.8} cy="-4" r="3" fill="#F07842" /></g>);
    case 'hat_jester': return (<g transform={`translate(${x} ${y + 2})`}><path d={`M${-w / 2.3} 0 Q${-w / 2} -26 ${-w / 1.4} -22 Q${-w / 4} -14 0 -6 Q${w / 4} -14 ${w / 1.4} -22 Q${w / 2} -26 ${w / 2.3} 0 Z`} fill="#76243A" /><path d={`M0 -6 Q${w / 4} -14 ${w / 1.4} -22 Q${w / 2} -26 ${w / 2.3} 0 Z`} fill="#E5AD48" /><circle cx={-w / 1.4} cy="-22" r="4" fill="#F3CD7A" /><circle cx={w / 1.4} cy="-22" r="4" fill="#F3CD7A" /><rect x={-w / 2.3} y="-3" width={w / 1.15} height="6" rx="3" fill="#F6EBDD" /></g>);
    case 'hat_feathers': return (<g transform={`translate(${x} ${y + 2})`}>{[-22, -8, 8, 22].map((r, i) => <g key={i} transform={`rotate(${r})`}><path d="M0 0 C-6 -14 -4 -30 0 -38 C4 -30 6 -14 0 0Z" fill="#F6EBDD" stroke="#c9c2c9" strokeWidth="1" /><path d="M0 -30 C-2 -34 -1 -37 0 -38 C1 -37 2 -34 0 -30Z" fill="#242127" /></g>)}<ellipse cx="0" cy="0" rx="10" ry="4" fill="#E5AD48" /></g>);
    case 'hat_chef': return (<g transform={`translate(${x} ${y + 2})`}><rect x={-w / 3} y="-10" width={w / 1.5} height="12" rx="2" fill="#F6EBDD" stroke="#d8cfc6" strokeWidth="1.5" />{[-1, 0, 1].map((i) => <circle key={i} cx={i * w / 5} cy={-18 - (i === 0 ? 6 : 0)} r={w / 5.2} fill="#fffaf2" stroke="#d8cfc6" strokeWidth="1.5" />)}<path d={`M${-w / 3 + 4} -4 h${w / 1.5 - 8}`} stroke="#e7dfd6" strokeWidth="1.5" /></g>);
    case 'hat_cap': return (<g transform={`translate(${x} ${y + 2})`}><path d={`M${-w / 2.4} 0 Q${-w / 2.4} -22 0 -22 Q${w / 2.4} -22 ${w / 2.4} 0 Z`} fill="#c8102e" /><path d={`M${w / 2.6} -2 Q${w / 1.3} -2 ${w / 1.1} 4 L${w / 2.6} 4 Z`} fill="#9e0b24" /><rect x={-w / 2.4} y="-3" width={w / 1.2} height="5" rx="2" fill="#9e0b24" /><circle cx="0" cy="-22" r="3" fill="#F6EBDD" /><text x="0" y="-8" textAnchor="middle" fontSize="9" fontWeight="900" fill="#fff">J</text></g>);
    case 'hat_esky': return (<g transform={`translate(${x} ${y + 2})`}><rect x={-w / 2.6} y="-20" width={w / 1.3} height="20" rx="3" fill="#1f6fd1" stroke="#0f4a96" strokeWidth="1.5" /><rect x={-w / 2.6 - 2} y="-24" width={w / 1.3 + 4} height="7" rx="3" fill="#F6EBDD" stroke="#c9c2c9" strokeWidth="1" /><rect x="-7" y="-28" width="14" height="5" rx="2" fill="#F6EBDD" stroke="#c9c2c9" strokeWidth="1" /><text x="0" y="-6" textAnchor="middle" fontSize="7" fontWeight="900" fill="#fff">CHO</text></g>);
    case 'hat_viking': return (<g transform={`translate(${x} ${y + 2})`}><path d={`M${-w / 2.3} 0 Q${-w / 2.3} -24 0 -24 Q${w / 2.3} -24 ${w / 2.3} 0 Z`} fill="#9a949c" stroke="#5a565c" strokeWidth="1.5" /><rect x={-w / 2.3} y="-4" width={w / 1.15} height="6" rx="2" fill="#c98a2a" /><path d={`M${-w / 2.3} -8 C${-w / 1.4} -12 ${-w / 1.3} -30 ${-w / 1.6} -40 C${-w / 1.8} -28 ${-w / 2.2} -20 ${-w / 2.6} -14 Z`} fill="#F6EBDD" stroke="#c9c2c9" strokeWidth="1" /><path d={`M${w / 2.3} -8 C${w / 1.4} -12 ${w / 1.3} -30 ${w / 1.6} -40 C${w / 1.8} -28 ${w / 2.2} -20 ${w / 2.6} -14 Z`} fill="#F6EBDD" stroke="#c9c2c9" strokeWidth="1" /></g>);
    case 'hat_beret': return (<g transform={`translate(${x} ${y + 2})`}><ellipse cx="2" cy="-6" rx={w / 2.2} ry="9" fill="#242127" /><ellipse cx="-4" cy="-10" rx={w / 2.6} ry="8" fill="#3a3340" /><circle cx="-6" cy="-19" r="2.5" fill="#242127" /></g>);
    default: return null;
  }
}
function Face({ id, a }: { id: string; a: Anchors }) {
  const { lx, rx, y, r } = a.eyes;
  switch (id) {
    case 'face_shades': return (<g><rect x={lx - r - 3} y={y - r - 1} width={r * 2 + 6} height={r * 2 + 2} rx="5" fill="#15121a" /><rect x={rx - r - 3} y={y - r - 1} width={r * 2 + 6} height={r * 2 + 2} rx="5" fill="#15121a" /><line x1={lx + r + 3} y1={y} x2={rx - r - 3} y2={y} stroke="#15121a" strokeWidth="3" /><path d={`M${lx - r} ${y - r + 2} l${r} ${-1}`} stroke="#fff" strokeWidth="1.5" opacity={0.6} /></g>);
    case 'face_mic': return (<g transform={`translate(${rx + r + 6} ${y + r * 2 + 10}) rotate(-25)`}><rect x="-2.5" y="0" width="5" height="20" rx="2.5" fill="#242127" /><circle cx="0" cy="-3" r="6" fill="#9a949c" stroke="#5a565c" strokeWidth="1.5" /><path d="M-4 -3 h8 M0 -7 v8" stroke="#5a565c" strokeWidth="1" /><circle cx="0" cy="12" r="1.5" fill="#F07842" /></g>);
    case 'face_headphones': { const hx = (lx + rx) / 2; const span = (rx - lx) / 2 + r * 2.6; return (<g><path d={`M${hx - span} ${y} Q${hx - span} ${y - span * 1.7} ${hx} ${y - span * 1.7} Q${hx + span} ${y - span * 1.7} ${hx + span} ${y}`} fill="none" stroke="#242127" strokeWidth="5" strokeLinecap="round" /><rect x={hx - span - 7} y={y - 9} width="12" height="20" rx="5" fill="#c38cff" stroke="#242127" strokeWidth="2" /><rect x={hx + span - 5} y={y - 9} width="12" height="20" rx="5" fill="#c38cff" stroke="#242127" strokeWidth="2" /></g>); }
    case 'face_mo': { const hx = (lx + rx) / 2; const my = y + r * 2.6; return (<path d={`M${hx} ${my} C${hx - 6} ${my - 6} ${hx - 18} ${my - 4} ${hx - 22} ${my + 4} C${hx - 14} ${my + 2} ${hx - 8} ${my + 4} ${hx} ${my + 2} C${hx + 8} ${my + 4} ${hx + 14} ${my + 2} ${hx + 22} ${my + 4} C${hx + 18} ${my - 4} ${hx + 6} ${my - 6} ${hx} ${my} Z`} fill="#3a2a22" />); }
    case 'face_monocle': return (<g><circle cx={rx} cy={y} r={r + 4} fill="none" stroke="#E5AD48" strokeWidth="2.5" /><path d={`M${rx + r + 2} ${y + r} q6 14 2 26`} stroke="#E5AD48" strokeWidth="1.5" fill="none" /></g>);
    default: return null;
  }
}
function Apron({ a }: { a: Anchors }) {
  const { y, w } = a.shoulders;
  return (<g><path d={`M${100 - w / 4} ${y + 6} L${100 + w / 4} ${y + 6} L${100 + w / 3} ${y + 62} Q100 ${y + 68} ${100 - w / 3} ${y + 62} Z`} fill="#2f2a33" opacity={0.95} /><path d={`M${100 - w / 4} ${y + 6} Q100 ${y - 14} ${100 + w / 4} ${y + 6}`} fill="none" stroke="#2f2a33" strokeWidth="3" /><rect x={100 - w / 6} y={y + 30} width={w / 3} height="12" rx="3" fill="#F07842" opacity={0.9} /><text x="100" y={y + 25} textAnchor="middle" fontSize="8" fontWeight="900" fill="#E5AD48">BBQ</text></g>);
}
function HiVis({ a }: { a: Anchors }) {
  const { y, w } = a.shoulders;
  return (<g><path d={`M${100 - w / 2.6} ${y + 2} L${100 + w / 2.6} ${y + 2} L${100 + w / 2.3} ${y + 60} L${100 - w / 2.3} ${y + 60} Z`} fill="#d7ff1f" opacity={0.95} /><path d={`M${100 - w / 2.45} ${y + 24} h${w / 1.22} M${100 - w / 2.35} ${y + 44} h${w / 1.18}`} stroke="#e8e8e8" strokeWidth="5" /><path d={`M${100 - w / 2.45} ${y + 24} h${w / 1.22} M${100 - w / 2.35} ${y + 44} h${w / 1.18}`} stroke="#b9b9b9" strokeWidth="1" /><path d={`M100 ${y + 2} v58`} stroke="#b8d400" strokeWidth="2" /></g>);
}
function Sash({ a }: { a: Anchors }) {
  const { y, w } = a.shoulders;
  return (<g><path d={`M${100 - w / 2 + 4} ${y + 4} L${100 - w / 2 + 16} ${y - 2} L${100 + w / 2 - 2} ${y + 54} L${100 + w / 2 - 14} ${y + 60} Z`} fill="#F6EBDD" opacity={0.95} /><path d={`M${100 - w / 2 + 10} ${y + 1} L${100 + w / 2 - 8} ${y + 57}`} stroke="#E5AD48" strokeWidth="2.5" /><circle cx="100" cy={y + 30} r="5" fill="#76243A" stroke="#E5AD48" strokeWidth="1.5" /></g>);
}
/** Evolution extras: Lv4 adds a gold crest, Lv8 adds wings of light and a halo. */
function EvoBack({ stage, a }: { stage: number; a: Anchors }) {
  if (stage < 3) return null;
  const { y } = a.shoulders;
  return (<g className="evo-wings" opacity="0.85"><path d={`M92 ${y + 6} C60 ${y - 30} 22 ${y - 18} 16 ${y + 18} C40 ${y + 8} 60 ${y + 18} 92 ${y + 20} Z`} fill="url(#evoWing)" /><path d={`M108 ${y + 6} C140 ${y - 30} 178 ${y - 18} 184 ${y + 18} C160 ${y + 8} 140 ${y + 18} 108 ${y + 20} Z`} fill="url(#evoWing)" /></g>);
}
function EvoFront({ stage, a }: { stage: number; a: Anchors }) {
  if (stage < 2) return null;
  const { x, y, w } = a.headTop;
  return (<g>
    <g transform={`translate(${x} ${y + 4})`}>{[-1, 0, 1].map((i) => <path key={i} d={`M${i * w / 5 - 5} 0 L${i * w / 5} ${i === 0 ? -16 : -11} L${i * w / 5 + 5} 0 Z`} fill="#E5AD48" stroke="#fbe3a6" strokeWidth="1" />)}</g>
    {stage >= 3 && <ellipse className="evo-halo" cx={x} cy={y - 26} rx={w / 2.4} ry="5" fill="none" stroke="#F3CD7A" strokeWidth="3" />}
  </g>);
}
function Cape({ id, a }: { id: string; a: Anchors }) {
  const { y, w } = a.shoulders;
  const fill = id === 'cape_gold' ? 'url(#capeGold)' : id === 'cape_slayer' ? 'url(#capeSlayer)' : 'url(#capeVelvet)';
  return <path d={`M${100 - w / 2} ${y} C${100 - w / 2 - 14} ${y + 40} ${100 - w / 2 - 18} ${y + 70} ${100 - w / 2 - 10} ${y + 72} L${100 + w / 2 + 10} ${y + 72} C${100 + w / 2 + 18} ${y + 70} ${100 + w / 2 + 14} ${y + 40} ${100 + w / 2} ${y} Z`} fill={fill} opacity={0.95} />;
}
const AURA_COLORS: Record<string, string> = { aura_ember: '#F07842', aura_moon: '#cfd8ff', aura_gold: '#E5AD48', aura_disco: '#c38cff', aura_clean: '#7fe3ff', aura_epic: '#9b5cff', aura_rainbow: '#ff6bd6' };

export const Creature = memo(function Creature({ creature, colorway = 0, equipped, state = 'idle', flip, className, style, bare, animKey, level, stage: forcedStage, silhouette }: Props) {
  const stage = forcedStage ?? (level ? stageForLevel(level) : 1);
  const evoScale = stage === 3 ? 1.12 : stage === 2 ? 1.06 : 1;
  const def = CREATURES[creature];
  const cw = def.colorways[Math.min(colorway, def.colorways.length - 1)] ?? def.colorways[0];
  const parts = BUILDERS[creature](cw);
  const uid = useId().replace(/:/g, '');
  const aura = !bare && equipped?.aura ? AURA_COLORS[equipped.aura] : null;
  const pose = !bare && equipped?.pose;
  const poseT = pose === 'pose_heroic' ? 'rotate(-5 100 170) scale(1.05) translate(-5 -8)' : pose === 'pose_lounge' ? 'rotate(-16 100 170) translate(6 4)' : undefined;
  return (
    <div className={`creature cre-${creature} evo-${stage} ${silhouette ? 'silhouette' : ''} ${flip ? 'flip' : ''} ${className ?? ''}`} data-state={state} style={style} key={animKey}>
      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label={def.name}>
        <defs>
          <radialGradient id={`aura-${uid}`}><stop offset="0" stopColor={aura ?? cw.glow} stopOpacity="0.55" /><stop offset="0.6" stopColor={aura ?? cw.glow} stopOpacity="0.18" /><stop offset="1" stopColor={aura ?? cw.glow} stopOpacity="0" /></radialGradient>
          <linearGradient id="capeVelvet" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8E2B45" /><stop offset="1" stopColor="#571827" /></linearGradient>
          <linearGradient id="capeGold" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#F3CD7A" /><stop offset="1" stopColor="#c98a2a" /></linearGradient>
          <linearGradient id="capeSlayer" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3a3340" /><stop offset="0.85" stopColor="#15121a" /><stop offset="1" stopColor="#76243A" /></linearGradient>
          <linearGradient id="evoWing" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#fff6d6" stopOpacity="0.2" /><stop offset="1" stopColor="#E5AD48" stopOpacity="0.85" /></linearGradient>
          <radialGradient id={`shadow-${uid}`}><stop offset="0" stopColor="#000" stopOpacity="0.45" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
        </defs>
        {!bare && (aura || state !== 'idle' || true) && <circle className={`aura-g ${equipped?.aura === 'aura_rainbow' ? 'aura-rainbow' : ''}`} cx="100" cy="118" r="78" fill={`url(#aura-${uid})`} opacity={aura ? 1 : 0.5} />}
        <ellipse cx="100" cy="176" rx="48" ry="9" fill={`url(#shadow-${uid})`} />
        {state === 'guard' && (<g className="shield"><circle cx="100" cy="118" r="70" fill="none" stroke="#E5AD48" strokeWidth="3" strokeDasharray="14 10" opacity="0.9" /><circle cx="100" cy="118" r="62" fill="rgba(229,173,72,0.12)" stroke="#F6EBDD" strokeWidth="1.5" opacity="0.8" /></g>)}
        <g transform={evoScale !== 1 ? `translate(100 176) scale(${evoScale}) translate(-100 -176)` : undefined}>
        <g className={`body-g ${parts.floats ? 'float' : ''}`} transform={poseT}>
          <EvoBack stage={stage} a={parts.anchors} />
          {!bare && equipped?.cape && equipped.cape !== 'cape_groomsman' && equipped.cape !== 'cape_apron' && equipped.cape !== 'cape_hivis' && <Cape id={equipped.cape} a={parts.anchors} />}
          {parts.back}
          {parts.body}
          {parts.front}
          {!bare && equipped?.cape === 'cape_groomsman' && <Sash a={parts.anchors} />}
          {!bare && equipped?.cape === 'cape_apron' && <Apron a={parts.anchors} />}
          {!bare && equipped?.cape === 'cape_hivis' && <HiVis a={parts.anchors} />}
          {!bare && equipped?.face && <Face id={equipped.face} a={parts.anchors} />}
          <EvoFront stage={stage} a={parts.anchors} />
          {!bare && equipped?.hat && <Hat id={equipped.hat} a={parts.anchors} />}
        </g>
        </g>
      </svg>
    </div>
  );
});

export default Creature;

// ---------------- item previews ----------------
const SLOT_EMOJI: Record<string, string> = { hat: '🎩', face: '🕶️', cape: '🧣', aura: '✨', pose: '🦸' };
/** A hat on its own, drawn exactly as the creature wears it: for the accessory list and the "up for grabs" card. */
export function HatIcon({ id, size = 34 }: { id: string; size?: number }) {
  const a: Anchors = { headTop: { x: 0, y: 8, w: 40 }, eyes: { lx: 0, rx: 0, y: 0, r: 0 }, shoulders: { y: 0, w: 0 } };
  return <svg className="hat-icon" width={size} height={size} viewBox="-34 -50 68 64" aria-hidden="true"><Hat id={id} a={a} /></svg>;
}
/** Any accessory: hats are drawn, the rest fall back to their slot's emoji. */
export function ItemIcon({ id, size = 34 }: { id: string; size?: number }) {
  const slot = COSMETIC_BY_ID[id]?.slot;
  if (slot === 'hat') return <HatIcon id={id} size={size} />;
  return <span className="hat-icon" style={{ fontSize: size * 0.7, lineHeight: 1, width: size, textAlign: 'center' }} aria-hidden="true">{SLOT_EMOJI[slot ?? ''] ?? '🎁'}</span>;
}

/** A lad as they appear in lists and the feed: their selfie if they took one, else their creature. */
export function LadPic({ p }: { p: Pick<PlayerPublic, 'creature' | 'level' | 'equipped' | 'avatarUrl' | 'nickname'> }) {
  if (p.avatarUrl) return <img className="face-pic" src={p.avatarUrl} alt={p.nickname} loading="lazy" decoding="async" />;
  if (p.creature) return <Creature creature={p.creature} level={p.level} colorway={p.equipped.colorway} equipped={p.equipped} bare />;
  return <span style={{ fontSize: 20 }}>🥚</span>;
}
