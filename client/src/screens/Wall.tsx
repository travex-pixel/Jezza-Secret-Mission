import { useState } from 'react';
import { Button, timeAgo } from '../components/ui';
import { useStore, useMe, useIsGroom } from '../store';
import { request } from '../net';
import { sfx } from '../audio';
import { WALL_PER_PHASE } from '@shared/engine';

export default function Wall() {
  const party = useStore((s) => s.party);
  const me = useMe();
  const isGroom = useIsGroom();
  const setTab = useStore((s) => s.setTab);
  const toast = useStore((s) => s.toast);
  const [kind, setKind] = useState<'roast' | 'toast'>('roast');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<'top' | 'new'>('top');
  if (!party || !me) return null;
  const nick = (id: string) => party.players.find((p) => p.id === id)?.nickname ?? '?';
  const posts = [...party.wall].sort((a, b) => sort === 'new' ? b.at - a.at : (b.votes.length + (b.groomLove ? 3 : 0)) - (a.votes.length + (a.groomLove ? 3 : 0)) || b.at - a.at);
  const mineToday = party.wall.filter((w) => w.playerId === me.id && w.phase === party.phase).length;
  const run = async (fn: () => Promise<unknown>, ok?: () => void) => { if (busy) return; setBusy(true); try { await fn(); sfx.select(); ok?.(); } catch (e) { toast((e as Error).message, '⚠️', 'warn'); sfx.error(); } finally { setBusy(false); } };
  const post = () => run(() => request({ type: 'wallPost', kind, text }), () => setText(''));
  return (
    <div className="screen with-nav">
      <div className="topbar"><button className="display title-md" onClick={() => setTab('home')}>‹ The Jezza Wall</button><span className="pill">{mineToday}/{WALL_PER_PHASE} today</span></div>
      {!isGroom && (
        <div className="panel pad stack-6" style={{ marginBottom: 8 }}>
          <div className="tabs"><button className={`tab ${kind === 'roast' ? 'on' : ''}`} onClick={() => setKind('roast')}>🔥 Roast</button><button className={`tab ${kind === 'toast' ? 'on' : ''}`} onClick={() => setKind('toast')}>🥂 Toast</button></div>
          <textarea className="input" style={{ minHeight: 64, padding: 12, fontSize: 16, resize: 'none' }} maxLength={140} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'roast' ? 'Jezza parallel parks like it\'s a group project…' : 'Jezza is the only bloke who…'} />
          <div className="row-between"><span className="tiny faint">Roast, don't wound. Nothing he wouldn't laugh at in front of his mum.</span><Button size="sm" disabled={busy || text.trim().length < 6 || mineToday >= 3} onClick={post}>Post +5</Button></div>
        </div>
      )}
      {isGroom && <div className="panel pad small bold" style={{ marginBottom: 8 }}>🤵 This is your wall, Jezza. Tap ❤️ on your favourites (+10 to them) and 🗑️ anything that's too far.</div>}
      <div className="tabs" style={{ marginBottom: 8 }}><button className={`tab ${sort === 'top' ? 'on' : ''}`} onClick={() => setSort('top')}>Top</button><button className={`tab ${sort === 'new' ? 'on' : ''}`} onClick={() => setSort('new')}>New</button></div>
      <div className="screen-body scroll-y stack-6">
        {!posts.length && <div className="panel pad center dim bold">Nothing yet. Someone's gotta go first.</div>}
        {posts.map((w) => {
          const mine = w.playerId === me.id; const voted = w.votes.includes(me.id);
          return (
            <div key={w.id} className={`wall-post wall-${w.kind}`}>
              <div className="bold" style={{ fontSize: 15 }}>"{w.text}"</div>
              <div className="row-between" style={{ marginTop: 6 }}>
                <span className="tiny faint">{w.kind === 'roast' ? '🔥' : '🥂'} {nick(w.playerId)} · {timeAgo(w.at)}{w.groomLove ? ' · ❤️ Jezza loved it' : ''}</span>
                <span className="row" style={{ gap: 6 }}>
                  {isGroom
                    ? <button className={`react-btn ${w.groomLove ? 'on' : ''}`} disabled={busy || w.groomLove} onClick={() => run(() => request({ type: 'wallVote', postId: w.id }))}>❤️</button>
                    : <button className={`react-btn ${voted ? 'on' : ''}`} disabled={busy || mine || voted} onClick={() => run(() => request({ type: 'wallVote', postId: w.id }))}>😂 {w.votes.length || ''}</button>}
                  {(mine || isGroom || party.hostId === me.id) && <button className="react-btn" disabled={busy} onClick={() => run(() => request({ type: 'wallHide', postId: w.id }), () => toast('Taken down', '🗑️'))} aria-label="Take down">🗑️</button>}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
