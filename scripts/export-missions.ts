// Generates docs/MISSIONS.md from the mission library so the list can be reviewed outside the game.
import fs from 'node:fs';
import { MISSIONS, CATEGORY_META, METHOD_META } from '../shared/missions';
const DIFF = ['', 'Easy', 'Spicy', 'Legendary'];
const PHASE = { any: 'Fri + Sat', friday: 'Friday', saturday: 'Saturday' } as const;
let out = `# Project Jezza: Challenge List\n\n${MISSIONS.length} missions. Points go to the weekend leaderboard, XP levels up your creature.\n\n`;
out += `How they're checked: **Honour system** = tap "I did it" (one every 8 minutes) · **Needs a photo** = take a photo or pick one from your library; by default the lads vote it in (two 👍), or the host can switch to approving them or to instant · **A mate confirms** = a mate who was there taps yes on their phone. Mates can 🚩 Call BS on anything. Nobody ever has to drink: any drink counts, water included.\n\nNew players: the first challenge is a selfie (counts straight away, Level 2 on the spot), then a **rookie boost** on the next 3: easy ones only, double XP, photos count without waiting for votes, no honour cooldown. Every hand always has at least one photo challenge.\n\n`;
for (const cat of Object.keys(CATEGORY_META) as (keyof typeof CATEGORY_META)[]) {
  const ms = MISSIONS.filter((m) => m.category === cat);
  out += `## ${CATEGORY_META[cat].emoji} ${CATEGORY_META[cat].label} (${ms.length})\n\n| # | Mission | Instruction | Difficulty | Pts / XP | How | When |\n|---|---|---|---|---|---|---|\n`;
  for (const m of ms) out += `| ${m.id} | **${m.title}**${m.starter ? ' (first mission)' : ''}${m.secret ? ' 🕵️' : ''}${m.scope === 'group' ? ' 🫂 group' : ''} | ${m.instruction} | ${DIFF[m.difficulty]} | ${m.points} / ${m.xp} | ${METHOD_META[m.method].label} | ${PHASE[m.phase]}${m.loud ? ' · performing' : ''} |\n`;
  out += '\n';
}
fs.writeFileSync('docs/MISSIONS.md', out);
console.log(`wrote docs/MISSIONS.md (${MISSIONS.length} missions)`);
