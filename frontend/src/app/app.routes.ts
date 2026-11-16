import { Routes } from '@angular/router';
import { authGuard } from '../core/auth.guard';

/** Application routes. Every page is lazy-loaded. */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('../pages/home/home').then((m) => m.Home),
  },
  {
    path: 'favorites',
    loadComponent: () => import('../pages/favorites/favorites').then((m) => m.Favorites),
  },
  {
    path: 'wishlist',
    loadComponent: () => import('../pages/wishlist/wishlist').then((m) => m.Wishlist),
  },
  {
    path: 'search-results',
    loadComponent: () =>
      import('../pages/search-results/search-results').then((m) => m.SearchResults),
  },
  {
    path: 'games/:gameId',
    loadComponent: () =>
      import('../pages/game-detail-page/game-detail-page').then((m) => m.GameDetailPage),
  },
  {
    path: 'register',
    loadComponent: () => import('../pages/register/register').then((m) => m.Register),
  },
  {
    path: 'login',
    loadComponent: () => import('../pages/login/login').then((m) => m.Login),
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('../pages/account-settings/account-settings').then((m) => m.AccountSettings),
    canActivate: [authGuard],
  },
  {
    path: '**',
    loadComponent: () => import('../pages/not-found/not-found').then((m) => m.NotFound),
  },
];
