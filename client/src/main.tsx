import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Game } from './game.js';
import { Join } from './join.js';
import { net, type NetState } from './net.js';
import { IconFlame } from './icons.js';
import { T } from './strings.js';
import './styles.css';

function App() {
  const [s, setS] = useState<NetState>(net.state);
  useEffect(() => net.subscribe(setS), []);
  useEffect(() => net.connect(), []);

  if (s.phase === 'game' && s.view) return <Game s={s} />;
  if (s.phase === 'auth') return <Join s={s} />;
  return (
    <div class="join">
      <div class="join-card">
        <IconFlame class="logo-mark" />
        <h1 class="logo">{T.title}</h1>
        <p class="muted center">{s.connected ? T.loading : T.reconnecting}</p>
      </div>
    </div>
  );
}

render(<App />, document.getElementById('app')!);
