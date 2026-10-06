// Sound: synthesized in the browser with Web Audio — no recordings, no downloads.
// A quiet bed for the place (wind, river, cave), the fire's crackle, and a short sound for every
// visual accent (steps, axe, water…). Starts on the first tap (browsers forbid sound before that),
// pauses with the tab, and can be switched off; the choice is remembered on this device.
import type { AmbientView } from '../../shared/src/protocol.js';

type Fx = NonNullable<AmbientView['fx']>;
type Kind = AmbientView['kind'];

const KEY = 'bezgomin.sound';
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

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

class Sound {
  on = loadOn();
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private bedBus!: GainNode;
  private fxBus!: GainNode;
  private noise!: AudioBuffer;
  private bed: Bed | null = null;
  private fireBed: Bed | null = null;
  private hiss: Bed | null = null;
  private timers: number[] = [];
  private state: AmbientView & { scene: boolean } = { kind: 'snow', fire: 'none', fx: null, partnerFx: null, fxUntil: 0, partnerFxUntil: 0, scene: false };
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
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else if (this.on) void this.ctx.resume();
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
        if (!this.on) void this.ctx?.suspend();
      }, 400);
    }
    for (const fn of this.listeners) fn();
  }

  /** The place, its fire and continuous accents. */
  set(s: AmbientView & { scene: boolean }): void {
    this.state = s;
    if (this.ctx && this.on) this.apply();
  }

  /** One beat of a visual accent (called in step with the particles). */
  beat(fx: Fx, mate: boolean): void {
    if (!this.ctx || !this.on || this.ctx.state !== 'running') return;
    const pan = mate ? 0.55 : -0.25;
    const vol = mate ? 0.45 : 1;
    switch (fx) {
      case 'walk':
        return this.step(pan, vol);
      case 'chop':
        return this.chop(pan, vol);
      case 'water':
        return this.splash(pan, vol);
      case 'sparks':
        return this.clink(pan, vol);
      case 'fire':
        return this.whoosh(pan, vol);
      case 'arrow':
        return this.arrow(vol);
      case 'shavings':
        return this.scrape(pan, vol);
      case 'dust':
        return this.thud(pan, vol);
      case 'steam':
        return; // continuous: see apply()
    }
  }

  // ---------- setup ----------
  private start(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(comp);
      this.bedBus = ctx.createGain();
      this.bedBus.connect(this.master);
      this.fxBus = ctx.createGain();
      this.fxBus.gain.value = 2.2;
      this.fxBus.connect(this.master);
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const ctx = this.ctx;
    void ctx.resume().then(() => {
      this.master.gain.setTargetAtTime(0.7, ctx.currentTime, 0.4);
      this.apply();
    });
  }

  private apply(): void {
    const ctx = this.ctx!;
    const s = this.state;
    this.bedBus.gain.setTargetAtTime(s.scene ? 0.55 : 1, ctx.currentTime, 0.8);

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
    src.loopStart = rnd(0, 1);
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

  private panner(pan: number): AudioNode {
    const ctx = this.ctx!;
    if (!ctx.createStereoPanner) return ctx.createGain();
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    return p;
  }

  /** A short filtered noise burst. */
  private burst(o: { type: BiquadFilterType; f: number; f2?: number; q?: number; dur: number; gain: number; pan: number; at?: number }) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.at ?? 0);
    const src = this.noiseSrc();
    const flt = this.filter(o.type, o.f, o.q ?? 1);
    if (o.f2) flt.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + Math.min(0.01, o.dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(flt).connect(g).connect(this.panner(o.pan)).connect(this.fxBus);
    src.start(t, rnd(0, 1.5));
    src.stop(t + o.dur + 0.05);
  }

  /** A short tone that glides from f to f2. */
  private tone(o: { f: number; f2?: number; dur: number; gain: number; pan: number; type?: OscillatorType; at?: number; dest?: AudioNode }) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.at ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g).connect(this.panner(o.pan)).connect(o.dest ?? this.fxBus);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
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
        this.tone({ f, f2: f * 0.55, dur: 0.09, gain: 0.07, pan: rnd(-0.7, 0.7), dest: out });
        this.tone({ f, f2: f * 0.55, dur: 0.09, gain: 0.05, pan: 0, dest: echo });
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
          s.connect(hp).connect(e).connect(this.panner(rnd(-0.5, 0.5))).connect(out);
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

  private makeHiss(level: number): Bed {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.fxBus);
    const src = this.noiseSrc();
    const hp = this.filter('highpass', 2800, 0.6);
    const g = ctx.createGain();
    g.gain.value = 0.05;
    src.connect(hp).connect(g).connect(out);
    src.start();
    const lf = this.lfo(g.gain, 0.7, 0.02);
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

  // ---------- accents ----------
  /** A step in snow (crunch) or on chalk and stone (scuff). */
  private step(pan: number, vol: number) {
    const soft = this.state.kind === 'cave' || this.state.kind === 'cellar' || this.state.kind === 'candle';
    const grains = soft ? 2 : 4;
    for (let i = 0; i < grains; i++)
      this.burst({ type: 'bandpass', f: soft ? rnd(900, 1400) : rnd(1800, 3200), q: 0.9, dur: rnd(0.04, 0.08), gain: rnd(0.14, 0.28) * vol, pan, at: i * rnd(0.012, 0.03) });
    this.burst({ type: 'lowpass', f: 300, dur: 0.1, gain: 0.18 * vol, pan });
  }

  private chop(pan: number, vol: number) {
    this.tone({ f: 140, f2: 55, dur: 0.22, gain: 0.32 * vol, pan });
    this.burst({ type: 'bandpass', f: 900, q: 1.2, dur: 0.09, gain: 0.25 * vol, pan });
    this.burst({ type: 'highpass', f: 3000, dur: 0.02, gain: 0.1 * vol, pan });
  }

  private splash(pan: number, vol: number) {
    this.tone({ f: rnd(500, 700), f2: 260, dur: 0.12, gain: 0.08 * vol, pan });
    this.burst({ type: 'bandpass', f: 1400, f2: 350, q: 0.8, dur: 0.45, gain: 0.09 * vol, pan, at: 0.03 });
  }

  /** Metal on metal (or flint): a bright clink with a few sparks. */
  private clink(pan: number, vol: number) {
    const f = rnd(1700, 2100);
    this.tone({ f, dur: 0.35, gain: 0.07 * vol, pan, type: 'triangle' });
    this.tone({ f: f * 1.47, dur: 0.25, gain: 0.04 * vol, pan });
    for (let i = 0; i < 4; i++) this.burst({ type: 'highpass', f: 4500, dur: 0.012, gain: rnd(0.03, 0.07) * vol, pan: pan + rnd(-0.2, 0.2), at: rnd(0.02, 0.18) });
  }

  /** The fire flares up. */
  private whoosh(pan: number, vol: number) {
    this.burst({ type: 'lowpass', f: 250, f2: 1300, dur: 0.5, gain: 0.12 * vol, pan });
    for (let i = 0; i < 3; i++) this.burst({ type: 'highpass', f: 2500, dur: 0.015, gain: rnd(0.04, 0.09) * vol, pan, at: rnd(0.05, 0.35) });
  }

  private arrow(vol: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = this.noiseSrc();
    const bp = this.filter('bandpass', 3200, 2);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1 * vol, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    const p = this.panner(-0.8);
    if ('pan' in p) (p as StereoPannerNode).pan.linearRampToValueAtTime(0.8, t + 0.38);
    src.connect(bp).connect(g).connect(p).connect(this.fxBus);
    src.start(t, rnd(0, 1.5));
    src.stop(t + 0.45);
    this.tone({ f: 160, f2: 90, dur: 0.08, gain: 0.07 * vol, pan: 0.7, at: 0.4 });
  }

  private scrape(pan: number, vol: number) {
    this.burst({ type: 'bandpass', f: 3600, f2: 2600, q: 3, dur: 0.28, gain: 0.05 * vol, pan });
  }

  private thud(pan: number, vol: number) {
    this.tone({ f: 85, f2: 50, dur: 0.25, gain: 0.18 * vol, pan });
    this.burst({ type: 'lowpass', f: 500, f2: 200, dur: 0.4, gain: 0.08 * vol, pan, at: 0.02 });
  }
}

export const sound = new Sound();
