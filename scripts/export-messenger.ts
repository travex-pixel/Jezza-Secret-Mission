// Plain-text challenge list for pasting into a group chat (Messenger, WhatsApp). Splits into parts that fit one message.
import fs from 'node:fs';
import { MISSIONS, CATEGORY_META } from '../shared/missions';
import { EPIC_PRESETS, EPIC_TIERS } from '../shared/epics';
const CHECK: Record<string, string> = { self: '✅', photo: '📸', witness: '👀', host: '👑' };
const WHEN: Record<string, string> = { any: '', friday: ' (Fri only)', saturday: ' (Sat only)' };
const order = ['laugh', 'dance', 'sing', 'photo', 'jezza', 'cheers', 'sneaky', 'chill', 'group'] as const;
const parts: string[] = [];
parts.push(`PROJECT JEZZA: CHALLENGE LIST\nReply with the code to change one, e.g. "l03: make it 20 seconds" or "delete d07".\n✅ = honour system · 📸 = photo · 👀 = a mate confirms · 🎭 = performing (hidden in Low-key mode)\n\n⭐ STARTER (everyone does this first)\n${MISSIONS.filter((m) => m.starter).map((m) => `m001 · ${m.title} (${m.points}) ${CHECK[m.method]}\n${m.instruction}`).join('\n')}`);
for (const c of order) {
  const ms = MISSIONS.filter((m) => m.category === c && !m.starter);
  const meta = CATEGORY_META[c];
  parts.push(`${meta.emoji} ${meta.label.toUpperCase()}${c === 'sneaky' ? ' (secret)' : c === 'group' ? ' (whole group)' : ''}\n` + ms.map((m) => `${m.id} · ${m.title} (${m.points}) ${CHECK[m.method]}${m.loud ? '🎭' : ''}${WHEN[m.phase]}\n${m.instruction}`).join('\n\n'));
}
const groups = ['Dinner', 'Brekkie', 'Runs', 'Crew'] as const;
parts.push(`🟣 EPIC JOBS (host posts, first in get the spots)\nSmall 15 · Medium 25 · Big 40 · Legend 60 pts each\n\n` + groups.map((g) => `${g.toUpperCase()}\n` + EPIC_PRESETS.filter((e) => e.group === g).map((e) => `${e.id} · ${e.emoji} ${e.title} (${EPIC_TIERS[e.tier].points}, ${e.min === e.max ? e.max : `${e.min}-${e.max}`} lad${e.max === 1 ? '' : 's'})\n${e.instruction}`).join('\n\n')).join('\n\n'));
// pack sections into messages under ~4500 characters
const msgs: string[] = []; let cur = '';
for (const p of parts) { if (cur && (cur + '\n\n' + p).length > 4500) { msgs.push(cur); cur = p; } else cur = cur ? cur + '\n\n' + p : p; }
if (cur) msgs.push(cur);
const out = msgs.map((m, i) => `===== MESSAGE ${i + 1} of ${msgs.length} =====\n${m}`).join('\n\n\n');
fs.writeFileSync('docs/CHALLENGES-MESSENGER.txt', out + '\n');
console.log(msgs.map((m, i) => `msg ${i + 1}: ${m.length} chars`).join('\n'));
