// Generates docs/MISSIONS.md from the mission library so the list can be reviewed outside the game.
import fs from 'node:fs';
import { MISSIONS, CATEGORY_META, METHOD_META } from '../shared/missions';
const DIFF = ['', 'Easy', 'Spicy', 'Legendary'];
const PHASE = { any: 'Fri + Sat', friday: 'Friday', saturday: 'Saturday' } as const;
let out = `# Project Jezza: Mission List\n\n${MISSIONS.length} missions. Points go to the weekend leaderboard, XP levels up your creature.\n\n`;
out += `Completion methods: **Honour** = tap "I did it" · **Photo** = snap proof, host approves · **Witness** = a mate confirms on their phone · **Host** = host approves.\n\n`;
for (const cat of Object.keys(CATEGORY_META) as (keyof typeof CATEGORY_META)[]) {
  const ms = MISSIONS.filter((m) => m.category === cat);
  out += `## ${CATEGORY_META[cat].emoji} ${CATEGORY_META[cat].label} (${ms.length})\n\n| # | Mission | Instruction | Difficulty | Pts / XP | How | When |\n|---|---|---|---|---|---|---|\n`;
  for (const m of ms) out += `| ${m.id} | **${m.title}**${m.starter ? ' (first mission)' : ''}${m.secret ? ' 🕵️' : ''}${m.scope === 'group' ? ' 🫂 group' : ''} | ${m.instruction} | ${DIFF[m.difficulty]} | ${m.points} / ${m.xp} | ${METHOD_META[m.method].label} | ${PHASE[m.phase]}${m.timeLimitMin ? ` · ${m.timeLimitMin} min` : ''} |\n`;
  out += '\n';
}
fs.writeFileSync('docs/MISSIONS.md', out);
console.log(`wrote docs/MISSIONS.md (${MISSIONS.length} missions)`);
