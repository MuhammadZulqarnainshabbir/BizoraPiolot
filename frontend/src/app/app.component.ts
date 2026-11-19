import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgIf } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { I18nService } from './core/i18n/i18n.service';
import { TranslatePipe } from './core/i18n/i18n.pipes';
import { NavComponent } from './core/nav/nav.component';
import { ConfirmDialogComponent } from './core/ui/confirm-dialog.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NgIf, RouterOutlet, TranslatePipe, NavComponent, ConfirmDialogComponent],
  template: `
    <app-nav></app-nav>
    <router-outlet></router-outlet>
    <app-confirm-dialog></app-confirm-dialog>
    <footer *ngIf="!platformConsole()" class="footer">{{ '© 2026 Bizora Pilot · Business management' | t }}</footer>
  `
})
export class AppComponent {
  // Created here so the saved language and text direction apply before the first page renders.
  i18n = inject(I18nService);
  private router = inject(Router);
  /** The platform console (/platform-admin) has its own layout, without the public footer. */
  platformConsole = toSignal(
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), map(() => this.router.url.startsWith('/platform-admin'))),
    { initialValue: this.router.url.startsWith('/platform-admin') }
  );
}
