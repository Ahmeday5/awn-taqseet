import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { WarehouseInventoryTotals } from '../../models/warehouse.model';
import {
  profitMarginPercent,
  salesValue,
  sellThroughPercent,
} from '../../utils/inventory-metrics';

const PLACEHOLDER_LABELS = [
  'عدد الأصناف',
  'الكمية المتاحة',
  'قيمة المخزون المتاح',
  'قيمة المبيعات',
  'تكلفة المباع',
  'صافي الربح',
] as const;

/**
 * KPI strip for the inventory table — grand totals over the *whole*
 * filtered result set (`totals` from `/dashboard/warehouses/inventory`),
 * so it stays stable while the user pages through rows.
 */
@Component({
  selector: 'app-inventory-totals-strip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, CurrencyArPipe],
  templateUrl: './inventory-totals-strip.component.html',
  styleUrl: './inventory-totals-strip.component.scss',
})
export class InventoryTotalsStripComponent {
  readonly totals  = input<WarehouseInventoryTotals | null>(null);
  readonly loading = input<boolean>(false);

  /** Card labels shown with "—" values before the first response lands. */
  protected readonly placeholderLabels = PLACEHOLDER_LABELS;

  protected readonly view = computed(() => {
    const t = this.totals();
    if (!t) return null;
    return {
      ...t,
      salesValue: salesValue(t),
      sellThroughPercent: sellThroughPercent(t),
      marginPercent: profitMarginPercent(t),
    };
  });
}
