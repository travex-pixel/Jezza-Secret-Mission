// Plain-English "how does this work" for new (or confused) players. Short on the first-challenge screen,
// fuller in the ❓ sheet on the Lobby.
import { Button, Sheet } from './ui';

const BASICS = [
  { ico: '🎯', text: <><b>Do challenges in real life</b>, then tap the button on them. You always have 3 on the Challenges tab.</> },
  { ico: '🏆', text: <><b>Challenges give points.</b> Most points at the end of the weekend wins.</> },
  { ico: '🐉', text: <><b>They also give XP</b>, which levels up your creature until it evolves.</> },
];
const MORE = [
  { ico: '✅', text: <>Some challenges just need a tap. Some need a <b>photo</b> (the lads vote it in) or <b>a mate who saw it</b> to confirm.</> },
  { ico: '🟣', text: <><b>EPIC jobs</b> are real chores (cooking, food runs, the esky). Tap "I'm on it" to grab one for big points.</> },
  { ico: '⚔️', text: <><b>Battles are optional.</b> Fight a mate for bonus points: pick a plan, one tap, watch 10 seconds. Your creature also fights on its own while you're away.</> },
  { ico: '👹', text: <><b>Boss raids</b> pop up now and then. Tap the banner and hit it: everyone who hits gets loot.</> },
  { ico: '🎤', text: <><b>The Jezza Wall</b> is for roasts and toasts. Jezza hearts his favourites.</> },
  { ico: '📵', text: <><b>Phone down.</b> No need to stare at it. Check in when you've done something.</> },
];

const Row = ({ ico, text }: { ico: string; text: React.ReactNode }) => (
  <div className="row" style={{ gap: 10, alignItems: 'flex-start', textAlign: 'left' }}><span style={{ fontSize: 20, lineHeight: 1.2 }}>{ico}</span><span className="small" style={{ lineHeight: 1.35 }}>{text}</span></div>
);

export function HowItWorksBasics() {
  return <div className="panel pad stack-6">{BASICS.map((r) => <Row key={r.ico} {...r} />)}</div>;
}

export default function HowItWorksSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet onClose={onClose}>
      <div className="stack-10" data-testid="how-it-works">
        <div className="display title-md center">How it works</div>
        <div className="stack-10" style={{ maxHeight: '62vh', overflowY: 'auto' }}>{[...BASICS, ...MORE].map((r) => <Row key={r.ico} {...r} />)}</div>
        <Button onClick={onClose}>Got it</Button>
      </div>
    </Sheet>
  );
}
