// Renders every creature wearing the EPIC and cheat-code items to test-results/items.html for a visual check.
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import { Creature } from '../client/src/components/Creature';
import { CREATURE_IDS } from '../shared/creatures';
const looks = [
  { hat: 'hat_chef' }, { hat: 'hat_cap' }, { cape: 'cape_apron' }, { face: 'face_headphones' }, { cape: 'cape_hivis' },
  { hat: 'hat_esky' }, { face: 'face_mo' }, { hat: 'hat_viking' }, { aura: 'aura_clean' }, { aura: 'aura_epic' }, { aura: 'aura_rainbow' },
];
const css = fs.readFileSync('client/src/styles/global.css', 'utf8');
const rows = CREATURE_IDS.map((c) => `<div class="r">${looks.map((eq) => `<div class="c">${renderToStaticMarkup(<Creature creature={c} level={1} equipped={{ colorway: 0, ...eq }} />)}<small>${Object.values(eq)[0]}</small></div>`).join('')}</div>`).join('');
fs.writeFileSync('test-results/items.html', `<!doctype html><meta charset="utf-8"><style>${css} body{background:#1d1820;color:#ddd;font:10px sans-serif;margin:0;padding:6px} .r{display:flex} .c{width:96px;text-align:center} .creature{width:92px} .creature *{animation:none!important}</style>${rows}`);
console.log('wrote test-results/items.html');
