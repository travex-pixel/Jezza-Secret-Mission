#!/usr/bin/env node
// Weekend usage report from a state.json: who played, when, what they used. Prints a text report; never prints
// identities (device keys), photos or anything you'd not paste into a chat.
//   node scripts/weekend-stats.mjs /path/to/state.json [PARTY_CODE] [--anon] [--tz=Australia/Sydney]
import fs from 'node:fs';
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && a.endsWith('.json'));
const codeArg = args.find((a) => !a.startsWith('--') && /^[A-Z0-9]{4,6}$/i.test(a));
const anon = args.includes('--anon');
const tz = (args.find((a) => a.startsWith('--tz=')) ?? '--tz=Australia/Sydney').slice(5);
if (!file) { console.error('usage: node scripts/weekend-stats.mjs state.json [CODE] [--anon]'); process.exit(1); }
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const parties = Object.values(state.parties ?? {});
const party = codeArg ? state.parties[codeArg.toUpperCase()] : parties.sort((a, b) => Object.keys(b.players).length - Object.keys(a.players).length)[0];
if (!party) { console.error('no party found'); process.exit(1); }
const players = Object.values(party.players).filter((p) => !p.removed);
const names = new Map(players.map((p, i) => [p.id, anon ? `Lad ${String.fromCharCode(65 + i)}` : p.nickname]));
const nm = (id) => names.get(id) ?? '?';
const fmt = (t) => new Date(t).toLocaleString('en-AU', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit' });
const hourKey = (t) => new Date(t).toLocaleString('en-AU', { timeZone: tz, weekday: 'short', hour: 'numeric' });
const pct = (n, d) => d ? `${Math.round((n / d) * 100)}%` : '–';
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const log = party.log?.length ? party.log : party.feed ?? [];
const claims = Object.values(party.claims ?? {});
const battles = Object.values(party.battles ?? {});
const lines = [];
const h = (t) => lines.push('', `== ${t} ==`);
lines.push(`PROJECT JEZZA · weekend report · party ${party.code} · phase ${party.phase} · created ${fmt(party.createdAt)}`);

h('Players');
lines.push(`${players.length} players (${Object.values(party.players).length - players.length} removed), ${players.filter((p) => p.creature).length} adopted a creature, ${players.filter((p) => p.avatarUrl).length} took the selfie`);
lines.push(`joined on: ${['friday', 'saturday'].map((ph) => `${ph} ${players.filter((p) => (p.joinedPhase ?? 'friday') === ph).length}`).join(', ')}`);
const active = (p, from, to) => log.some((f) => f.playerId === p.id && f.at >= from && f.at < to);
const first = Math.min(...players.map((p) => p.joinedAt)); const last = Math.max(...log.map((f) => f.at), ...players.map((p) => p.lastSeen ?? 0));
const dayMs = 86_400_000;
for (let d = first; d < last; d += dayMs) lines.push(`active ${new Date(d).toLocaleDateString('en-AU', { timeZone: tz, weekday: 'long' })}: ${players.filter((p) => active(p, d, d + dayMs)).length}/${players.length}`);
lines.push(`last seen: ${players.map((p) => `${nm(p.id)} ${fmt(p.lastSeen ?? p.joinedAt)}`).join(' · ')}`);

h('Ladder');
[...players].sort((a, b) => b.points - a.points).forEach((p, i) => lines.push(`${String(i + 1).padStart(2)}. ${nm(p.id).padEnd(14)} ${String(p.points).padStart(5)} pts  Lv${String(p.level).padStart(2)}  ${String(p.missionsCompleted).padStart(3)} challenges  ${String(p.wins).padStart(2)}W ${String(p.losses).padStart(2)}L  ${String(p.laughs ?? 0).padStart(3)}😂  drops ${(p.drops ?? []).length}  quests ${(p.quests ?? []).filter((q) => q.done).length}/${(p.quests ?? []).length}  oly ${p.olympics ?? 0}`));
lines.push(`median points ${med(players.map((p) => p.points))}, median challenges ${med(players.map((p) => p.missionsCompleted))}, median level ${med(players.map((p) => p.level))}`);

h('What got used (counts)');
const kinds = log.reduce((o, f) => { o[f.kind] = (o[f.kind] ?? 0) + 1; return o; }, {});
lines.push(`feed lines: ${log.length} · by kind: ${Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`);
const approved = claims.filter((c) => c.status === 'approved'); const photos = claims.filter((c) => c.photoUrl);
lines.push(`challenges: ${claims.length} claimed, ${approved.length} approved, ${claims.filter((c) => c.status === 'rejected').length} binned, ${claims.filter((c) => c.status === 'disputed').length} disputed · ${photos.length} with a photo`);
const cats = approved.reduce((o, c) => { const m = c.missionId; o[m] = (o[m] ?? 0) + 1; return o; }, {});
lines.push(`most done challenges: ${Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([m, n]) => `${m}×${n}`).join(', ')}`);
const catCounts = players.reduce((o, p) => { for (const [k, v] of Object.entries(p.categoryCounts ?? {})) o[k] = (o[k] ?? 0) + v; return o; }, {});
lines.push(`by category: ${Object.entries(catCounts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`);
const real = battles.filter((b) => !b.auto); const auto = battles.filter((b) => b.auto);
lines.push(`battles: ${real.length} lad-vs-lad (${real.filter((b) => b.quick).length} quick, ${real.filter((b) => b.status === 'declined' || b.status === 'expired').length} declined/expired) + ${auto.length} auto · endings: ${Object.entries(real.reduce((o, b) => { if (b.reason) o[b.reason] = (o[b.reason] ?? 0) + 1; return o; }, {})).map(([k, n]) => `${k} ${n}`).join(', ')}`);
lines.push(`raids: ${(party.raids ?? []).length} (${(party.raids ?? []).filter((r) => r.status === 'won').length} won) · hits ${sum((party.raids ?? []).map((r) => (r.log ?? []).length))}`);
lines.push(`wall: ${(party.wall ?? []).length} posts (${(party.wall ?? []).filter((w) => w.kind === 'roast').length} roasts) with ${sum((party.wall ?? []).map((w) => (w.votes ?? []).length))} 😂 · cellar: ${(party.cellar ?? []).length} reviews`);
const drops = players.flatMap((p) => p.drops ?? []);
lines.push(`lucky drops: ${drops.length} earned, ${drops.filter((d) => d.opened).length} opened · ${['common', 'rare', 'epic', 'legendary'].map((r) => `${r} ${drops.filter((d) => d.rarity === r).length}`).join(', ')} · by source ${Object.entries(drops.reduce((o, d) => { o[d.source] = (o[d.source] ?? 0) + 1; return o; }, {})).map(([k, n]) => `${k} ${n}`).join(', ')}`);
lines.push(`quests: ${sum(players.map((p) => (p.quests ?? []).filter((q) => q.done).length))} done of ${sum(players.map((p) => (p.quests ?? []).length))} · mole: ${party.mole ? `${party.mole.moles?.length ?? 1} mole(s), ${Object.keys(party.mole.votes ?? {}).length} voters, ${party.mole.revealed ? 'revealed' : 'not revealed'}, missions done ${sum((party.mole.moles ?? []).map((m) => m.missions.filter((x) => x.done).length))}` : 'none'}`);
lines.push(`rowdy rounds run: ${sum(Object.values(party.rowdyUsed ?? {}).map((x) => x.length))} · olympics events locked: ${(party.olympics?.done ?? []).length} (${(party.olympics?.done ?? []).map((e) => e.name).join(', ')}) · spotlight ${party.spotlight ? (party.spotlight.startedAt ? 'ran' : 'scheduled only') : 'not used'} · ceremony reveals ${party.ceremony ?? 0}`);
lines.push(`giveaways ${(party.giveaways ?? []).length}, codes ${(party.codes ?? []).length}, epics ${(party.epics ?? []).length}, group challenges revealed ${(party.revealedGroupMissions ?? []).length}`);
lines.push(`reactions given: ${sum(players.map((p) => p.reactionsGiven ?? 0))} · witnesses confirmed: ${sum(players.map((p) => p.witnessed ?? 0))}`);

h('When (feed lines per hour, local time)');
const byHour = log.reduce((o, f) => { const k = hourKey(f.at); o[k] = (o[k] ?? 0) + 1; return o; }, {});
const peak = Math.max(...Object.values(byHour));
for (const [k, n] of Object.entries(byHour)) lines.push(`${k.padEnd(12)} ${'█'.repeat(Math.round((n / peak) * 40)).padEnd(40)} ${n}`);

h('Engagement spread');
const perLad = players.map((p) => log.filter((f) => f.playerId === p.id).length).sort((a, b) => b - a);
lines.push(`feed lines per lad: top ${perLad[0]}, median ${med(perLad)}, bottom ${perLad[perLad.length - 1]} · top 3 lads = ${pct(sum(perLad.slice(0, 3)), sum(perLad))} of all activity`);
lines.push(`lads with 0 challenges: ${players.filter((p) => !p.missionsCompleted).length} · with 0 fights: ${players.filter((p) => !p.wins && !p.losses).length} · never opened a drop: ${players.filter((p) => (p.drops ?? []).length && !(p.drops ?? []).some((d) => d.opened)).length}`);

// ---- Which challenges flopped, and did the fight choices matter? (added after the lads' feedback) ----
h('Challenges nobody would do');
let deck = [];
try {
  const src = fs.readFileSync(new URL('../shared/missions.ts', import.meta.url), 'utf8');
  for (const line of src.split('\n')) {
    const id = line.match(/id: '(\w+)'/); const title = line.match(/title: '((?:[^'\\]|\\.)*)'/);
    if (!id || !title || /retired: true|theme: 'birthday'|tutorial: true|scope: 'group'/.test(line)) continue;
    deck.push({ id: id[1], title: title[1].replace(/\\'/g, "'").replace(/\{name\}/g, party.honourName ?? 'Jezza') });
  }
} catch { lines.push('(could not read shared/missions.ts for titles)'); }
const titleOf = (id) => deck.find((d) => d.id === id)?.title ?? id;
const doneBy = new Map(); for (const c of approved) doneBy.set(c.missionId, (doneBy.get(c.missionId) ?? 0) + 1);
// "left untouched": still sitting active in someone's hand at the end of the party
const stuck = new Map(); for (const p of players) for (const x of p.hand ?? []) if (x.status === 'active') stuck.set(x.missionId, (stuck.get(x.missionId) ?? 0) + 1);
const flops = [...stuck.entries()].filter(([id]) => !doneBy.get(id) && deck.some((d) => d.id === id)).sort((a, b) => b[1] - a[1]);
lines.push(`left sitting in hands at the end and done by nobody (${flops.length}):`);
for (const [id, n] of flops.slice(0, 20)) lines.push(`  ${titleOf(id)} — in ${n} hand${n === 1 ? '' : 's'}, done 0`);
const never = deck.filter((d) => !doneBy.get(d.id) && !stuck.get(d.id));
lines.push(`never done and never seen at the end (${never.length} of ${deck.length} in the deck; most were probably swapped away): ${never.slice(0, 40).map((d) => d.title).join(' · ')}`);
const best = [...doneBy.entries()].filter(([id]) => deck.some((d) => d.id === id)).sort((a, b) => b[1] - a[1]).slice(0, 12);
lines.push(`most done (for contrast): ${best.map(([id, n]) => `${titleOf(id)} ×${n}`).join(' · ')}`);

h('Did the fight choices matter?');
const quick = real.filter((b) => b.quick && b.status === 'finished' && b.winnerId);
const sideOf = (b, id) => (b.challengerId === id ? b.a : b.b);
const planStats = {}; const tapStats = {}; let lvlWins = 0; let lvlFights = 0; let defaulted = 0;
for (const b of quick) for (const id of [b.challengerId, b.opponentId]) {
  const s = sideOf(b, id); const won = b.winnerId === id; const plan = s.plan ?? 'none';
  planStats[plan] ??= { n: 0, w: 0 }; planStats[plan].n++; if (won) planStats[plan].w++;
  const tap = s.charge ?? 'none'; tapStats[tap] ??= { n: 0, w: 0 }; tapStats[tap].n++; if (won) tapStats[tap].w++;
  if (!s.charge) defaulted++;
}
for (const b of quick) { const la = b.a.maxHp ?? 0; const lb = b.b.maxHp ?? 0; // max HP grows with level, so it stands in for strength
   if (la !== lb) { lvlFights++; if ((la > lb ? b.challengerId : b.opponentId) === b.winnerId) lvlWins++; } }
const wr = (o) => Object.entries(o).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${k} picked ${v.n}× won ${pct(v.w, v.n)}`).join(' · ');
lines.push(`quick fights finished: ${quick.length}`);
lines.push(`game plan: ${wr(planStats)}`);
lines.push(`power tap: ${wr(tapStats)} · sides with no tap (timer ran out): ${defaulted}`);
lines.push(`stronger creature (more max HP) won ${pct(lvlWins, lvlFights)} of ${lvlFights} uneven fights`);
console.log(lines.join('\n'));
