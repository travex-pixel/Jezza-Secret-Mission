// One plain-text message listing every challenge by action, for pasting into a group chat to review and edit.
import fs from 'node:fs';
import { MISSIONS } from '../shared/missions';
import { EPIC_PRESETS } from '../shared/epics';
const sections: [string, (m: (typeof MISSIONS)[number]) => boolean][] = [
  ['MAKE JEZZA LAUGH', (m) => m.category === 'laugh'],
  ['DANCE', (m) => m.category === 'dance'],
  ['SING', (m) => m.category === 'sing'],
  ['PHOTOS', (m) => m.category === 'photo'],
  ['GET JEZZA INVOLVED', (m) => m.category === 'jezza'],
  ['CHEERS', (m) => m.category === 'cheers'],
  ['SNEAKY', (m) => m.category === 'sneaky'],
  ['CHILL', (m) => m.category === 'chill'],
  ['WHOLE GROUP', (m) => m.category === 'group'],
];
const line = (id: string, title: string, what: string) => `${id} ${title}: ${what}`;
const out = [
  'JEZZA CHALLENGES (reply with the code to change one, e.g. "d07 delete" or "l03 make it 20 sec")',
  ...sections.map(([h, f]) => `\n${h}\n` + MISSIONS.filter(f).map((m) => line(m.id, m.title, m.instruction)).join('\n')),
  '\nJOBS (host posts, first in)\n' + EPIC_PRESETS.map((e) => line(e.id, e.title, `${e.instruction} (${e.min === e.max ? e.max : `${e.min}-${e.max}`})`)).join('\n'),
].join('\n');
fs.writeFileSync('docs/CHALLENGES-MESSENGER.txt', out + '\n');
console.log(out.length, 'chars');
