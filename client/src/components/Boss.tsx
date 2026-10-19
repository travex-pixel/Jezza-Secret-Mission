import { memo } from 'react';
import type { BossId } from '@shared/types';

/** Original raid bosses: the Bin Chicken King (Friday) and the Hangover Hydra (Saturday). */
export const Boss = memo(function Boss({ boss, hitKey, dead, style }: { boss: BossId; hitKey?: number; dead?: boolean; style?: React.CSSProperties }) {
  return (
    <div className={`boss ${hitKey ? 'hit' : ''} ${dead ? 'dead' : ''}`} key={hitKey} style={style}>
      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label={boss === 'ibis' ? 'The Bin Chicken King' : 'The Hangover Hydra'}>
        <defs>
          <radialGradient id="bossGlow"><stop offset="0" stopColor="#F07842" stopOpacity="0.5" /><stop offset="1" stopColor="#F07842" stopOpacity="0" /></radialGradient>
        </defs>
        <circle cx="100" cy="115" r="92" fill="url(#bossGlow)" />
        <ellipse cx="100" cy="186" rx="62" ry="9" fill="rgba(0,0,0,.45)" />
        <g className="boss-body">{boss === 'ibis' ? <Ibis /> : <Hydra />}</g>
      </svg>
    </div>
  );
});

function Ibis() {
  return (
    <g>
      {/* legs */}
      <path d="M86 150 L82 182 M114 150 L118 182" stroke="#d8a85a" strokeWidth="5" strokeLinecap="round" />
      <path d="M74 183 h16 M110 183 h16" stroke="#d8a85a" strokeWidth="4" strokeLinecap="round" />
      {/* tail */}
      <path d="M128 132 C150 136 162 150 158 160 C146 152 136 150 124 146 Z" fill="#242127" />
      {/* body */}
      <ellipse cx="102" cy="128" rx="40" ry="30" fill="#F6EBDD" />
      <path d="M74 120 C80 104 108 100 132 116 C116 114 96 118 74 120Z" fill="#e2d8cc" />
      <path d="M70 128 C78 146 104 154 130 146" stroke="#d9cfc2" strokeWidth="3" fill="none" />
      {/* bin lid shield */}
      <ellipse cx="66" cy="136" rx="14" ry="20" fill="#3d6a3a" stroke="#2a4a28" strokeWidth="3" />
      <rect x="62" y="122" width="8" height="4" rx="2" fill="#2a4a28" />
      {/* neck + head */}
      <path d="M92 104 C86 84 88 66 100 58" stroke="#242127" strokeWidth="13" fill="none" strokeLinecap="round" />
      <circle cx="102" cy="56" r="14" fill="#242127" />
      <circle cx="107" cy="52" r="3.5" fill="#F07842" /><circle cx="108" cy="51" r="1.4" fill="#fff" />
      {/* the beak, holding a chip */}
      <path d="M112 58 C130 62 146 78 152 100 C140 84 126 70 110 64 Z" fill="#15121a" />
      <rect x="146" y="94" width="20" height="6" rx="2" fill="#f3cd7a" transform="rotate(30 156 97)" />
      {/* crown */}
      <path d="M90 44 L92 30 L98 38 L103 26 L108 38 L114 30 L116 44 Z" fill="#E5AD48" stroke="#c98a2a" strokeWidth="2" />
      <circle cx="103" cy="38" r="2.5" fill="#76243A" />
    </g>
  );
}

function Hydra() {
  return (
    <g>
      {/* body */}
      <ellipse cx="100" cy="148" rx="52" ry="34" fill="#76243A" />
      <ellipse cx="100" cy="156" rx="32" ry="20" fill="#B98286" />
      <path d="M70 176 h14 M116 176 h14" stroke="#571827" strokeWidth="9" strokeLinecap="round" />
      {/* necks */}
      <path d="M78 130 C60 110 46 90 48 70" stroke="#8E2B45" strokeWidth="16" fill="none" strokeLinecap="round" />
      <path d="M100 124 C100 100 100 78 100 52" stroke="#8E2B45" strokeWidth="16" fill="none" strokeLinecap="round" />
      <path d="M122 130 C140 110 154 90 152 70" stroke="#8E2B45" strokeWidth="16" fill="none" strokeLinecap="round" />
      {/* left head: shades */}
      <ellipse cx="46" cy="64" rx="19" ry="15" fill="#8E2B45" />
      <rect x="31" y="57" width="13" height="9" rx="3" fill="#15121a" /><rect x="47" y="57" width="13" height="9" rx="3" fill="#15121a" /><path d="M44 61 h3" stroke="#15121a" strokeWidth="2" />
      <path d="M36 72 Q46 76 56 72" stroke="#3a1420" strokeWidth="2" fill="none" />
      {/* middle head: dizzy + ice pack */}
      <ellipse cx="100" cy="46" rx="21" ry="17" fill="#8E2B45" />
      <path d="M86 44 a4 4 0 1 1 6 0 a2 2 0 1 1 -3 0" stroke="#F6EBDD" strokeWidth="2" fill="none" />
      <path d="M108 44 a4 4 0 1 1 6 0 a2 2 0 1 1 -3 0" stroke="#F6EBDD" strokeWidth="2" fill="none" />
      <path d="M92 56 Q100 52 108 56" stroke="#3a1420" strokeWidth="2.5" fill="none" />
      <rect x="86" y="24" width="28" height="10" rx="5" fill="#9ed0f0" stroke="#6aa8d0" strokeWidth="1.5" />
      {/* right head: yawning */}
      <ellipse cx="154" cy="64" rx="19" ry="15" fill="#8E2B45" />
      <path d="M144 60 q4 -3 8 0 M158 60 q4 -3 8 0" stroke="#F6EBDD" strokeWidth="2" fill="none" />
      <ellipse cx="156" cy="72" rx="6" ry="5" fill="#3a1420" />
      <text x="168" y="46" fontSize="12" fill="#F6EBDD" fontWeight="800">z</text>
      {/* water bottle it refuses to drink */}
      <rect x="140" y="132" width="12" height="26" rx="4" fill="#cfe8f7" stroke="#8fb9d6" strokeWidth="1.5" />
      <rect x="142" y="128" width="8" height="5" rx="1.5" fill="#6aa8d0" />
    </g>
  );
}

export default Boss;
