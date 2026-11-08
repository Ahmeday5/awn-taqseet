import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { AmountArPipe } from '../../../../../shared/pipes/money-ar.pipe';
import {
  MonthlyProfitDistribution,
  RepresentativeProfit,
  ShareholderMonthlyProfit,
} from '../../../models/treasury.model';
import { ProfitInfoComponent } from '../profit-info/profit-info.component';
import {
  ProfitShareholdersTableComponent,
  ShareholderColumn,
} from '../profit-shareholders-table/profit-shareholders-table.component';

const SHAREHOLDER_COLUMNS: readonly ShareholderColumn<ShareholderMonthlyProfit>[] = [
  { key: 'contributionPercentage', label: 'نسبة المساهمة %', kind: 'percent', field: 'ContributionPercentage' },
  { key: 'poolShare', label: 'نصيبه من الـ Pool', kind: 'amount', field: 'PoolShare' },
  { key: 'companyPercentage', label: 'نسبة الشركة %', kind: 'percent', field: 'CompanyPercentage' },
  { key: 'companyShare', label: 'حصة الشركة', kind: 'amount', field: 'CompanyShare' },
  { key: 'shareholderShare', label: 'حصة المساهم', kind: 'amount', field: 'ShareholderShare' },
];

/**
 * Drill-down of one distribution row (a month, or the yearly total): how
 * its net profit was split between the representatives, the company and
 * each shareholder. Company-wide view only.
 */
@Component({
  selector: 'app-profit-month-details',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AmountArPipe, NgTemplateOutlet, ProfitInfoComponent, ProfitShareholdersTableComponent],
  templateUrl: './profit-month-details.component.html',
  styleUrl: './profit-month-details.component.scss',
})
export class ProfitMonthDetailsComponent {
  readonly row = input.required<MonthlyProfitDistribution>();
  /** Column order of the main table, so reps read in the same order here. */
  readonly representatives = input<readonly RepresentativeProfit[]>([]);

  protected readonly shareholderColumns = SHAREHOLDER_COLUMNS;

  protected readonly reps = computed(() => {
    const order = new Map(this.representatives().map((r, i) => [r.representativeId, i]));
    return [...(this.row().representatives ?? [])].sort(
      (a, b) =>
        (order.get(a.representativeId) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.representativeId) ?? Number.MAX_SAFE_INTEGER),
    );
  });

  protected readonly repTotals = computed(() =>
    this.reps().reduce(
      (t, r) => ({
        fromContracts: t.fromContracts + r.fromContracts,
        fromRevenues: t.fromRevenues + r.fromRevenues,
        fromExpenses: t.fromExpenses + r.fromExpenses,
      }),
      { fromContracts: 0, fromRevenues: 0, fromExpenses: 0 },
    ),
  );

  /** Pool totals are the backend's own figures — the ones the main table shows. */
  protected readonly shareholderTotals = computed(() => {
    const r = this.row();
    return {
      poolShare: r.shareholdersPool,
      companyShare: r.companyProfit,
      shareholderShare: r.shareholdersProfit,
    };
  });
}
