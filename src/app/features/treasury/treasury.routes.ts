import { Routes } from '@angular/router';
import { denyRolesGuard } from '../../core/guards/role.guard';
import { accessGuard } from '../../core/guards/access.guard';
import { PERMISSIONS } from '../../core/constants/permissions.const';

export const treasuryRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/treasury-home/treasury-home.component').then(
        (m) => m.TreasuryHomeComponent
      ),
  },
  {
    path: 'monthly-profits',
    loadComponent: () =>
      import('./pages/monthly-profits/monthly-profits.component').then(
        (m) => m.MonthlyProfitsComponent
      ),
  },
  {
    // Off-limits to Representatives even if the backend grants them
    // Treasury.View — shareholders is owners-only.
    path: 'shareholders',
    canActivate: [denyRolesGuard(['Representative'])],
    loadComponent: () =>
      import('./pages/shareholders/shareholders.component').then(
        (m) => m.ShareholdersComponent
      ),
  },
  {
    path: 'shareholders/classifications',
    canActivate: [
      denyRolesGuard(['Representative']),
      accessGuard({
        anyPermission: [
          PERMISSIONS.shareholdersView,
          PERMISSIONS.shareholdersFullAccess,
        ],
      }),
    ],
    loadComponent: () =>
      import('./pages/capital-classifications/capital-classifications.component').then(
        (m) => m.CapitalClassificationsComponent
      ),
  },
  {
    path: 'shareholders/classifications/:id',
    canActivate: [
      denyRolesGuard(['Representative']),
      accessGuard({
        anyPermission: [
          PERMISSIONS.shareholdersView,
          PERMISSIONS.shareholdersFullAccess,
        ],
      }),
    ],
    loadComponent: () =>
      import(
        './pages/capital-classification-statement/capital-classification-statement.component'
      ).then((m) => m.CapitalClassificationStatementComponent),
  },
];
