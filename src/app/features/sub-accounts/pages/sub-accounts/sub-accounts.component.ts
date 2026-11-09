import { ChangeDetectionStrategy, Component } from '@angular/core';

import { SubAccountsTableComponent } from '../../components/sub-accounts-table/sub-accounts-table.component';
import { SubAccountVouchersTableComponent } from '../../components/sub-account-vouchers-table/sub-account-vouchers-table.component';
import { SubAccountTransfersTableComponent } from '../../components/sub-account-transfers-table/sub-account-transfers-table.component';

/**
 * Sub-accounts screen — three independent tables: the accounts themselves,
 * every receipt/payment voucher on them, and the account-to-account transfer
 * log. Each table owns its own filters/pagination and refetches on any
 * `sub-account` cache invalidation, so a write in one keeps the others fresh.
 */
@Component({
  selector: 'app-sub-accounts',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SubAccountsTableComponent,
    SubAccountVouchersTableComponent,
    SubAccountTransfersTableComponent,
  ],
  template: `
    <div class="row g-3">
      <div class="col-12">
        <app-sub-accounts-table />
      </div>
      <div class="col-12">
        <app-sub-account-vouchers-table />
      </div>
      <div class="col-12">
        <app-sub-account-transfers-table />
      </div>
    </div>
  `,
})
export class SubAccountsComponent {}
