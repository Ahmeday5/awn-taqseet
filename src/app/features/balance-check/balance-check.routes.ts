import { Routes } from '@angular/router';

export const balanceCheckRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/balance-check/balance-check.component').then(
        (m) => m.BalanceCheckComponent,
      ),
  },
];
