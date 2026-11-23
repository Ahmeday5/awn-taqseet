import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { AmountArPipe } from '../../../../../shared/pipes/money-ar.pipe';
import { ProfitsSummary } from '../../../models/treasury.model';
import { ProfitInfoComponent } from '../profit-info/profit-info.component';

/**
 * "الأرباح" block — the year's net-profit equation plus the total,
 * distributed and current figures. Distributed profits is its own figure,
 * never equated to net profits (they legitimately differ), and total/current
 * profits are the server's trial-balance figures, rendered as-is.
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
}
