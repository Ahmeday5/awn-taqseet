import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { AmountArPipe } from '../../../../../shared/pipes/money-ar.pipe';
import { ModalComponent } from '../../../../../shared/components/modal/modal.component';
import { ProfitTreasuries, ShareholderPendingProfit } from '../../../models/treasury.model';
import { ProfitInfoComponent } from '../profit-info/profit-info.component';
import {
  ProfitShareholdersTableComponent,
  ShareholderColumn,
} from '../profit-shareholders-table/profit-shareholders-table.component';

const SHAREHOLDER_COLUMNS: readonly ShareholderColumn<ShareholderPendingProfit>[] = [
  { key: 'accruedProfit', label: 'الأرباح المستحقة', kind: 'amount', field: 'AccruedProfit' },
  { key: 'companyPercentage', label: 'نسبة الشركة %', kind: 'percent', field: 'CompanyPercentage' },
  { key: 'companyShare', label: 'حصة الشركة', kind: 'amount', field: 'CompanyShare' },
  { key: 'shareholderShare', label: 'حصة المساهم', kind: 'amount', field: 'ShareholderShare' },
];

/**
 * Green "treasuries" block. Fixed balances sit on the right and there is one
 * line per representative on the left (any number of them). The profits
 * treasury opens a per-shareholder breakdown of its unsettled amount.
 */
@Component({
  selector: 'app-profit-treasuries-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AmountArPipe, ModalComponent, ProfitInfoComponent, ProfitShareholdersTableComponent],
  templateUrl: './profit-treasuries-card.component.html',
  styleUrl: './profit-treasuries-card.component.scss',
})
export class ProfitTreasuriesCardComponent {
  readonly treasuries = input.required<ProfitTreasuries>();
  /** False when scoped to a single representative — company figures are always 0 then. */
  readonly showCompanyFigures = input(true);

  protected readonly shareholderColumns = SHAREHOLDER_COLUMNS;
  protected readonly detailsOpen = signal(false);
}
