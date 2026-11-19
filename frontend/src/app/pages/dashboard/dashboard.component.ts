import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { TranslatePipe } from '../../core/i18n/i18n.pipes';
import { SessionWarningComponent } from '../../core/session-warning.component';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, TranslatePipe, SessionWarningComponent],
  template: `
    <main class="workspace">
      <aside class="workspace-sidebar">
        <a class="workspace-brand" routerLink="/partnerdashboard"><span class="workspace-brand-icon">◈</span><span class="brand-word" dir="ltr">Bizora <span>Pilot</span></span></a>
        <div class="workspace-label">{{ 'WORKSPACE' | t }}</div>
        <nav class="workspace-nav" [attr.aria-label]="'Shop dashboard' | t">
          <a routerLink="/partnerdashboard" [routerLinkActiveOptions]="{ exact: true }" routerLinkActive="active"><span>⌂</span> {{ 'Overview' | t }}</a>
          <a routerLink="/partnerdashboard/inventory" routerLinkActive="active"><span>▤</span> {{ 'Inventory' | t }}</a>
          <a routerLink="/partnerdashboard/sales/full-price" routerLinkActive="active"><span>↗</span> {{ 'Full-price sales' | t }}</a>
          <a routerLink="/partnerdashboard/sales/installments" routerLinkActive="active"><span>◔</span> {{ 'Installment sales' | t }}</a>
          <a routerLink="/partnerdashboard/sales/history" routerLinkActive="active"><span>☰</span> {{ 'Sales history' | t }}</a>
          <a routerLink="/partnerdashboard/customers" routerLinkActive="active"><span>☺</span> {{ 'Customers' | t }}</a>
        </nav>
        <div class="workspace-sidebar-bottom">
          <div class="workspace-label">{{ 'ACCOUNT' | t }}</div>
          <a routerLink="/partnerdashboard/profile" routerLinkActive="active"><span>⚙</span> {{ 'Shop profile & team' | t }}</a>
          <button type="button" class="workspace-logout" (click)="logout()"><span>↪</span> {{ 'Log out' | t }}</button>
        </div>
        <div class="workspace-sidebar-foot">{{ 'BIZORA PILOT · SHOP MANAGER' | t }}</div>
      </aside>

      <section class="workspace-main">
        <header class="workspace-topbar">
          <div class="workspace-breadcrumb"><span>{{ 'Workspace' | t }}</span><span class="breadcrumb-divider" aria-hidden="true">/</span><strong>{{ auth.shop()?.shopName || ('Your shop' | t) }}</strong></div>
          <div class="workspace-topbar-end">
            <div class="workspace-user" *ngIf="auth.shop() as shop">
              <div class="workspace-user-avatar">{{ shop.ownerName.charAt(0).toUpperCase() }}</div>
              <div class="workspace-user-copy"><strong>{{ shop.ownerName }}</strong><span>{{ 'Shop owner' | t }}</span></div>
            </div>
          </div>
        </header>
        <div *ngIf="loading()" class="workspace-loading" role="status"><span class="loading-mark">◈</span><strong>{{ 'Preparing your workspace' | t }}</strong><span>{{ 'Loading your shop profile...' | t }}</span></div>
        <router-outlet *ngIf="!loading()"></router-outlet>
      </section>
    </main>
    <app-session-warning [timer]="auth.sessionTimer" (logout)="logout()"></app-session-warning>
  `
})
export class DashboardComponent implements OnInit {
  auth = inject(AuthService);
  private router = inject(Router);
  loading = signal(true);

  ngOnInit() {
    this.auth.me().subscribe({
      next: () => this.loading.set(false),
      error: () => {
        // A 401 has already been handled by the interceptor (signed out, "session expired").
        if (!this.auth.token) return;
        this.auth.logout();
        this.router.navigateByUrl('/login');
      }
    });
  }

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
