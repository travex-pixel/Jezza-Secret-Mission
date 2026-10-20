// One plain-text message listing every challenge by action, for pasting into a group chat to review and edit.
import fs from 'node:fs';
import { ACTIVE_MISSIONS as MISSIONS } from '../shared/missions';
import { EPIC_PRESETS } from '../shared/epics';
const sections: [string, (m: (typeof MISSIONS)[number]) => boolean][] = [
  ['THE INTRO (first 30 seconds)', (m) => !!m.tutorial],
  ['JEZZA LORE', (m) => m.category === 'lore'],
  ['MAKE JEZZA LAUGH', (m) => m.category === 'laugh' && !m.tutorial],
  ['PHOTOS', (m) => m.category === 'photo' && !m.tutorial],
  ['GET JEZZA INVOLVED', (m) => m.category === 'jezza'],
  ['CHEERS', (m) => m.category === 'cheers' && !m.tutorial],
  ['SNEAKY', (m) => m.category === 'sneaky'],
  ['CHILL', (m) => m.category === 'chill'],
  ['WHOLE GROUP', (m) => m.category === 'group'],
];
const line = (id: string, title: string, what: string) => `${id} ${title}: ${what}`;
const out = [
  'JEZZA CHALLENGES (reply with the code to change one, e.g. "d07 delete" or "l03 make it 20 sec")',
  ...sections.filter(([, f]) => MISSIONS.some(f)).map(([h, f]) => `\n${h}\n` + MISSIONS.filter(f).map((m) => line(m.id, `${m.method === 'photo' ? '📸 ' : ''}${m.title}`, m.instruction)).join('\n')),
  '\nJOBS (host posts, first in)\n' + EPIC_PRESETS.map((e) => line(e.id, e.title, `${e.instruction} (${e.min === e.max ? e.max : `${e.min}-${e.max}`})`)).join('\n'),
].join('\n');
fs.writeFileSync('docs/CHALLENGES-MESSENGER.txt', out + '\n');
console.log(out.length, 'chars');
