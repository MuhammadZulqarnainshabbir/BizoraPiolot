import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/i18n.pipes';

@Component({
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  template: `
<main>
<section class="hero container">
  <div class="hero-copy">
    <div class="eyebrow">{{ '✦ THE SMARTER WAY TO RUN YOUR STORE' | t }}</div>
    <h1>{{ 'Your business.' | t }} <span>{{ 'Beautifully managed.' | t }}</span></h1>
    <p>{{ 'From stock and sales to customers and staff, give your business the tools it deserves. Organize everything in one simple place.' | t }}</p>
    <div class="actions"><a routerLink="/register" class="btn">{{ 'Create your shop account →' | t }}</a><a routerLink="/login" class="btn-outline">{{ 'Already have an account?' | t }}</a></div>
    <div class="hero-notes"><span>{{ '✓ Simple setup' | t }}</span><span>{{ '✓ Secure access' | t }}</span><span>{{ '✓ Built for any business' | t }}</span></div>
  </div>
  <div class="hero-art"><div class="glow"></div><div class="display-card"><div class="device device-laptop"><div class="device-screen">◈</div></div><div class="device device-phone"><div class="phone-screen">◉<small>Bizora Pilot</small></div></div><div class="floating floating-top">{{ '✦ Inventory, simplified' | t }}</div><div class="floating floating-bottom">{{ '▣ One place for your shop' | t }}</div></div></div>
</section>
<section class="categories"><div class="container">
  <div class="section-label">{{ 'MADE FOR YOUR BUSINESS' | t }}</div>
  <h2>{{ 'Every part of your business. One platform.' | t }}</h2>
  <p class="muted">{{ 'Everything you run belongs here.' | t }}</p>
  <div class="category-grid">
    <div class="category"><span>▣</span><h3>{{ 'Inventory' | t }}</h3><p>{{ 'Stock, units and serial numbers' | t }}</p></div>
    <div class="category"><span>▤</span><h3>{{ 'Sales' | t }}</h3><p>{{ 'Full-price and installment sales' | t }}</p></div>
    <div class="category"><span>◉</span><h3>{{ 'Customers' | t }}</h3><p>{{ 'Profiles, records and receipts' | t }}</p></div>
    <div class="category"><span>▧</span><h3>{{ 'Team' | t }}</h3><p>{{ 'Owners, managers and employees' | t }}</p></div>
  </div>
</div></section>
<section id="features" class="features container">
  <div class="section-label">{{ 'WHY BIZORA PILOT' | t }}</div>
  <h2>{{ 'Less admin. More business.' | t }}</h2>
  <div class="feature-grid">
    <article><div class="feature-icon">⌘</div><h3>{{ 'Your shop, your space' | t }}</h3><p>{{ 'Register your business and keep its information organized.' | t }}</p></article>
    <article><div class="feature-icon">♢</div><h3>{{ 'Secure owner access' | t }}</h3><p>{{ 'Sign in with your own account to reach your private shop dashboard.' | t }}</p></article>
    <article><div class="feature-icon">↗</div><h3>{{ 'Ready to grow' | t }}</h3><p>{{ 'A solid foundation for future stock, sales, and customer management tools.' | t }}</p></article>
  </div>
</section>
<section class="cta container"><h2>{{ 'Ready to get started?' | t }}</h2><p>{{ 'Create your free shop-owner account and set up your workspace.' | t }}</p><a class="btn btn-light" routerLink="/register">{{ 'Register your shop →' | t }}</a></section>
</main>`
})
export class LandingComponent {}
