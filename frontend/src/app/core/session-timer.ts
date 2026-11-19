import { NgZone, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';

/** What the server returns on login and refresh. Durations are in seconds. */
export interface SessionGrant {
  token: string;
  expiresIn: number;
  sessionEndsIn: number;
}

export interface SessionWarning {
  /** idle: will sign out for inactivity (can be extended). ending: maximum session length reached. */
  kind: 'idle' | 'ending';
  secondsLeft: number;
}

interface SessionTimes {
  /** When the current token was received; kept so a page reload doesn't skew the token's lifetime. */
  issuedAt: number;
  expiresAt: number;
  sessionEndsAt: number;
}

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
const IDLE_WARNING_SECONDS = 120;
const ENDING_WARNING_SECONDS = 300;

/**
 * Keeps a session alive while the user is active and ends it when they aren't.
 *
 * The server issues short-lived tokens (the idle limit). While there has been activity since
 * the last renewal, the token is renewed once half its lifetime has passed. With no activity
 * it runs out: a warning shows shortly before, then `onExpire` runs. Renewals can't go past
 * the maximum session length, so that limit gets its own earlier, non-extendable warning.
 *
 * Times are stored as this browser's clock + the server's durations, so clock differences
 * between the two don't matter.
 */
export class SessionTimer {
  readonly warning = signal<SessionWarning | null>(null);

  private times: SessionTimes | null;
  private lastActivity = Date.now();
  private lastRenewal = Date.now();
  private renewing = false;
  private endingWarningDismissed = false;
  private interval?: ReturnType<typeof setInterval>;
  private readonly noteActivity = () => { this.lastActivity = Date.now(); };

  constructor(private readonly options: {
    storageKey: string;
    zone: NgZone;
    renew: () => Observable<SessionGrant>;
    onExpire: () => void;
  }) {
    this.times = this.read();
    if (this.times) {
      // Restored after a page reload: only real input from here on counts as activity,
      // so reloading an idle page doesn't keep the session alive.
      this.lastRenewal = this.times.issuedAt;
      this.lastActivity = this.times.issuedAt;
      this.start();
    }
  }

  /** True once the session's current token has run out (the server would reject it). */
  get expired(): boolean {
    return Boolean(this.times && Date.now() >= this.times.expiresAt);
  }

  /** Call with every grant from login or renewal. */
  begin(grant: SessionGrant) {
    const now = Date.now();
    this.times = { issuedAt: now, expiresAt: now + grant.expiresIn * 1000, sessionEndsAt: now + grant.sessionEndsIn * 1000 };
    try { sessionStorage.setItem(this.options.storageKey, JSON.stringify(this.times)); } catch { /* storage unavailable */ }
    this.lastRenewal = now;
    if (this.warning()?.kind === 'idle') this.warning.set(null);
    this.start();
  }

  /** Ends tracking (logout). */
  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = undefined;
    for (const event of ACTIVITY_EVENTS) document.removeEventListener(event, this.noteActivity, true);
    this.times = null;
    this.endingWarningDismissed = false;
    this.warning.set(null);
    try { sessionStorage.removeItem(this.options.storageKey); } catch { /* storage unavailable */ }
  }

  /** "Stay signed in" from the warning. */
  stayActive() {
    this.lastActivity = Date.now();
    this.renew();
  }

  dismissEndingWarning() {
    this.endingWarningDismissed = true;
    this.warning.set(null);
  }

  private start() {
    if (this.interval) return;
    // Outside Angular's zone: the 1-second tick and frequent pointer events shouldn't trigger
    // change detection. Signal updates still refresh the view when something changes.
    this.options.zone.runOutsideAngular(() => {
      for (const event of ACTIVITY_EVENTS) document.addEventListener(event, this.noteActivity, { capture: true, passive: true });
      this.interval = setInterval(() => this.tick(), 1000);
    });
  }

  private tick() {
    const times = this.times;
    if (!times) return;
    const now = Date.now();
    const left = times.expiresAt - now;
    if (left <= 0) {
      this.options.zone.run(() => this.options.onExpire());
      return;
    }
    // Once a renewal would hit the maximum session length, the token can't be extended.
    const canExtend = times.sessionEndsAt - times.expiresAt > 1000;
    const lifetime = times.expiresAt - times.issuedAt;
    if (canExtend && this.lastActivity > this.lastRenewal && left < lifetime / 2) this.renew();

    const secondsLeft = Math.ceil(left / 1000);
    let warning: SessionWarning | null = null;
    if (!canExtend) {
      if (!this.endingWarningDismissed && secondsLeft <= ENDING_WARNING_SECONDS) warning = { kind: 'ending', secondsLeft };
    } else if (secondsLeft <= Math.min(IDLE_WARNING_SECONDS, lifetime / 4000)) {
      warning = { kind: 'idle', secondsLeft };
    }
    const current = this.warning();
    if (current?.kind !== warning?.kind || current?.secondsLeft !== warning?.secondsLeft) this.warning.set(warning);
  }

  private renew() {
    if (this.renewing || !this.times) return;
    this.renewing = true;
    this.options.renew().subscribe({
      next: () => { this.renewing = false; },
      error: (error: unknown) => {
        this.renewing = false;
        // Rejected (session over or revoked): end it now. Network errors retry on the next tick.
        if (error instanceof HttpErrorResponse && error.status === 401) this.options.zone.run(() => this.options.onExpire());
      }
    });
  }

  private read(): SessionTimes | null {
    try {
      const raw = sessionStorage.getItem(this.options.storageKey);
      const times = raw ? JSON.parse(raw) as SessionTimes : null;
      return times && [times.issuedAt, times.expiresAt, times.sessionEndsAt].every(Number.isFinite) ? times : null;
    } catch {
      return null;
    }
  }
}
