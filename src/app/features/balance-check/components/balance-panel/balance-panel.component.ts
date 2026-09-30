import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  MoneyArPipe,
  PercentArPipe,
} from '../../../../shared/pipes/money-ar.pipe';
import { BalanceSegment } from '../../utils/balance-check.view-model';

export type BalanceSide = 'assets' | 'obligations';

/**
 * One side of the trial balance (الأصول / الالتزامات): header with the side
 * total, a composition bar of its sections, the projected sections, and a
 * closing total row.
 */
@Component({
  selector: 'app-balance-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MoneyArPipe, PercentArPipe],
  templateUrl: './balance-panel.component.html',
  styleUrl: './balance-panel.component.scss',
})
export class BalancePanelComponent {
  readonly side = input.required<BalanceSide>();
  /** Accounting column label — "مدين" / "دائن". */
  readonly kicker = input.required<string>();
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly total = input.required<number>();
  readonly segments = input<ReadonlyArray<BalanceSegment>>([]);
  readonly totalLabel = input.required<string>();
}
