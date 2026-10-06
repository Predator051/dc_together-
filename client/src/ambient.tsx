// Visual ambience: weather behind the page, fire glow, and a small accent while an action runs.
// Purely decorative: hidden from screen readers, ignores input, stops when the tab is hidden,
// and does not animate at all for people who ask for reduced motion.
import { useEffect, useRef } from 'preact/hooks';
import type { AmbientView } from '../../shared/src/protocol.js';

type Fx = NonNullable<AmbientView['fx']>;

interface State extends AmbientView {
  paused: boolean;
}

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  rot: number;
  vr: number;
  shape: 'dot' | 'chip' | 'ring' | 'print' | 'puff' | 'streak' | 'curl';
  color: string;
  alpha: number;
  glow?: boolean;
  side?: number;
}

const INK = '230, 217, 188';
const OCHRE = '221, 184, 103';
const EMBER = '240, 150, 70';
const GALL = '142, 165, 179';
const WOOD = '170, 120, 70';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

class Engine {
  private bctx: CanvasRenderingContext2D;
  private fctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private back: P[] = [];
  private front: P[] = [];
  private s: State = { kind: 'snow', fire: 'none', fx: null, partnerFx: null, paused: true };
  private raf = 0;
  private last = 0;
  /** Seconds until the next emission, per emitter key. */
  private timers = new Map<string, number>();
  private stepNo = 0;
  private walkX = new Map<string, number>();

