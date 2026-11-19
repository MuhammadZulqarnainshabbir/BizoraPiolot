import { Injectable, signal } from '@angular/core';
import { Msg } from '../i18n/i18n.service';

export interface ConfirmRequest {
  title: Msg;
  message: Msg;
  confirmLabel: Msg;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
  /** Ask for a reason (stored in the audit log); the confirm button stays disabled until given, unless `reasonOptional`. */
  reasonLabel?: Msg;
  reasonOptional?: boolean;
}
export interface ConfirmResult { confirmed: boolean; reason: string; }

/** Promise-based confirmation dialog (replaces window.confirm). Rendered by <app-confirm-dialog>. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly current = signal<(ConfirmRequest & { resolve: (r: ConfirmResult) => void }) | null>(null);

  ask(request: ConfirmRequest): Promise<ConfirmResult> {
    this.current()?.resolve({ confirmed: false, reason: '' });
    return new Promise(resolve => this.current.set({ ...request, resolve }));
  }

  close(result: ConfirmResult) {
    const current = this.current();
    this.current.set(null);
    current?.resolve(result);
  }
}
