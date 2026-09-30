import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { MoneyArPipe } from '../../../../shared/pipes/money-ar.pipe';
import { formatMoneyAr } from '../../../../shared/utils/number-format.util';
import { shareOf } from '../../utils/balance-check.view-model';

/**
 * The verdict banner: balanced / not balanced, the reconciliation equation
 * (الأصول − الالتزامات = الفرق) and a side-by-side magnitude comparison.
 */
@Component({
  selector: 'app-balance-status-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MoneyArPipe],
  templateUrl: './balance-status-card.component.html',
  styleUrl: './balance-status-card.component.scss',
})
export class BalanceStatusCardComponent {
  readonly assetsTotal = input.required<number>();
  readonly obligationsTotal = input.required<number>();
  readonly difference = input.required<number>();
  readonly isBalanced = input.required<boolean>();

  private readonly scale = computed(() =>
    Math.max(Math.abs(this.assetsTotal()), Math.abs(this.obligationsTotal())),
  );

  protected readonly assetsWidth = computed(() =>
    shareOf(this.assetsTotal(), this.scale()),
  );
  protected readonly obligationsWidth = computed(() =>
    shareOf(this.obligationsTotal(), this.scale()),
  );

  protected readonly headline = computed(() =>
    this.isBalanced() ? 'الميزانية متوازنة' : 'يوجد فرق',
  );

  /** Says which side is heavier, so the user knows where to look. */
  protected readonly explanation = computed(() => {
    if (this.isBalanced()) return 'إجمالي الأصول يساوي إجمالي الالتزامات تمامًا';
    const amount = formatMoneyAr(Math.abs(this.difference()));
    return this.difference() > 0
      ? `الأصول أكبر من الالتزامات بمقدار ${amount}`
      : `الالتزامات أكبر من الأصول بمقدار ${amount}`;
  });
}
