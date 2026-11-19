import { Component, ElementRef, HostListener, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../i18n/i18n.pipes';
import { ConfirmService } from './confirm.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  template: `
    <div *ngIf="confirm.current() as request" class="session-warning-backdrop" (click)="cancel()">
      <div class="session-warning confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text" (click)="$event.stopPropagation()">
        <h2 id="confirm-title">{{ request.title | t }}</h2>
        <p id="confirm-text">{{ request.message | t }}</p>
        <label *ngIf="request.reasonLabel" class="confirm-reason">{{ request.reasonLabel | t }}
          <textarea rows="3" maxlength="500" [(ngModel)]="reason" name="reason"></textarea>
        </label>
        <div class="session-warning-actions">
          <button type="button" class="btn-outline record-cancel" (click)="cancel()">{{ 'Cancel' | t }}</button>
          <button type="button" class="btn btn-small" [class.btn-danger]="request.danger" [disabled]="!!request.reasonLabel && !request.reasonOptional && !reason.trim()" (click)="ok()">{{ request.confirmLabel | t }}</button>
        </div>
      </div>
    </div>
  `
})
export class ConfirmDialogComponent {
  confirm = inject(ConfirmService);
  private host: ElementRef<HTMLElement> = inject(ElementRef);
  reason = '';

  constructor() {
    effect(() => {
      if (this.confirm.current()) {
        this.reason = '';
        setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.confirm-dialog textarea, .confirm-dialog .btn-outline')?.focus());
      }
    });
  }

  @HostListener('document:keydown.escape') cancel() { if (this.confirm.current()) this.confirm.close({ confirmed: false, reason: '' }); }
  ok() { this.confirm.close({ confirmed: true, reason: this.reason.trim() }); }
}
