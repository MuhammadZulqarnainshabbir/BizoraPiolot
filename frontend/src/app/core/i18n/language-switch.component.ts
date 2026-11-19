import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { I18nService } from './i18n.service';
import { TranslatePipe } from './i18n.pipes';

/** English / اردو toggle. The choice applies instantly and is remembered in this browser. */
@Component({
  selector: 'app-language-switch',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    <div class="lang-switch" role="group" [attr.aria-label]="'Language' | t">
      <button type="button" *ngFor="let language of i18n.languages"
        [class.active]="i18n.lang() === language.code"
        [attr.aria-pressed]="i18n.lang() === language.code"
        [attr.lang]="language.code"
        (click)="i18n.setLanguage(language.code)">{{ language.label }}</button>
    </div>
  `
})
export class LanguageSwitchComponent {
  i18n = inject(I18nService);
}
