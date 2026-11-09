import { Routes } from '@angular/router';

export const subAccountsRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/sub-accounts/sub-accounts.component').then(
        (m) => m.SubAccountsComponent,
      ),
  },
];
