import { useEffect } from 'react';
import { useStore, useMe } from './store';
import { connect } from './net';
import Opening from './screens/Opening';
import Join from './screens/Join';
import ChooseCreature from './screens/ChooseCreature';
import Reveal from './screens/Reveal';
import FirstMission from './screens/FirstMission';
import Home from './screens/Home';
import Missions from './screens/Missions';
import Profile from './screens/Profile';
import BattleScreen from './screens/Battle';
import Ranks from './screens/Ranks';
import Party from './screens/Party';
import Host from './screens/Host';
import Raid from './screens/Raid';
import Wall from './screens/Wall';
import Cellar from './screens/Cellar';
import Gallery from './screens/Gallery';
import TV from './screens/TV';
import { BottomNav, RewardOverlay, Toasts } from './components/ui';
import IncomingChallenge from './components/IncomingChallenge';
import AwaySummary, { useAwayAutoOpen } from './components/AwaySummary';
import ReplayOverlay from './battle/Replay';
import { GlobalPhotoViewer } from './components/PhotoViewer';

// …/?tv=CODE: the read-only TV page, no login (a smart TV's browser, or a laptop on the HDMI)
const TV_CODE = (() => { const c = new URLSearchParams(location.search).get('tv'); return c && /^[A-Z0-9]{4,6}$/i.test(c) ? c.toUpperCase() : null; })();

export default function App() {
  const flow = useStore((s) => s.flow);
  const tab = useStore((s) => s.tab);
  const party = useStore((s) => s.party);
  const me = useMe();
  useEffect(() => { if (!TV_CODE) connect(); }, []);
  useAwayAutoOpen();
  // Guard: if we lose party membership mid-game, bounce to join.
  useEffect(() => { if (flow === 'main' && party && !me) useStore.getState().setFlow('join'); }, [flow, party, me]);

  if (TV_CODE) return <TV code={TV_CODE} />;
  let screen: React.ReactNode;
  if (flow === 'opening') screen = <Opening />;
  else if (flow === 'join' || !party || !me) screen = <Join />;
  else if (flow === 'choose' || !me.creature) screen = <ChooseCreature />;
  else if (flow === 'reveal') screen = <Reveal />;
  else if (flow === 'firstMission') screen = <FirstMission />;
  else {
    switch (tab) {
      case 'missions': screen = <Missions />; break;
      case 'battle': screen = <BattleScreen />; break;
      case 'ranks': screen = <Ranks />; break;
      case 'party': screen = <Party />; break;
      case 'profile': screen = <Profile />; break;
      case 'host': screen = <Host />; break;
      case 'raid': screen = <Raid />; break;
      case 'wall': screen = <Wall />; break;
      case 'cellar': screen = <Cellar />; break;
      case 'gallery': screen = <Gallery />; break;
      case 'tv': screen = <TV />; break;
      default: screen = <Home />;
    }
  }
  const showNav = flow === 'main' && !!party && !!me?.creature && tab !== 'tv'; // TV mode is the whole screen
  return (
    <div className="app">
      {screen}
      {showNav && <BottomNav />}
      {showNav && <IncomingChallenge />}
      {showNav && <AwaySummary />}
      {showNav && <ReplayOverlay />}
      {showNav && <GlobalPhotoViewer />}
      <Toasts />
      <RewardOverlay />
    </div>
  );
}
