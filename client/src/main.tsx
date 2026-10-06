import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Game } from './game.js';
import { Join } from './join.js';
import { net, type NetState } from './net.js';
import { T } from './strings.js';
import '@fontsource/literata/cyrillic-400.css';
import '@fontsource/literata/latin-400.css';
import '@fontsource/literata/cyrillic-400-italic.css';
import '@fontsource/literata/latin-400-italic.css';
import '@fontsource/literata/cyrillic-600.css';
import '@fontsource/literata/latin-600.css';
import '@fontsource/literata/cyrillic-700.css';
import '@fontsource/literata/latin-700.css';
import '@fontsource/commissioner/cyrillic-400.css';
import '@fontsource/commissioner/latin-400.css';
import '@fontsource/commissioner/cyrillic-500.css';
import '@fontsource/commissioner/latin-500.css';
import '@fontsource/commissioner/cyrillic-600.css';
import '@fontsource/commissioner/latin-600.css';
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
        <h1 class="logo">{T.title}</h1>
        <p class="muted center">{s.connected ? T.loading : T.reconnecting}</p>
      </div>
    </div>
  );
}

render(<App />, document.getElementById('app')!);
