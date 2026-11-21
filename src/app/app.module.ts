import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule, HttpClient } from '@angular/common/http';
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

// Factory function required for AOT compilation
export function HttpLoaderFactory(http: HttpClient) {
  // ?v= stops browsers from using an old cached copy after the text is updated
  return new TranslateHttpLoader(http, './assets/i18n/', '.json?v=' + Date.now());
}

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LoginComponent } from './auth/login/login.component';
import { RegisterComponent } from './auth/register/register.component';
import { NavbarComponent } from './core/components/navbar/navbar.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { AdminDashboardComponent } from './features/admin/admin-dashboard.component';
import { TempleInfoComponent } from './features/temple-info/temple-info.component';
import { PalkhiManagementComponent } from './features/admin/palkhi-management/palkhi-management.component';
import { PalkhiTrackerComponent } from './features/palkhi-tracker/palkhi-tracker.component';
import { GalleryComponent } from './features/gallery/gallery.component';
import { GalleryManagementComponent } from './features/admin/gallery-management/gallery-management.component';
import { DonationManagementComponent } from './features/admin/donation-management/donation-management.component';
import { DonateComponent } from './features/donate/donate.component';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    RegisterComponent,
    NavbarComponent,
    DashboardComponent,
    AdminDashboardComponent,
    TempleInfoComponent,
    PalkhiManagementComponent,
    PalkhiTrackerComponent,
    GalleryComponent,
    GalleryManagementComponent,
    DonationManagementComponent,
    DonateComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    ReactiveFormsModule,
    HttpClientModule,
    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient]
      }
    })
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
