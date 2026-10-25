import { useState } from 'react';
import { Button, timeAgo } from '../components/ui';
import { useStore, useMe, useIsGroom } from '../store';
import { useTheme } from '../theme';
import { request } from '../net';
import { sfx } from '../audio';
import { WALL_PER_PHASE } from '@shared/engine';

export default function Wall() {
  const party = useStore((s) => s.party);
  const me = useMe();
  const isGroom = useIsGroom();
  const setTab = useStore((s) => s.setTab);
  const toast = useStore((s) => s.toast);
  const th = useTheme(); const book = th.theme.features.wall === 'book';
  const [kind, setKind] = useState<'roast' | 'toast'>(book ? 'toast' : 'roast');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<'top' | 'new'>('top');
  const [confirmHide, setConfirmHide] = useState<string | null>(null); // the bin is permanent: first tap asks, second tap does it
  if (!party || !me) return null;
  const nick = (id: string) => party.players.find((p) => p.id === id)?.nickname ?? '?';
  const posts = [...party.wall].sort((a, b) => sort === 'new' ? b.at - a.at : (b.votes.length + (b.groomLove ? 3 : 0)) - (a.votes.length + (a.groomLove ? 3 : 0)) || b.at - a.at);
  const mineToday = party.wall.filter((w) => w.playerId === me.id && w.phase === party.phase).length;
  const run = async (fn: () => Promise<unknown>, ok?: () => void) => { if (busy) return; setBusy(true); try { await fn(); sfx.select(); ok?.(); } catch (e) { toast((e as Error).message, '⚠️', 'warn'); sfx.error(); } finally { setBusy(false); } };
  const post = () => run(() => request({ type: 'wallPost', kind, text }), () => setText(''));
  return (
    <div className="screen with-nav">
      <div className="topbar"><button className="display title-md" onClick={() => setTab('home')}>‹ {th.t(th.theme.copy.wallTitle)}</button><span className="pill">{mineToday}/{WALL_PER_PHASE} today</span></div>
      {!isGroom && (
        <div className="panel pad stack-6" style={{ marginBottom: 8 }}>
          {!book && <div className="tabs"><button className={`tab ${kind === 'roast' ? 'on' : ''}`} onClick={() => setKind('roast')}>🔥 Roast</button><button className={`tab ${kind === 'toast' ? 'on' : ''}`} onClick={() => setKind('toast')}>🥂 Toast</button></div>}
          <textarea className="input" style={{ minHeight: book ? 96 : 64, padding: 12, fontSize: 16, resize: 'none' }} maxLength={book ? 280 : 140} value={text} onChange={(e) => setText(e.target.value)} placeholder={book ? `Dear ${th.name}…` : kind === 'roast' ? `${th.name} parallel parks like it's a group project…` : `${th.name} is the only one who…`} data-testid="wall-text" />
          <div className="row-between"><span className="tiny faint">{book ? 'Genuine beats clever. It goes on the TV at the end.' : th.t("Roast, don't wound. Nothing {he} wouldn't laugh at in front of {his} mum.")}</span><Button size="sm" disabled={busy || text.trim().length < 6 || mineToday >= 3} onClick={post}>Post +5</Button></div>
        </div>
      )}
      {isGroom && !book && <div className="panel pad small bold" style={{ marginBottom: 8 }}>{th.theme.role.emoji} This is your wall, {th.name}. Tap ❤️ on your favourites (+10 to them) and 🗑️ anything that's too far.</div>}
      {book && <div className="panel pad small" style={{ marginBottom: 8, borderColor: 'var(--gold)' }}>📖 <b>{th.t(th.theme.copy.wallPrompt)}</b> {party.bookOpen ? 'The book is open: everyone can read it now.' : `Entries stay private until the host opens the book on the TV. ${isGroom ? 'No peeking: you see yours only.' : 'Only you can see yours.'}`}</div>}
      <div className="tabs" style={{ marginBottom: 8 }}><button className={`tab ${sort === 'top' ? 'on' : ''}`} onClick={() => setSort('top')}>Top</button><button className={`tab ${sort === 'new' ? 'on' : ''}`} onClick={() => setSort('new')}>New</button></div>
      <div className="screen-body scroll-y stack-6">
        {!posts.length && <div className="panel pad center dim bold">Nothing yet. Someone's gotta go first.</div>}
        {posts.map((w) => {
          const mine = w.playerId === me.id; const voted = w.votes.includes(me.id);
          return (
            <div key={w.id} className={`wall-post wall-${w.kind}`}>
              <div className="bold" style={{ fontSize: 15 }}>"{w.text}"</div>
              <div className="row-between" style={{ marginTop: 6 }}>
                <span className="tiny faint">{book ? '📖' : w.kind === 'roast' ? '🔥' : '🥂'} {nick(w.playerId)} · {timeAgo(w.at)}{w.groomLove ? ` · ❤️ ${th.name} loved it` : ''}</span>
                <span className="row" style={{ gap: 6 }}>
                  {isGroom
                    ? <button className={`react-btn ${w.groomLove ? 'on' : ''}`} disabled={busy || w.groomLove} onClick={() => run(() => request({ type: 'wallVote', postId: w.id }))}>❤️</button>
                    : <button className={`react-btn ${voted ? 'on' : ''}`} disabled={busy || mine || voted} onClick={() => run(() => request({ type: 'wallVote', postId: w.id }))}>😂 {w.votes.length || ''}</button>}
                  {(mine || isGroom || party.hostId === me.id) && (confirmHide === w.id
                    ? <><button className="react-btn" disabled={busy} onClick={() => setConfirmHide(null)} aria-label="Keep it">Keep</button><button className="react-btn on" style={{ color: '#ff8a8a', borderColor: '#ff8a8a' }} disabled={busy} onClick={() => { setConfirmHide(null); run(() => request({ type: 'wallHide', postId: w.id }), () => toast('Taken down for good', '🗑️')); }} aria-label="Take down for good" data-testid="wall-hide-confirm">Bin it</button></>
                    : <button className="react-btn" disabled={busy} onClick={() => { setConfirmHide(w.id); setTimeout(() => setConfirmHide((c) => (c === w.id ? null : c)), 4000); }} aria-label="Take down">🗑️</button>)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
