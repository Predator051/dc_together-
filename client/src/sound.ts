// Sound: synthesized in the browser with Web Audio — no recordings, no downloads.
// A quiet bed for the place (wind, river, cave), the fire's crackle, and a short sound for every
// action, in step with its visual accent. Materials are modelled, not beeped: wood and iron ring
// with their own sets of partials, a bowstring is a plucked string, snow crunches in grains.
// Starts on the first tap (browsers forbid sound before that), pauses with the tab, and can be
// switched off; the choice is remembered on this device.
import type { AmbientView } from '../../shared/src/protocol.js';

type Fx = NonNullable<AmbientView['fx']>;
type Kind = AmbientView['kind'];

const KEY = 'bezgomin.sound';
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

/** Partials (frequency ratio, relative gain, relative decay) of struck materials. */
const WOOD = [
  [1, 1, 1],
  [2.32, 0.45, 0.55],
  [3.9, 0.22, 0.35],
] as const;
const IRON = [
  [1, 1, 1],
  [2.76, 0.55, 0.7],
  [5.4, 0.35, 0.45],
  [8.93, 0.18, 0.3],
] as const;
const STONE = [
  [1, 1, 1],
  [1.7, 0.6, 0.6],
  [2.9, 0.3, 0.4],
] as const;

/**
 * Level trims, measured: each accent is rendered offline and its loudest 100 ms is brought to a
 * target (knocks and blows a little above the place's bed, rustles and breaths just above it).
 */
const TRIM: Record<Fx, number> = {
  fire: 2.0,
  flint: 6.5,
  forge: 1.4,
  whet: 5.5,
  chop: 2.7,
  water: 4.2,
  fish: 3.8,
  row: 5.8,
  steam: 4.0,
  walk: 1.7,
  twigs: 1.75,
  snare: 1.7,
  send: 1.3,
  arrow: 0.85,
  string: 0.9,
  carve: 6.5,
  rope: 2.1,
  build: 1.0,
  rubble: 1.5,
  scrap: 1.15,
  sift: 2.0,
  rummage: 1.35,
  bowl: 3.5,
  salt: 3.8,
  wax: 10,
  hive: 2.3,
  trade: 3.0,
  care: 4.0,
  breath: 5.4,
  heart: 0.75,
};

function loadOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

interface Bed {
  out: GainNode;
  stop: () => void;
}

type Mood = 'hearth' | 'fight' | 'story' | 'deep' | null;
type SoundState = AmbientView & { scene: boolean; mood: Mood; dusk: number };

class Sound {
  on = loadOn();
  private ctx: BaseAudioContext | null = null;
  private master!: GainNode;
  private bedBus!: GainNode;
  private fxBus!: GainNode;
  private noise!: AudioBuffer;
  private plucks = new Map<number, AudioBuffer>();
  private bed: Bed | null = null;
  private fireBed: Bed | null = null;
  private hiss: Bed | null = null;
  private state: SoundState = { kind: 'snow', fire: 'none', fx: null, partnerFx: null, fxUntil: 0, partnerFxUntil: 0, scene: false, mood: null, dusk: 0 };
  private moodBed: Bed | null = null;
  private moodKind: Mood = null;
  private bedKind: string | null = null;
  private fireKind: string | null = null;
  private listeners = new Set<() => void>();

