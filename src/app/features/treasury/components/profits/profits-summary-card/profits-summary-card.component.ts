import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { AmountArPipe } from '../../../../../shared/pipes/money-ar.pipe';
import { ProfitsSummary } from '../../../models/treasury.model';
import { ProfitInfoComponent } from '../profit-info/profit-info.component';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * "الأرباح" block — the year's net-profit equation plus the
 * total / distributed / current figures.
 *
 * `netProfits = distributedProfits` only holds company-wide: when scoped to
 * a representative, `distributedProfits` is that rep's slice alone, so the
 * ✓/⚠ comparison is dropped and distributed is shown as a plain figure.
 */
@Component({
  selector: 'app-profits-summary-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AmountArPipe, NgTemplateOutlet, ProfitInfoComponent],
  templateUrl: './profits-summary-card.component.html',
  styleUrl: './profits-summary-card.component.scss',
})
export class ProfitsSummaryCardComponent {
  readonly summary = input.required<ProfitsSummary>();
  readonly showCompanyFigures = input(true);

  protected readonly balanced = computed(() => {
    const s = this.summary();
    return round2(s.netProfits) === round2(s.distributedProfits);
  });
}
