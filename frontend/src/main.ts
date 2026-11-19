import { registerLocaleData } from '@angular/common';
import localeUr from '@angular/common/locales/ur';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { authInterceptor } from './app/core/auth.interceptor';
// Urdu date and number formats for the tDate / tMoney pipes.
registerLocaleData(localeUr, 'ur');
bootstrapApplication(AppComponent, { providers: [provideRouter(routes, withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' })), provideHttpClient(withInterceptors([authInterceptor]))] }).catch(console.error);
