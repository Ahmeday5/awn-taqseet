import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import {
  formatMoneyAr,
  formatNumberAr,
} from '../../../../shared/utils/number-format.util';
import { BalanceReceivablesDto } from '../../models/balance-check.model';
import { average } from '../../utils/balance-check.view-model';

interface ReceivableTile {
  readonly label: string;
  readonly value: string;
  readonly emphasis?: boolean;
}

/** Client receivables are an aggregate (no line items) — shown as KPI tiles. */
@Component({
  selector: 'app-receivables-summary',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './receivables-summary.component.html',
  styleUrl: './receivables-summary.component.scss',
})
export class ReceivablesSummaryComponent {
  readonly receivables = input.required<BalanceReceivablesDto>();

  protected readonly tiles = computed<ReceivableTile[]>(() => {
    const r = this.receivables();
    return [
      { label: 'إجمالي المستحقات', value: formatMoneyAr(r.amount), emphasis: true },
      { label: 'عدد العقود', value: formatNumberAr(r.contractsCount) },
      { label: 'الأقساط المستحقة', value: formatNumberAr(r.installmentsCount) },
      {
        label: 'متوسط المستحق للعقد',
        value: formatMoneyAr(average(r.amount, r.contractsCount)),
      },
      {
        label: 'متوسط القسط',
        value: formatMoneyAr(average(r.amount, r.installmentsCount)),
      },
    ];
  });
}
