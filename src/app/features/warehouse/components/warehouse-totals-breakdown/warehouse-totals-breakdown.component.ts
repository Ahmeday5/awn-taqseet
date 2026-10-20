import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import {
  WarehouseInventoryTotals,
  WarehouseInventoryWarehouseTotals,
} from '../../models/warehouse.model';
import { salesValue, sellThroughPercent } from '../../utils/inventory-metrics';

/**
 * Per-warehouse comparison of the filtered inventory (`warehouseTotals`),
 * closed by a grand-total row (`totals`).
 *
 * Rendered as a grouped-header table on wide screens and as stacked cards
 * on narrow ones — the main inventory table already scrolls horizontally,
 * so the totals deliberately never do.
 */
@Component({
  selector: 'app-warehouse-totals-breakdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, NgTemplateOutlet, CurrencyArPipe],
  templateUrl: './warehouse-totals-breakdown.component.html',
  styleUrl: './warehouse-totals-breakdown.component.scss',
})
export class WarehouseTotalsBreakdownComponent {
  readonly rows       = input.required<readonly WarehouseInventoryWarehouseTotals[]>();
  readonly grandTotal = input<WarehouseInventoryTotals | null>(null);
  readonly loading    = input<boolean>(false);

  /** Emits the warehouse id when the user asks to drill into its products. */
  readonly warehouseSelect = output<number>();

  protected readonly viewRows = computed(() => this.rows().map(withMetrics));

  protected readonly viewTotal = computed(() => {
    const t = this.grandTotal();
    return t ? withMetrics(t) : null;
  });
}

function withMetrics<T extends WarehouseInventoryTotals>(t: T) {
  return {
    ...t,
    salesValue: salesValue(t),
    sellThroughPercent: sellThroughPercent(t),
  };
}
