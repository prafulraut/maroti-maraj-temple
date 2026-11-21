import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { RegisterComponent } from './auth/register/register.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { AdminDashboardComponent } from './features/admin/admin-dashboard.component';
import { TempleInfoComponent } from './features/temple-info/temple-info.component';
import { PalkhiTrackerComponent } from './features/palkhi-tracker/palkhi-tracker.component';
import { GalleryComponent } from './features/gallery/gallery.component';
import { DonateComponent } from './features/donate/donate.component';
import { AuthGuard } from './core/guards/auth.guard';
import { AdminGuard } from './core/guards/admin.guard';

const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  // Home and Temple Info share one component but show different sections
  { path: '', component: TempleInfoComponent, pathMatch: 'full', data: { page: 'home' } },
  { path: 'temple-info', component: TempleInfoComponent, data: { page: 'info' } },
  { path: 'palkhi-tracker', component: PalkhiTrackerComponent },
  { path: 'gallery', component: GalleryComponent },
  { path: 'donate', component: DonateComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [AuthGuard] },
  { path: 'admin', component: AdminDashboardComponent, canActivate: [AdminGuard] },
  { path: '**', redirectTo: '' }
];

@NgModule({
  // Every page opens at the top (otherwise the old scroll position is kept)
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
