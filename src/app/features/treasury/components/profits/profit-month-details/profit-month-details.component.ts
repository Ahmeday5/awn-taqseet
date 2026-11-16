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

/** Below this, a derived company share is rounding noise, not a real line. */
const COMPANY_LINE_EPSILON = 0.01;
const COMPANY_LINE_NAME = 'الشركة (من رصيدها)';

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

  /**
   * The company takes a profit share like a shareholder (its balance ÷
   * (shareholders' capital + its balance)), but the API lists only real
   * shareholders per month. Their percentages now sum below 100% and the
   * remainder is the company's — derived here from the server's own figures
   * so the breakdown reconciles with the pool totals in the footer.
   */
  protected readonly companyLine = computed<ShareholderMonthlyProfit | null>(() => {
    const r = this.row();
    const rows = r.shareholders ?? [];
    const poolShare = r.shareholdersPool - rows.reduce((s, x) => s + (x.poolShare ?? 0), 0);
    const percentage = 100 - rows.reduce((s, x) => s + (x.contributionPercentage ?? 0), 0);
    if (Math.abs(poolShare) < COMPANY_LINE_EPSILON && Math.abs(percentage) < COMPANY_LINE_EPSILON) {
      return null;
    }
    return {
      shareholderId: 0,
      shareholderName: COMPANY_LINE_NAME,
      contributionPercentage: Math.max(percentage, 0),
      poolShare,
      // The company keeps all of its own share.
      companyPercentage: 100,
      companyShare: poolShare,
      shareholderShare: 0,
    };
  });

  protected readonly shareholderRows = computed(() => {
    const company = this.companyLine();
    const rows = this.row().shareholders ?? [];
    return company ? [company, ...rows] : rows;
  });

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
