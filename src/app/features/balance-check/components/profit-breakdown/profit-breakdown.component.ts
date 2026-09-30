import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { MoneyArPipe } from '../../../../shared/pipes/money-ar.pipe';
import { BalanceProfitDto } from '../../models/balance-check.model';
import { buildProfitLines } from '../../utils/balance-check.view-model';

/**
 * Net-profit derivation, one line per term:
 *   ربح العقود + الإيرادات − المصروفات − الأرباح الموزعة − عمولة المناديب
 * Bars are scaled to the largest term so relative weight reads at a glance.
 */
@Component({
  selector: 'app-profit-breakdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MoneyArPipe],
  templateUrl: './profit-breakdown.component.html',
  styleUrl: './profit-breakdown.component.scss',
})
export class ProfitBreakdownComponent {
  readonly profit = input.required<BalanceProfitDto>();

  protected readonly lines = computed(() => buildProfitLines(this.profit()));
}
