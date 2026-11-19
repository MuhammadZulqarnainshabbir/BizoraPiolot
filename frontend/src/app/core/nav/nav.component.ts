import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { IsActiveMatchOptions, NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../auth.service';
import { EmployeeAuthService, employeePath } from '../employee-auth.service';
import { TranslatePipe } from '../i18n/i18n.pipes';
import { LanguageSwitchComponent } from '../i18n/language-switch.component';
import { NavConfig, buildNav } from './nav-config';

/**
 * Site-wide navigation bar. What it shows depends on who is signed in (guest, shop owner,
 * employee) and the current page; the rules live in nav-config.ts.
 */
@Component({
  selector: 'app-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, TranslatePipe, LanguageSwitchComponent],
  template: `
    <header *ngIf="config() as nav" class="nav container" [attr.data-role]="nav.role">
      <a class="brand" [routerLink]="nav.brand.commands"
        [attr.aria-label]="nav.brand.portal ? ('Back to your partner portal' | t) : ('Bizora Pilot home' | t)"
        [title]="nav.brand.portal ? ('Back to your partner portal' | t) : ('Bizora Pilot home' | t)">
        <span aria-hidden="true">◈</span> <span class="brand-word" dir="ltr">Bizora <span>Pilot</span></span>
        <span *ngIf="nav.brand.portal" class="brand-portal-tag">{{ 'Partner portal' | t }}</span>
      </a>
      <nav [attr.aria-label]="'Main navigation' | t">
        <a *ngFor="let link of nav.links" class="nav-link" [routerLink]="link.commands" [fragment]="link.fragment"
          routerLinkActive="active" [routerLinkActiveOptions]="activeOptions">{{ link.label | t }}</a>
        <label *ngIf="nav.search" class="nav-search"><span class="visually-hidden">{{ 'Search' | t }}</span><input type="search" [placeholder]="'Search serial or product...' | t" [attr.aria-label]="'Search inventory' | t" maxlength="100" (keydown.enter)="searchInventory($any($event.target))"></label>
        <app-language-switch></app-language-switch>
        <ng-container *ngIf="nav.authActions">
          <a routerLink="/login" class="nav-login">{{ 'Login' | t }}</a>
          <a routerLink="/register" class="btn btn-small">{{ 'Register →' | t }}</a>
        </ng-container>
        <button *ngIf="nav.logout" type="button" class="nav-logout" (click)="logout(nav)">{{ 'Log out' | t }}</button>
      </nav>
    </header>
  `
})
export class NavComponent {
  private router = inject(Router);
  private auth = inject(AuthService);
  private employeeAuth = inject(EmployeeAuthService);
  private url = toSignal(
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), map(() => this.router.url)),
    { initialValue: this.router.url }
  );

  /** Home and Features share a page; only the one whose #section matches is highlighted. */
  readonly activeOptions: IsActiveMatchOptions = { paths: 'exact', fragment: 'exact', queryParams: 'ignored', matrixParams: 'ignored' };

  private cached?: { key: string; config: NavConfig };

  /**
   * Checked on every render so it follows sign-in, sign-out and expiry immediately, but only
   * rebuilt when its inputs change: returning the same object keeps the links' DOM and
   * bindings stable between checks.
   */
  config(): NavConfig | null {
    // The platform console has its own layout; the public bar never shows there.
    if (this.url().startsWith('/platform-admin')) return null;
    const state = {
      url: this.url(),
      ownerActive: this.auth.authenticated,
      employeeShop: this.employeeAuth.active ? this.employeeAuth.session()?.shop ?? null : null,
      employeeRole: this.employeeAuth.session()?.employee.accessRole ?? 'employee'
    };
    const key = `${state.url}|${state.ownerActive}|${state.employeeShop?.id ?? ''}|${state.employeeShop?.slug ?? ''}|${state.employeeRole}`;
    if (this.cached?.key !== key) this.cached = { key, config: buildNav(state) };
    return this.cached.config;
  }

  /** Owner search: opens the inventory filtered by serial number / product. */
  searchInventory(input: HTMLInputElement) {
    const search = input.value.trim();
    if (!search) return;
    input.value = '';
    // onSameUrlNavigation isn't 'reload', so leave the page first if the inventory is already open.
    void this.router.navigateByUrl('/partnerdashboard', { skipLocationChange: true })
      .then(() => this.router.navigate(['/partnerdashboard', 'inventory'], { queryParams: { search } }));
  }

  logout(nav: NavConfig) {
    if (nav.role === 'employee') {
      const shop = this.employeeAuth.session()?.shop;
      this.employeeAuth.logout();
      void this.router.navigate(shop ? employeePath(shop, 'login') : ['/']);
    } else {
      this.auth.logout();
      void this.router.navigateByUrl('/login');
    }
  }
}
