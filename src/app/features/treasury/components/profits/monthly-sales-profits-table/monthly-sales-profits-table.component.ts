import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { AmountArPipe } from '../../../../../shared/pipes/money-ar.pipe';
import { formatAmountAr } from '../../../../../shared/utils/number-format.util';
import { MonthlySalesProfit, MonthlyTable } from '../../../models/treasury.model';
import { ProfitInfoComponent } from '../profit-info/profit-info.component';

type SalesFigure = Exclude<keyof MonthlySalesProfit, 'month' | 'monthName' | 'isCurrentMonth'>;

interface SalesColumn {
  key: SalesFigure;
  label: string;
  /** Explanation field (PascalCase, matched case-insensitively). */
  field: string;
  net?: boolean;
}

const COLUMNS: readonly SalesColumn[] = [
  { key: 'cashProfit', label: 'أرباح الكاش', field: 'CashProfit' },
  { key: 'installmentProfit', label: 'أرباح القسط', field: 'InstallmentProfit' },
  { key: 'salesProfit', label: 'أرباح المبيعات', field: 'SalesProfit' },
  { key: 'collectedProfit', label: 'الأرباح المحصلة', field: 'CollectedProfit' },
  { key: 'directRevenues', label: 'الإيرادات المباشرة', field: 'DirectRevenues' },
  // Shown as the positive figure the API sends — the column header says what it is.
  { key: 'expenses', label: 'المصروفات', field: 'Expenses' },
  { key: 'netProfit', label: 'صافي الربح', field: 'NetProfit', net: true },
];

/**
 * "أرباح المبيعات الشهرية" — 12 months plus the yearly total row.
 * Hovering the collected profit shows its two sources.
 */
@Component({
  selector: 'app-monthly-sales-profits-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AmountArPipe, NgTemplateOutlet, ProfitInfoComponent],
  templateUrl: './monthly-sales-profits-table.component.html',
  styleUrl: './monthly-sales-profits-table.component.scss',
})
export class MonthlySalesProfitsTableComponent {
  readonly table = input.required<MonthlyTable<MonthlySalesProfit>>();

  protected readonly columns = COLUMNS;

  protected collectedLines(row: MonthlySalesProfit): string[] {
    return [
      `ربح الأقساط المحصلة: ${formatAmountAr(row.collectedFromInstallments)}`,
      `ربح البيع الكاش: ${formatAmountAr(row.collectedFromCashSales)}`,
    ];
  }

  protected value(row: MonthlySalesProfit, key: SalesFigure): number {
    return row[key];
  }
}