  constructor(
    private bc: HTMLCanvasElement,
    private fc: HTMLCanvasElement,
  ) {
    this.bctx = bc.getContext('2d')!;
    this.fctx = fc.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.wake);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.wake);
  }

  set(next: State) {
    const kindChanged = next.kind !== this.s.kind;
    this.s = next;
    if (kindChanged) this.back = [];
    this.wake();
  }

  private resize = () => {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    for (const c of [this.bc, this.fc]) {
      c.width = Math.round(this.w * this.dpr);
      c.height = Math.round(this.h * this.dpr);
    }
    this.bctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.fctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  };

  private wake = () => {
    if (this.raf || this.s.paused || document.hidden) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Where accents happen: just above the phone's bottom bar, or near the bottom edge. */
  private baseline(): number {
    const nav = document.querySelector('.bottom-nav');
    const r = nav?.getBoundingClientRect();
    const top = r && r.height > 0 ? r.top : this.h;
    return top - 12;
  }

  private frame = (t: number) => {
    this.raf = 0;
    if (this.s.paused || document.hidden) return;
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    this.weather(dt);
    this.accents(dt);
    this.draw(this.bctx, this.back, dt);
    this.draw(this.fctx, this.front, dt);
    this.raf = requestAnimationFrame(this.frame);
  };

  // ---------- background: weather, motes, fire sparks ----------
  private weather(dt: number) {
    const { kind, fire } = this.s;
    const area = this.w * this.h;
    const want =
      kind === 'snow'
        ? Math.round(area / 16000)
        : kind === 'river'
          ? Math.round(area / 26000)
          : kind === 'cave'
            ? Math.round(area / 30000)
            : Math.round(area / 60000);
    let flakes = 0;
    for (const p of this.back) if (p.shape !== 'dot' || !p.glow) flakes++;
    for (let i = flakes; i < want; i++) this.back.push(this.spawnWeather(flakes === 0));

    const rate = fire === 'warm' ? 2.2 : fire === 'low' ? 0.6 : 0;
    if (rate > 0 && this.tick('fire', dt, 1 / rate)) {
      this.back.push({
        x: this.w / 2 + rnd(-90, 90),
        y: this.h - rnd(10, 40),
        vx: rnd(-12, 12),
        vy: rnd(-55, -30),
        age: 0,
        life: rnd(2.5, 4.5),
        size: rnd(0.8, 1.8),
        rot: 0,
        vr: 0,
        shape: 'dot',
        color: EMBER,
        alpha: 0.8,
        glow: true,
      });
    }
  }

  private spawnWeather(anywhere: boolean): P {
    const { kind } = this.s;
    const y = anywhere ? rnd(0, this.h) : -10;
    if (kind === 'snow')
      return { x: rnd(0, this.w), y, vx: rnd(-6, 6), vy: rnd(14, 38), age: 0, life: 999, size: rnd(0.8, 2.4), rot: rnd(0, 6), vr: rnd(0.4, 1.2), shape: 'dot', color: INK, alpha: rnd(0.18, 0.5) };
    if (kind === 'river')
      return { x: anywhere ? rnd(0, this.w) : -10, y: rnd(0, this.h), vx: rnd(40, 80), vy: rnd(8, 20), age: 0, life: 999, size: rnd(0.5, 1.5), rot: rnd(0, 6), vr: rnd(0.5, 1.5), shape: 'dot', color: INK, alpha: rnd(0.1, 0.3) };
    // cave, cellar: slow motes
    return { x: rnd(0, this.w), y: anywhere ? rnd(0, this.h) : this.h + 10, vx: rnd(-4, 4), vy: rnd(-8, -2), age: 0, life: 999, size: rnd(0.5, 1.4), rot: rnd(0, 6), vr: rnd(0.2, 0.6), shape: 'dot', color: kind === 'cave' ? INK : OCHRE, alpha: rnd(0.06, 0.2) };
  }

  // ---------- foreground: action accents ----------
  private accents(dt: number) {
    const base = this.baseline();
    if (this.s.fx) this.emit('me', this.s.fx, this.w * 0.3, base, dt, false);
    else this.walkX.delete('me');
    if (this.s.partnerFx) this.emit('mate', this.s.partnerFx, this.w * 0.7, base, dt, true);
    else this.walkX.delete('mate');
  }

  private tick(key: string, dt: number, every: number): boolean {
    const left = (this.timers.get(key) ?? 0) - dt;
    if (left > 0) {
      this.timers.set(key, left);
      return false;
    }
    this.timers.set(key, every);
    return true;
  }

  private emit(who: string, fx: Fx, x0: number, y0: number, dt: number, mate: boolean) {
    const k = `${who}:${fx}`;
    const tint = mate ? GALL : null;
    const a = mate ? 0.55 : 1;
    const push = (p: Omit<P, 'age' | 'rot' | 'vr'> & Partial<P>) => this.front.push({ age: 0, rot: 0, vr: 0, ...p, alpha: p.alpha * a });
    switch (fx) {
      case 'chop':
        if (this.tick(k, dt, 0.9))
          for (let i = 0; i < 6; i++)
            push({ x: x0 + rnd(-10, 10), y: y0, vx: rnd(-90, 90), vy: rnd(-220, -120), life: 1.1, size: rnd(2, 4), rot: rnd(0, 6), vr: rnd(-8, 8), shape: 'chip', color: tint ?? WOOD, alpha: 0.9 });
        break;
      case 'shavings':
        if (this.tick(k, dt, 1.1))
          for (let i = 0; i < 3; i++)
            push({ x: x0 + rnd(-20, 20), y: y0 - 30, vx: rnd(-20, 20), vy: rnd(10, 30), life: 1.2, size: rnd(3, 5), rot: rnd(0, 6), vr: rnd(-3, 3), shape: 'curl', color: tint ?? WOOD, alpha: 0.75 });
        break;
      case 'sparks':
      case 'fire':
        if (this.tick(k, dt, fx === 'fire' ? 0.35 : 0.6))
          for (let i = 0; i < (fx === 'fire' ? 5 : 8); i++)
            push({ x: x0 + rnd(-8, 8), y: y0, vx: rnd(-70, 70), vy: rnd(-200, -80), life: rnd(0.6, 1.1), size: rnd(1, 2), shape: 'dot', color: tint ?? EMBER, alpha: 1, glow: true });
        break;
      case 'water':
        if (this.tick(k, dt, 1.1)) push({ x: x0 + rnd(-30, 30), y: y0 - rnd(0, 6), vx: 0, vy: 0, life: 1.8, size: 70, shape: 'ring', color: tint ?? GALL, alpha: 0.5 });
        break;
      case 'steam':
        if (this.tick(k, dt, 0.25)) push({ x: x0 + rnd(-15, 15), y: y0, vx: rnd(-8, 8), vy: rnd(-40, -25), life: 2.2, size: rnd(6, 10), shape: 'puff', color: tint ?? INK, alpha: 0.12 });
        break;
      case 'dust':
        if (this.tick(k, dt, 0.8))
          for (let i = 0; i < 8; i++)
            push({ x: x0 + rnd(-12, 12), y: y0, vx: rnd(-60, 60), vy: rnd(-40, -5), life: 1.4, size: rnd(4, 9), shape: 'puff', color: tint ?? INK, alpha: 0.1 });
        break;
      case 'arrow':
        if (this.tick(k, dt, 2.2)) push({ x: -40, y: y0 - rnd(30, 120), vx: this.w * 1.6, vy: 0, life: 0.9, size: 40, shape: 'streak', color: tint ?? INK, alpha: 0.5 });
        break;
      case 'walk': {
        if (!this.tick(k, dt, 0.5)) break;
        const start = mate ? this.w * 0.55 : this.w * 0.08;
        const span = this.w * 0.35;
        const x = this.walkX.get(who) ?? 0;
        this.walkX.set(who, (x + 18) % span);
        this.stepNo++;
        push({ x: start + x, y: y0 + (this.stepNo % 2 ? -4 : 4), vx: 0, vy: 0, life: 3.5, size: 4, shape: 'print', color: tint ?? INK, alpha: 0.32, side: this.stepNo % 2 });
        break;
      }
    }
  }

  // ---------- drawing ----------
  private draw(ctx: CanvasRenderingContext2D, list: P[], dt: number) {
    ctx.clearRect(0, 0, this.w, this.h);
    const gravity = 420;
    let n = 0;
    for (const p of list) {
      p.age += dt;
      if (p.age > p.life) continue;
      if (p.shape === 'chip' || p.shape === 'curl') p.vy += (p.shape === 'chip' ? gravity : 40) * dt;
      if (p.life === 999) {
        // weather sways and wraps around the screen
        p.vx += Math.sin((p.rot += p.vr * dt)) * 3 * dt;
        if (p.y > this.h + 12 || p.y < -14 || p.x > this.w + 12 || p.x < -12) {
          Object.assign(p, this.spawnWeather(false));
          if (this.s.kind === 'river') p.x = -10;
        }
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const fade = p.life === 999 ? 1 : 1 - p.age / p.life;
      const alpha = p.alpha * fade;
      ctx.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
      switch (p.shape) {
        case 'dot':
          ctx.fillStyle = `rgba(${p.color}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'chip':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = `rgba(${p.color}, ${alpha})`;
          ctx.fillRect(-p.size, -p.size / 3, p.size * 2, (p.size * 2) / 3);
          ctx.restore();
          break;
        case 'curl':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.strokeStyle = `rgba(${p.color}, ${alpha})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 1.3);
          ctx.stroke();
          ctx.restore();
          break;
        case 'ring': {
          const r = p.size * (p.age / p.life);
          ctx.strokeStyle = `rgba(${p.color}, ${alpha})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, r, r * 0.28, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'puff': {
          const r = p.size * (1 + p.age / p.life);
          ctx.fillStyle = `rgba(${p.color}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'streak': {
          const g = ctx.createLinearGradient(p.x - p.size * 3, p.y, p.x, p.y);
          g.addColorStop(0, `rgba(${p.color}, 0)`);
          g.addColorStop(1, `rgba(${p.color}, ${alpha})`);
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(p.x - p.size * 3, p.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          break;
        }
        case 'print': {
          // a boot print walking to the right: sole and heel
          const tilt = p.side ? 0.12 : -0.12;
          ctx.fillStyle = `rgba(${p.color}, ${alpha})`;
          ctx.beginPath();
          ctx.ellipse(p.x + p.size * 0.6, p.y, p.size * 1.25, p.size * 0.8, tilt, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(p.x - p.size * 1.3, p.y, p.size * 0.6, p.size * 0.65, tilt, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
      list[n++] = p;
    }
    list.length = n;
    ctx.globalCompositeOperation = 'source-over';
  }
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function Ambient({ a, paused }: { a: AmbientView; paused: boolean }) {
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const still = reducedMotion();

  useEffect(() => {
    if (still || !backRef.current || !frontRef.current) return;
    engine.current = new Engine(backRef.current, frontRef.current);
    return () => {
      engine.current?.destroy();
      engine.current = null;
    };
  }, [still]);

  useEffect(() => {
    engine.current?.set({ ...a, paused });
  }, [a.kind, a.fire, a.fx, a.partnerFx, paused]);

  return (
    <>
      <div class={`amb amb-${a.kind} fire-${a.fire} ${a.fx === 'fire' || a.partnerFx === 'fire' ? 'stoking' : ''}`} aria-hidden="true">
        <div class="amb-glow" />
        <div class="amb-edge" />
      </div>
      {!still && <canvas ref={backRef} class="amb-canvas back" aria-hidden="true" />}
      {!still && <canvas ref={frontRef} class="amb-canvas front" aria-hidden="true" />}
    </>
  );
}
