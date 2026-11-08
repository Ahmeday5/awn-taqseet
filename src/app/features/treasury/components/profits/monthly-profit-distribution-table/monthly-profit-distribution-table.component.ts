import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { AmountArPipe } from '../../../../../shared/pipes/money-ar.pipe';
import { formatAmountAr } from '../../../../../shared/utils/number-format.util';
import { ModalComponent } from '../../../../../shared/components/modal/modal.component';
import {
  MonthlyProfitDistribution,
  MonthlyTable,
  RepresentativeMonthlyProfit,
  RepresentativeProfit,
} from '../../../models/treasury.model';
import { ProfitInfoComponent } from '../profit-info/profit-info.component';
import { ProfitMonthDetailsComponent } from '../profit-month-details/profit-month-details.component';

type DistributionFigure =
  | 'netProfit'
  | 'representativesProfit'
  | 'shareholdersPool'
  | 'companyProfit'
  | 'shareholdersProfit'
  | 'distributedProfit';

interface DistributionColumn {
  key: DistributionFigure;
  label: string;
  /** Explanation field (PascalCase, matched case-insensitively). */
  field: string;
  /** Hidden when scoped to a single representative (always 0 then). */
  companyOnly?: boolean;
  strong?: boolean;
}

/** Columns before the per-representative ones. */
const LEADING: readonly DistributionColumn[] = [
  { key: 'netProfit', label: 'صافي الربح', field: 'NetProfit', strong: true },
  { key: 'representativesProfit', label: 'أرباح المناديب', field: 'RepresentativesProfit' },
];

/** Columns after the per-representative ones. */
const TRAILING: readonly DistributionColumn[] = [
  { key: 'shareholdersPool', label: 'ربح المساهمين (Pool)', field: 'ShareholdersPool', companyOnly: true },
  { key: 'companyProfit', label: 'حصة الشركة', field: 'CompanyProfit', companyOnly: true },
  { key: 'shareholdersProfit', label: 'حصة المساهمين', field: 'ShareholdersProfit', companyOnly: true },
  { key: 'distributedProfit', label: 'الأرباح الموزعة', field: 'DistributedProfit', strong: true },
];

const round2 = (n: number): number => Math.round(n * 100) / 100;

interface RepCell {
  amount: number;
  /** Tooltip breakdown; null when the rep has no entry that month. */
  lines: string[] | null;
}

interface DistributionViewRow {
  row: MonthlyProfitDistribution;
  /** Aligned 1:1 with the `representatives` columns. */
  reps: RepCell[];
  /** distributedProfit ≠ netProfit (company-wide view only). */
  mismatch: boolean;
}

/**
 * "توزيع الأرباح الشهرية", computed on each month's net profit.
 *
 * Representative columns are dynamic: the headers follow the
 * `treasuries.representatives` order and each cell is matched by
 * `representativeId`, never by index, because a month only lists the reps
 * who earned something in it.
 *
 * Company-wide, every month row (and the yearly total) opens a breakdown of
 * how its net profit was split between representatives, the company and each
 * shareholder.
 */
@Component({
  selector: 'app-monthly-profit-distribution-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AmountArPipe,
    NgTemplateOutlet,
    ModalComponent,
    ProfitInfoComponent,
    ProfitMonthDetailsComponent,
  ],
  templateUrl: './monthly-profit-distribution-table.component.html',
  styleUrl: './monthly-profit-distribution-table.component.scss',
})
export class MonthlyProfitDistributionTableComponent {
  readonly table = input.required<MonthlyTable<MonthlyProfitDistribution>>();
  readonly representatives = input.required<readonly RepresentativeProfit[]>();
  /** False when scoped to a single representative — company/shareholder figures are 0 then. */
  readonly showCompanyFigures = input(true);

  protected readonly selected = signal<MonthlyProfitDistribution | null>(null);

  protected readonly leading = LEADING;

  protected readonly trailing = computed(() =>
    this.showCompanyFigures() ? TRAILING : TRAILING.filter((c) => !c.companyOnly),
  );

  protected readonly months = computed(() =>
    (this.table().months ?? []).map((row) => this.toViewRow(row)),
  );

  protected readonly total = computed(() => {
    const total = this.table().total;
    return total ? this.toViewRow(total) : null;
  });

  protected readonly detailsTitle = computed(() => {
    const row = this.selected();
    if (!row) return '';
    return row === this.table().total
      ? 'تفاصيل توزيع أرباح العام'
      : `تفاصيل توزيع أرباح شهر ${row.monthName}`;
  });

  protected open(row: MonthlyProfitDistribution): void {
    if (this.showCompanyFigures()) this.selected.set(row);
  }

  protected value(row: MonthlyProfitDistribution, key: DistributionFigure): number {
    return row[key];
  }

  private toViewRow(row: MonthlyProfitDistribution): DistributionViewRow {
    const byId = new Map<number, RepresentativeMonthlyProfit>(
      (row.representatives ?? []).map((r) => [r.representativeId, r]),
    );
    return {
      row,
      reps: this.representatives().map((rep) => {
        const r = byId.get(rep.representativeId);
        return r
          ? {
              amount: r.amount,
              lines: [
                `عمولة العقود ${formatAmountAr(r.fromContracts)}`,
                `+ من الإيرادات ${formatAmountAr(r.fromRevenues)}`,
                `− من المصروفات ${formatAmountAr(r.fromExpenses)}`,
              ],
            }
          : { amount: 0, lines: null };
      }),
      mismatch:
        this.showCompanyFigures() && round2(row.distributedProfit) !== round2(row.netProfit),
    };
  }
}
