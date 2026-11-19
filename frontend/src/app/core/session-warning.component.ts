import { Component, ElementRef, EventEmitter, Output, effect, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from './i18n/i18n.pipes';
import { SessionTimer } from './session-timer';

/** "Are you still there?" / "Your session is ending" dialog with a live countdown. */
@Component({
  selector: 'app-session-warning',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    <div *ngIf="timer().warning() as warning" class="session-warning-backdrop">
      <div class="session-warning" role="alertdialog" aria-modal="true" aria-labelledby="session-warning-title" aria-describedby="session-warning-text">
        <span class="session-warning-icon" aria-hidden="true">◷</span>
        <h2 id="session-warning-title">{{ warning.kind === 'idle' ? ('Are you still there?' | t) : ('Your session is ending' | t) }}</h2>
        <p id="session-warning-text">{{ warning.kind === 'idle'
          ? ('For your security, you’ll be signed out in {time} because you’ve been inactive.' | t:{ time: countdown(warning.secondsLeft) })
          : ('For your security, you’ll be signed out in {time}. Finish what you’re doing, then sign in again to continue.' | t:{ time: countdown(warning.secondsLeft) }) }}</p>
        <div class="session-warning-actions">
          <button *ngIf="warning.kind === 'idle'" type="button" class="btn btn-small" (click)="timer().stayActive()">{{ 'Stay signed in' | t }}</button>
          <button *ngIf="warning.kind === 'ending'" type="button" class="btn btn-small" (click)="timer().dismissEndingWarning()">{{ 'OK' | t }}</button>
          <button type="button" class="btn-outline record-cancel" (click)="logout.emit()">{{ 'Log out now' | t }}</button>
        </div>
      </div>
    </div>
  `
})
export class SessionWarningComponent {
  readonly timer = input.required<SessionTimer>();
  @Output() logout = new EventEmitter<void>();
  private host: ElementRef<HTMLElement> = inject(ElementRef);
  private wasOpen = false;

  constructor() {
    // Move keyboard focus into the dialog when it opens so it can be answered without a mouse.
    effect(() => {
      const open = !!this.timer().warning();
      if (open && !this.wasOpen) setTimeout(() => this.host.nativeElement.querySelector<HTMLButtonElement>('.session-warning button')?.focus());
      this.wasOpen = open;
    });
  }

  countdown(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
}
