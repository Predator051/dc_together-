// Getting a player's attention: a short vibration while the game is on screen (phones that can),
// and a system notification while it is hidden (only if the player switched them on).
// No push service is involved: a notification can only come while the browser keeps the page alive.

const KEY = 'bezgomin.notify';

type Kind = 'call' | 'scene' | 'done' | 'back';

const BUZZ: Partial<Record<Kind, number[]>> = {
  call: [90, 70, 90],
  scene: [60],
};

function loadOn(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

class Notifier {
  on = loadOn();
  private reg: ServiceWorkerRegistration | null = null;
  private listeners = new Set<() => void>();

  constructor() {
    if (this.on && this.supported() && Notification.permission === 'granted') void this.register();
    else if (this.on) this.on = false;
  }

  supported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Switch notifications on (asks the browser) or off. Returns an error text, if any. */
  async toggle(texts: { denied: string; unsupported: string }): Promise<string | null> {
    let error: string | null = null;
    if (this.on) this.on = false;
    else if (!this.supported()) error = texts.unsupported;
    else {
      const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      if (perm === 'granted') {
        this.on = true;
        await this.register();
      } else error = texts.denied;
    }
    try {
      localStorage.setItem(KEY, this.on ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    for (const fn of this.listeners) fn();
    return error;
  }

  private async register(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;
    try {
      this.reg = await navigator.serviceWorker.register('/sw.js');
    } catch {
      this.reg = null;
    }
  }

  /** On screen: buzz for things that need an answer. Hidden: a notification, if allowed. */
  ping(kind: Kind, title: string, body = ''): void {
    if (!document.hidden) {
      const p = BUZZ[kind];
      if (p && 'vibrate' in navigator) {
        try {
          navigator.vibrate(p);
        } catch {
          /* not allowed before the first tap */
        }
      }
      return;
    }
    if (!this.on || !this.supported() || Notification.permission !== 'granted') return;
    const opts: NotificationOptions & { renotify?: boolean } = { body, tag: kind, icon: '/icon.svg', renotify: true };
    if (this.reg) void this.reg.showNotification(title, opts).catch(() => undefined);
    else {
      try {
        new Notification(title, opts);
      } catch {
        /* Android without a service worker */
      }
    }
  }
}

export const notifier = new Notifier();