  constructor() {
    const unlock = () => {
      if (this.on) this.start();
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    document.addEventListener('visibilitychange', () => {
      const ctx = this.live();
      if (!ctx) return;
      if (document.hidden) void ctx.suspend();
      else if (this.on) void ctx.resume();
    });
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  toggle(): void {
    this.on = !this.on;
    try {
      localStorage.setItem(KEY, this.on ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    if (this.on) this.start();
    else if (this.ctx) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      window.setTimeout(() => {
        if (!this.on) void this.live()?.suspend();
      }, 400);
    }
    for (const fn of this.listeners) fn();
  }

  /** The place, its fire and continuous accents. */
  set(s: SoundState): void {
    this.state = s;
    if (this.ctx && this.on) this.apply();
  }

  /** One beat of an action's accent (called in step with its particles). */
  beat(fx: Fx, mate: boolean): void {
    if (!this.ctx || !this.on || this.ctx.state !== 'running') return;
    this.play(fx, mate ? 0.5 : -0.15, mate ? 0.45 : 1);
  }

  /** The partner calls: two soft knocks on wood. */
  call(): void {
    if (!this.ctx || !this.on || this.ctx.state !== 'running') return;
    this.knock({ f: 210, gain: 0.3, pan: 0.3, decay: 0.18 });
    this.knock({ f: 205, gain: 0.26, pan: 0.3, decay: 0.18, at: 0.22 });
  }

  private live(): AudioContext | null {
    return this.ctx && 'resume' in this.ctx && !(this.ctx instanceof OfflineAudioContext) ? (this.ctx as AudioContext) : null;
  }

  // ---------- setup ----------
  private start(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.init(new AC());
    }
    const ctx = this.live()!;
    void ctx.resume().then(() => {
      this.master.gain.setTargetAtTime(0.7, ctx.currentTime, 0.4);
      this.apply();
    });
  }

  /** Builds the mixing graph on a context (a live one, or an offline one for measuring levels). */
  private init(ctx: BaseAudioContext): void {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp);
    this.bedBus = ctx.createGain();
    this.bedBus.connect(this.master);
    this.fxBus = ctx.createGain();
    this.fxBus.gain.value = 1.6;
    this.fxBus.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private apply(): void {
    const ctx = this.ctx!;
    const s = this.state;
    // a scene quiets the place; evening quiets it a little more
    this.bedBus.gain.setTargetAtTime((s.scene ? 0.55 : 1) * (1 - s.dusk * 0.3), ctx.currentTime, 0.8);
    const mood = s.scene ? s.mood : null;
    if (mood !== this.moodKind) {
      this.fadeOut(this.moodBed);
      this.moodBed = mood ? this.makeMood(mood) : null;
      this.moodKind = mood;
    }

    const bedKind = s.kind;
    if (bedKind !== this.bedKind) {
      this.fadeOut(this.bed);
      this.bed = this.makeBed(bedKind);
      this.bedKind = bedKind;
    }
    const fireKind = s.fire === 'warm' || s.fire === 'low' ? s.fire : 'none';
    if (fireKind !== this.fireKind) {
      this.fadeOut(this.fireBed);
      this.fireBed = fireKind === 'none' ? null : this.makeFire(fireKind === 'warm' ? 1 : 0.45);
      this.fireKind = fireKind;
    }
    const steaming = s.fx === 'steam' || s.partnerFx === 'steam';
    if (steaming && !this.hiss) this.hiss = this.makeHiss(s.fx === 'steam' ? 1 : 0.45);
    if (!steaming && this.hiss) {
      this.fadeOut(this.hiss);
      this.hiss = null;
    }
  }

  private fadeOut(b: Bed | null): void {
    if (!b || !this.ctx) return;
    b.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6);
    window.setTimeout(() => b.stop(), 3000);
  }

  // ---------- building blocks ----------
  private noiseSrc(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    return src;
  }

  private filter(type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
    const n = this.ctx!.createBiquadFilter();
    n.type = type;
    n.frequency.value = f;
    n.Q.value = q;
    return n;
  }

  private lfo(target: AudioParam, rate: number, depth: number): OscillatorNode {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.value = rate;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start();
    return o;
  }

  /** A panned input on the effects bus. */
  private out(pan: number, gain = 1): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = gain;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p).connect(this.fxBus);
    } else g.connect(this.fxBus);
    return g;
  }

  private t(at = 0): number {
    return this.ctx!.currentTime + at;
  }

  /** A filtered noise burst with an attack and an exponential release. */
  private burst(o: { type: BiquadFilterType; f: number; f2?: number; q?: number; dur: number; gain: number; pan: number; at?: number; attack?: number; dest?: AudioNode }) {
    const ctx = this.ctx!;
    const t = this.t(o.at);
    const src = this.noiseSrc();
    const flt = this.filter(o.type, o.f, o.q ?? 1);
    if (o.f2) flt.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    const g = ctx.createGain();
    const atk = o.attack ?? Math.min(0.006, o.dur / 4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(flt).connect(g).connect(o.dest ?? this.out(o.pan));
    src.start(t, rnd(0, 1.5));
    src.stop(t + o.dur + 0.05);
  }

  /** A struck body: a set of decaying partials plus a short contact noise. */
  private strike(partials: readonly (readonly [number, number, number])[], o: { f: number; gain: number; pan: number; decay: number; at?: number; click?: number; dest?: AudioNode }) {
    const ctx = this.ctx!;
    const t = this.t(o.at);
    const dest = o.dest ?? this.out(o.pan);
    for (const [ratio, g0, d0] of partials) {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(o.f * ratio * rnd(0.99, 1.01), t);
      const g = ctx.createGain();
      const dur = o.decay * d0;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain * g0), t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
    const click = o.gain * (o.click ?? 0.7);
    if (click > 0.001) this.burst({ type: 'bandpass', f: o.f * 3, q: 0.8, dur: 0.012, gain: click, pan: o.pan, at: o.at, dest });
  }

  private knock(o: { f: number; gain: number; pan: number; decay?: number; at?: number }) {
    this.strike(WOOD, { ...o, decay: o.decay ?? 0.12 });
  }

  /** A plucked string (Karplus–Strong), cached per pitch. */
  private pluck(o: { f: number; gain: number; pan: number; at?: number; dur?: number }) {
    const ctx = this.ctx!;
    const key = Math.round(o.f);
    let buf = this.plucks.get(key);
    if (!buf) {
      const sr = ctx.sampleRate;
      const len = Math.floor(sr * (o.dur ?? 0.9));
      buf = ctx.createBuffer(1, len, sr);
      const out = buf.getChannelData(0);
      const n = Math.max(2, Math.round(sr / o.f));
      const ring = new Float32Array(n);
      for (let i = 0; i < n; i++) ring[i] = Math.random() * 2 - 1;
      for (let i = 0; i < len; i++) {
        const j = i % n;
        out[i] = ring[j]!;
        ring[j] = 0.497 * (ring[j]! + ring[(j + 1) % n]!);
      }
      this.plucks.set(key, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = this.filter('lowpass', 2600);
    const g = ctx.createGain();
    g.gain.value = o.gain;
    src.connect(lp).connect(g).connect(this.out(o.pan));
    src.start(this.t(o.at));
  }

  /** Many tiny noise grains in one band: snow, salt, gravel, straw. */
  private grains(o: { n: number; span: number; f: number; q?: number; gain: number; pan: number; at?: number; len?: [number, number] }) {
    const ctx = this.ctx!;
    const flt = this.filter('bandpass', o.f, o.q ?? 1.2);
    flt.connect(this.out(o.pan));
    const [l0, l1] = o.len ?? [0.002, 0.007];
    for (let i = 0; i < o.n; i++) {
      const t = this.t((o.at ?? 0) + Math.random() * o.span);
      const d = rnd(l0, l1);
      const src = this.noiseSrc();
      const g = ctx.createGain();
      // grains are tiny, so each one is driven hard to be heard at all
      const peak = o.gain * 6 * rnd(0.3, 1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.0008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      src.connect(g).connect(flt);
      src.start(t, rnd(0, 1.5));
      src.stop(t + d + 0.02);
    }
  }

  /** Rising bubbles: short upward chirps. */
  private bubbles(o: { n: number; span: number; f: [number, number]; gain: number; pan: number; at?: number }) {
    const ctx = this.ctx!;
    const dest = this.out(o.pan);
    for (let i = 0; i < o.n; i++) {
      const t = this.t((o.at ?? 0) + Math.random() * o.span);
      const f = rnd(o.f[0], o.f[1]);
      const d = rnd(0.02, 0.06);
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * rnd(1.5, 2.2), t + d);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(o.gain * rnd(0.4, 1), t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + d + 0.02);
    }
  }

  /** Water moving: low noise with a sloshing tremble. */
  private slosh(o: { dur: number; gain: number; pan: number; f?: number; at?: number }) {
    const ctx = this.ctx!;
    const t = this.t(o.at);
    const src = this.noiseSrc();
    const lp = this.filter('lowpass', o.f ?? 900, 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    const trem = ctx.createGain();
    trem.gain.value = 0.6;
    const l = ctx.createOscillator();
    l.frequency.value = rnd(6, 9);
    const ld = ctx.createGain();
    ld.gain.value = 0.4;
    l.connect(ld).connect(trem.gain);
    src.connect(lp).connect(trem).connect(g).connect(this.out(o.pan));
    src.start(t, rnd(0, 1.5));
    l.start(t);
    src.stop(t + o.dur + 0.05);
    l.stop(t + o.dur + 0.05);
  }

  /** Friction: wood or rope creaking under strain. */
  private creak(o: { dur: number; gain: number; pan: number; f?: number; at?: number }) {
    const ctx = this.ctx!;
    const t = this.t(o.at);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const f = o.f ?? rnd(70, 110);
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.linearRampToValueAtTime(f * rnd(0.7, 1.4), t + o.dur);
    const bp = this.filter('bandpass', 1100, 3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + o.dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(bp).connect(g).connect(this.out(o.pan));
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  /** Cloth, straw, fur: a soft rustle. */
  private rustle(o: { dur: number; gain: number; pan: number; at?: number; f?: number }) {
    this.grains({ n: Math.round(o.dur * 90), span: o.dur, f: o.f ?? 3200, q: 0.6, gain: o.gain, pan: o.pan, at: o.at, len: [0.004, 0.02] });
  }

  // ---------- beds ----------
  private makeBed(kind: Kind): Bed {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.bedBus);
    const nodes: AudioScheduledSourceNode[] = [];
    const timers: number[] = [];

    const wind = (level: number, f: number) => {
      const src = this.noiseSrc();
      const lp = this.filter('lowpass', f, 0.5);
      const lp2 = this.filter('lowpass', f * 1.6, 0.5);
      const g = ctx.createGain();
      g.gain.value = level;
      src.connect(lp).connect(lp2).connect(g).connect(out);
      src.start();
      nodes.push(src, this.lfo(lp.frequency, rnd(0.04, 0.08), f * 0.5), this.lfo(g.gain, rnd(0.05, 0.11), level * 0.5));
    };

    let target = 1;
    if (kind === 'snow') wind(0.16, 380);
    else if (kind === 'river') {
      wind(0.1, 420);
      const src = this.noiseSrc();
      const bp = this.filter('bandpass', 650, 0.4);
      const g = ctx.createGain();
      g.gain.value = 0.11;
      src.connect(bp).connect(g).connect(out);
      src.start();
      nodes.push(src, this.lfo(bp.frequency, 0.23, 180), this.lfo(g.gain, 0.31, 0.03));
      const hi = this.noiseSrc();
      const hp = this.filter('highpass', 2400, 0.5);
      const g2 = ctx.createGain();
      g2.gain.value = 0.018;
      hi.connect(hp).connect(g2).connect(out);
      hi.start();
      nodes.push(hi, this.lfo(g2.gain, 0.9, 0.008));
    } else if (kind === 'cave') {
      for (const [f, l] of [
        [49, 0.05],
        [73.5, 0.025],
      ] as const) {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = l;
        o.connect(g).connect(out);
        o.start();
        nodes.push(o, this.lfo(g.gain, rnd(0.03, 0.07), l * 0.6));
      }
      wind(0.05, 220);
      // drips that echo off the walls
      const echo = ctx.createDelay(1);
      echo.delayTime.value = 0.27;
      const fb = ctx.createGain();
      fb.gain.value = 0.38;
      const damp = this.filter('lowpass', 1800);
      echo.connect(damp).connect(fb).connect(echo);
      const wet = ctx.createGain();
      wet.gain.value = 0.5;
      damp.connect(wet).connect(out);
      const drip = () => {
        const f = rnd(900, 1600);
        for (const dest of [out, echo]) {
          const t = ctx.currentTime;
          const o = ctx.createOscillator();
          o.frequency.setValueAtTime(f, t);
          o.frequency.exponentialRampToValueAtTime(f * 1.8, t + 0.05);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(dest === out ? 0.07 : 0.05, t + 0.003);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
          o.connect(g).connect(dest);
          o.start(t);
          o.stop(t + 0.1);
        }
        timers.push(window.setTimeout(drip, rnd(2500, 8000)));
      };
      timers.push(window.setTimeout(drip, rnd(1000, 3000)));
    } else {
      // cellar: close, dull room tone
      const src = this.noiseSrc();
      const lp = this.filter('lowpass', 140, 0.5);
      const g = ctx.createGain();
      g.gain.value = 0.07;
      src.connect(lp).connect(g).connect(out);
      src.start();
      nodes.push(src);
      target = 0.8;
    }
    out.gain.setTargetAtTime(target, ctx.currentTime, 1.2);
    return {
      out,
      stop: () => {
        for (const n of nodes) n.stop();
        for (const t of timers) window.clearTimeout(t);
        out.disconnect();
      },
    };
  }

  /** The sound of a scene: a warm drone by the fire, a low throb in a fight, a faint pad otherwise. */
  private makeMood(mood: NonNullable<Mood>): Bed {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.master);
    const nodes: AudioScheduledSourceNode[] = [];
    const pad = (freqs: readonly number[], level: number, cutoff: number) => {
      const lp = this.filter('lowpass', cutoff, 0.6);
      lp.connect(out);
      for (const f of freqs) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        o.detune.value = rnd(-6, 6);
        const g = ctx.createGain();
        g.gain.value = level;
        o.connect(g).connect(lp);
        o.start();
        nodes.push(o, this.lfo(g.gain, rnd(0.05, 0.12), level * 0.5));
      }
    };
    let fire: Bed | null = null;
    if (mood === 'hearth') {
      pad([110, 130.8, 164.8], 0.022, 700); // A minor, low and warm
      if (this.fireKind === 'none' || this.fireKind === null) {
        fire = this.makeFire(0.8);
        // route it through this scene's output, so it fades out with it
        fire.out.disconnect();
        fire.out.connect(out);
      }
    } else if (mood === 'fight') {
      // a low throb, like blood in the ears, and a thin whistling wind
      const o = ctx.createOscillator();
      o.frequency.value = 46;
      const g = ctx.createGain();
      g.gain.value = 0.07;
      o.connect(g).connect(out);
      o.start();
      nodes.push(o, this.lfo(g.gain, 1.6, 0.065));
      const n = this.noiseSrc();
      const bp = this.filter('bandpass', 1300, 9);
      const g2 = ctx.createGain();
      g2.gain.value = 0.035;
      n.connect(bp).connect(g2).connect(out);
      n.start();
      nodes.push(n, this.lfo(bp.frequency, 0.13, 350));
    } else if (mood === 'deep') {
      // under the mountain: the hum in the bones, slow and close
      for (const [f, l, r] of [
        [41, 0.08, 0.11],
        [61.5, 0.035, 0.07],
      ] as const) {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = l;
        o.connect(g).connect(out);
        o.start();
        nodes.push(o, this.lfo(g.gain, r, l * 0.7));
      }
    } else {
      pad([73.4, 110], 0.014, 500); // D and A, barely there
    }
    out.gain.setTargetAtTime(1, ctx.currentTime, 1.5);
    return {
      out,
      stop: () => {
        for (const n of nodes) n.stop();
        fire?.stop();
        out.disconnect();
      },
    };
  }

  private makeFire(level: number): Bed {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.bedBus);
    const src = this.noiseSrc();
    const lp = this.filter('lowpass', 170, 0.6);
    const g = ctx.createGain();
    g.gain.value = 0.12;
    src.connect(lp).connect(g).connect(out);
    src.start();
    const lf = this.lfo(g.gain, 0.4, 0.04);
    let timer = 0;
    const crackle = () => {
      if (this.ctx && this.on && this.ctx.state === 'running') {
        const n = Math.random() < 0.25 ? 3 : 1;
        for (let i = 0; i < n; i++) {
          const t = ctx.currentTime + i * rnd(0.01, 0.04);
          const s = this.noiseSrc();
          const hp = this.filter('highpass', rnd(1500, 3500), 0.7);
          const e = ctx.createGain();
          const peak = rnd(0.03, 0.11) * level;
          e.gain.setValueAtTime(0.0001, t);
          e.gain.exponentialRampToValueAtTime(peak, t + 0.002);
          e.gain.exponentialRampToValueAtTime(0.0001, t + rnd(0.008, 0.03));
          s.connect(hp).connect(e).connect(out);
          s.start(t, rnd(0, 1.5));
          s.stop(t + 0.06);
        }
      }
      timer = window.setTimeout(crackle, level >= 1 ? rnd(60, 380) : rnd(300, 1300));
    };
    crackle();
    out.gain.setTargetAtTime(level, ctx.currentTime, 1);
    return {
      out,
      stop: () => {
        src.stop();
        lf.stop();
        window.clearTimeout(timer);
        out.disconnect();
      },
    };
  }

  /** A pot over the fire: steady hiss (bubbles come with the beats). */
  private makeHiss(level: number): Bed {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.fxBus);
    const src = this.noiseSrc();
    const hp = this.filter('highpass', 3200, 0.6);
    const g = ctx.createGain();
    g.gain.value = 0.035;
    src.connect(hp).connect(g).connect(out);
    src.start();
    const lf = this.lfo(g.gain, 0.7, 0.012);
    out.gain.setTargetAtTime(level, ctx.currentTime, 0.4);
    return {
      out,
      stop: () => {
        src.stop();
        lf.stop();
        out.disconnect();
      },
    };
  }

  // ---------- one beat of each action ----------
  private play(fx: Fx, pan: number, vol: number): void {
    const v = vol * TRIM[fx];
    const soft = this.state.kind === 'cave' || this.state.kind === 'cellar' || this.state.kind === 'candle';
    switch (fx) {
      case 'walk':
        return this.step(pan, v, soft);
      case 'twigs':
        this.step(pan, v, soft);
        if (Math.random() < 0.45) this.snap(pan, v, rnd(0.05, 0.2));
        return;
      case 'snare':
        this.step(pan, v, soft);
        if (Math.random() < 0.3) this.creak({ dur: 0.25, gain: 0.03 * v, pan, f: rnd(140, 200), at: 0.1 });
        return;
      case 'send':
        // a few people leaving, out of step with each other
        for (let i = 0; i < 2; i++) this.step(pan + rnd(-0.4, 0.4), v * rnd(0.35, 0.6), soft, rnd(0, 0.2));
        return;

      case 'chop': {
        // the blade bites, the log answers; now and then it splits
        this.burst({ type: 'highpass', f: 2500, dur: 0.015, gain: 0.35 * v, pan });
        this.strike(WOOD, { f: rnd(160, 200), gain: 0.5 * v, pan, decay: 0.16, click: 0.4 });
        this.burst({ type: 'lowpass', f: 400, dur: 0.12, gain: 0.25 * v, pan });
        if (Math.random() < 0.35) this.burst({ type: 'bandpass', f: 1800, f2: 900, q: 1.5, dur: 0.18, gain: 0.18 * v, pan, at: 0.04 });
        return;
      }
      case 'build':
        // hammer on wood, twice
        for (const at of [0, 0.28]) {
          this.strike(WOOD, { f: rnd(380, 460), gain: 0.4 * v, pan, decay: 0.1, at, click: 0.9 });
          this.burst({ type: 'lowpass', f: 300, dur: 0.06, gain: 0.15 * v, pan, at });
        }
        return;
      case 'rubble':
        // stones knocking and earth sliding
        for (let i = 0; i < 5; i++) this.strike(STONE, { f: rnd(900, 2200), gain: rnd(0.08, 0.18) * v, pan: pan + rnd(-0.2, 0.2), decay: 0.05, at: rnd(0, 0.35) });
        this.burst({ type: 'lowpass', f: 500, f2: 150, dur: 0.5, gain: 0.16 * v, pan, attack: 0.05 });
        return;
      case 'scrap':
        // bits of iron dropped on a heap
        for (let i = 0; i < 3; i++) this.strike(IRON, { f: rnd(500, 1300), gain: rnd(0.07, 0.13) * v, pan: pan + rnd(-0.2, 0.2), decay: rnd(0.25, 0.5), at: i * rnd(0.08, 0.16) });
        this.burst({ type: 'lowpass', f: 300, dur: 0.1, gain: 0.12 * v, pan });
        return;
      case 'forge': {
        // hammer on hot iron: a short bright ring over the anvil
        this.strike(IRON, { f: rnd(820, 900), gain: 0.22 * v, pan, decay: 0.5, click: 1.2 });
        this.burst({ type: 'lowpass', f: 250, dur: 0.08, gain: 0.2 * v, pan });
        this.grains({ n: 6, span: 0.2, f: 6000, q: 0.7, gain: 0.08 * v, pan, at: 0.02 });
        return;
      }
      case 'whet':
        // two strokes of the whetstone along the blade
        for (const at of [0, 0.45]) {
          this.burst({ type: 'bandpass', f: 3200, f2: 4600, q: 4, dur: 0.32, gain: 0.12 * v, pan, at, attack: 0.08 });
          this.strike(IRON, { f: 2400, gain: 0.015 * v, pan, decay: 0.4, at: at + 0.3, click: 0 });
        }
        return;
      case 'flint':
        // flint on steel, a few sparks
        this.burst({ type: 'highpass', f: 3500, dur: 0.03, gain: 0.25 * v, pan });
        this.strike(IRON, { f: 3100, gain: 0.03 * v, pan, decay: 0.15, click: 0 });
        this.grains({ n: 5, span: 0.25, f: 7000, q: 0.7, gain: 0.06 * v, pan, at: 0.02 });
        return;
      case 'fire':
        // a log drops in, the flame takes it with a breath
        this.strike(WOOD, { f: rnd(110, 140), gain: 0.4 * v, pan, decay: 0.2, click: 0.3 });
        this.burst({ type: 'lowpass', f: 200, f2: 900, dur: 0.9, gain: 0.14 * v, pan, attack: 0.25, at: 0.08 });
        this.grains({ n: 8, span: 0.8, f: 2800, q: 0.7, gain: 0.12 * v, pan, at: 0.2, len: [0.004, 0.015] });
        return;

      case 'water':
        // the bucket goes in, water pours and bubbles
        this.knock({ f: 150, gain: 0.18 * v, pan, decay: 0.15 });
        this.slosh({ dur: 0.75, gain: 0.22 * v, pan, at: 0.05 });
        this.bubbles({ n: 7, span: 0.6, f: [300, 700], gain: 0.07 * v, pan, at: 0.1 });
        return;
      case 'fish':
        // the line whips out, a small plop
        this.burst({ type: 'bandpass', f: 1800, f2: 700, q: 1.2, dur: 0.18, gain: 0.07 * v, pan, attack: 0.05 });
        this.bubbles({ n: 1, span: 0, f: [350, 450], gain: 0.12 * v, pan, at: 0.28 });
        this.slosh({ dur: 0.35, gain: 0.08 * v, pan, at: 0.28 });
        return;
      case 'row':
        // an oar dips and pulls; the oarlock creaks
        this.slosh({ dur: 0.6, gain: 0.2 * v, pan, f: 700 });
        this.bubbles({ n: 4, span: 0.4, f: [250, 500], gain: 0.05 * v, pan, at: 0.1 });
        this.creak({ dur: 0.35, gain: 0.035 * v, pan, at: 0.25 });
        return;
      case 'steam':
        // the pot simmers
        this.bubbles({ n: 2, span: 0.25, f: [180, 420], gain: 0.07 * v, pan });
        return;

      case 'arrow': {
        // the string thrums, the arrow hisses past, a dull hit far off
        this.pluck({ f: 98, gain: 0.35 * v, pan: pan - 0.2 });
        const ctx = this.ctx!;
        const t = this.t(0.04);
        const src = this.noiseSrc();
        const bp = this.filter('bandpass', 2600, 2);
        bp.frequency.exponentialRampToValueAtTime(900, t + 0.35);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.08 * v, t + 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
        const p = ctx.createStereoPanner?.();
        if (p) {
          p.pan.setValueAtTime(-0.6, t);
          p.pan.linearRampToValueAtTime(0.7, t + 0.38);
          src.connect(bp).connect(g).connect(p).connect(this.fxBus);
        } else src.connect(bp).connect(g).connect(this.fxBus);
        src.start(t, rnd(0, 1.5));
        src.stop(t + 0.45);
        this.knock({ f: 140, gain: 0.1 * v, pan: 0.6, decay: 0.09, at: 0.5 });
        return;
      }
      case 'string':
        // fitting and testing a bowstring: two plucks, the second tighter
        this.pluck({ f: rnd(85, 95), gain: 0.25 * v, pan });
        this.pluck({ f: rnd(104, 112), gain: 0.25 * v, pan, at: 0.6 });
        return;
      case 'carve':
        // the knife takes a curl off the wood, twice
        for (const at of [0, 0.32]) this.burst({ type: 'bandpass', f: rnd(2400, 3200), f2: rnd(3800, 4800), q: 2.5, dur: 0.17, gain: 0.1 * v, pan, at, attack: 0.04 });
        return;
      case 'rope':
        // fibres twisting
        this.creak({ dur: 0.5, gain: 0.03 * v, pan, f: rnd(90, 140) });
        this.rustle({ dur: 0.5, gain: 0.05 * v, pan, f: 2400 });
        return;
      case 'sift':
        // flour sifting through cloth
        this.rustle({ dur: 0.7, gain: 0.05 * v, pan, f: 1600 });
        this.burst({ type: 'lowpass', f: 1200, dur: 0.6, gain: 0.04 * v, pan, attack: 0.15 });
        return;

      case 'rummage':
        // lids, sacks and straw
        this.rustle({ dur: 0.5, gain: 0.06 * v, pan });
        if (Math.random() < 0.5) this.knock({ f: rnd(240, 320), gain: 0.15 * v, pan, decay: 0.1, at: rnd(0.1, 0.4) });
        return;
      case 'bowl':
        // a wooden bowl set down, food tipped into it
        this.knock({ f: rnd(420, 480), gain: 0.22 * v, pan, decay: 0.14 });
        this.grains({ n: 18, span: 0.35, f: 1800, q: 0.9, gain: 0.07 * v, pan, at: 0.15, len: [0.004, 0.012] });
        return;
      case 'salt':
        // a cut on the board, then salt rubbed in
        this.knock({ f: rnd(300, 360), gain: 0.18 * v, pan, decay: 0.08 });
        this.grains({ n: 30, span: 0.45, f: 6500, q: 0.8, gain: 0.05 * v, pan, at: 0.12 });
        return;
      case 'wax':
        // soft wax kneaded between the fingers
        this.burst({ type: 'lowpass', f: 700, f2: 300, q: 2, dur: 0.22, gain: 0.08 * v, pan, attack: 0.06 });
        this.burst({ type: 'bandpass', f: 1300, f2: 900, q: 3, dur: 0.15, gain: 0.03 * v, pan, at: 0.18, attack: 0.04 });
        return;
      case 'hive': {
        // a hive asleep for the winter: a muffled hum
        const ctx = this.ctx!;
        const t = this.t();
        for (const f of [rnd(205, 215), rnd(228, 236)]) {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.value = f;
          const vib = this.lfo(osc.frequency, rnd(5, 8), 3);
          const lp = this.filter('lowpass', 600, 0.8);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.025 * v, t + 0.5);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
          osc.connect(lp).connect(g).connect(this.out(pan));
          osc.start(t);
          osc.stop(t + 1.7);
          vib.stop(t + 1.7);
        }
        return;
      }
      case 'trade':
        // a heavy sack put down, its neck untied
        this.burst({ type: 'lowpass', f: 220, dur: 0.18, gain: 0.3 * v, pan });
        this.knock({ f: 95, gain: 0.15 * v, pan, decay: 0.12 });
        this.rustle({ dur: 0.4, gain: 0.05 * v, pan, at: 0.25, f: 2600 });
        return;
      case 'care': {
        // a drink poured into a cup, a spoon stirs it
        const ctx = this.ctx!;
        const t = this.t();
        const src = this.noiseSrc();
        const bp = this.filter('bandpass', 500, 6);
        bp.frequency.exponentialRampToValueAtTime(1300, t + 0.9); // the cup fills, the pitch rises
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12 * v, t + 0.08);
        g.gain.setValueAtTime(0.12 * v, t + 0.75);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
        src.connect(bp).connect(g).connect(this.out(pan));
        src.start(t, rnd(0, 1.5));
        src.stop(t + 1);
        for (const at of [1.15, 1.45]) this.strike(IRON, { f: 2900, gain: 0.03 * v, pan, decay: 0.2, at, click: 0.2 });
        return;
      }
      case 'breath': {
        // a slow breath in, and out
        this.burst({ type: 'bandpass', f: 900, q: 0.7, dur: 1.1, gain: 0.05 * v, pan: 0, attack: 0.6 });
        this.burst({ type: 'bandpass', f: 600, q: 0.7, dur: 1.4, gain: 0.04 * v, pan: 0, attack: 0.3, at: 1.3 });
        return;
      }
      case 'heart':
        // lub-dub, felt more than heard
        for (const [at, f, g] of [
          [0, 55, 0.5],
          [0.24, 48, 0.35],
        ] as const)
          this.strike([[1, 1, 1]], { f, gain: g * v, pan: 0, decay: 0.18, at, click: 0 });
        return;
    }
  }

  /** A footstep: crunching snow, or a scuff on chalk and stone. */
  private step(pan: number, v: number, soft: boolean, at = 0) {
    if (soft) {
      this.grains({ n: 10, span: 0.08, f: rnd(900, 1300), q: 0.8, gain: 0.16 * v, pan, at, len: [0.004, 0.015] });
      this.burst({ type: 'lowpass', f: 250, dur: 0.08, gain: 0.14 * v, pan, at });
    } else {
      // compacting snow: a dense run of tiny squeaks and crackles
      this.grains({ n: 26, span: 0.11, f: rnd(2200, 3400), q: 1, gain: 0.22 * v, pan, at });
      this.grains({ n: 10, span: 0.09, f: rnd(900, 1300), q: 1, gain: 0.12 * v, pan, at: at + 0.01 });
      this.burst({ type: 'lowpass', f: 220, dur: 0.1, gain: 0.16 * v, pan, at });
    }
  }

  /** A dry branch snapping. */
  private snap(pan: number, v: number, at: number) {
    this.burst({ type: 'bandpass', f: rnd(1800, 2800), q: 1.5, dur: 0.02, gain: 0.3 * v, pan, at });
    this.strike(WOOD, { f: rnd(700, 1000), gain: 0.08 * v, pan, decay: 0.05, at, click: 0 });
  }
}

export const sound = new Sound();
