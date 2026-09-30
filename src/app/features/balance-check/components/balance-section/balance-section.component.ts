import {
  ChangeDetectionStrategy,
  Component,
  input,
  model,
} from '@angular/core';
import { NavIconComponent } from '../../../../shared/components/nav-icon/nav-icon.component';
import {
  MoneyArPipe,
  PercentArPipe,
} from '../../../../shared/pipes/money-ar.pipe';
import { BalanceSectionMeta } from '../../constants/balance-check.constants';

let nextSectionId = 0;

/**
 * One reconciliation line (e.g. "الخزائن") — a summary header that expands
 * to reveal its projected detail content.
 *
 * Collapse is a CSS grid-rows transition (no measuring, no animation lib);
 * the collapsed body is `inert` so its controls leave the tab order.
 */
@Component({
  selector: 'app-balance-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NavIconComponent, MoneyArPipe, PercentArPipe],
  templateUrl: './balance-section.component.html',
  styleUrl: './balance-section.component.scss',
})
export class BalanceSectionComponent {
  readonly meta = input.required<BalanceSectionMeta>();
  readonly amount = input.required<number>();
  /** Share of the parent side's total, 0–100. */
  readonly share = input(0);
  /** Short count line under the title, e.g. "١٧ خزنة". */
  readonly caption = input('');
  /** Collapsed by default — the summary header is the overview. */
  readonly expanded = model(false);

  protected readonly bodyId = `bc-section-body-${++nextSectionId}`;

  protected toggle(): void {
    this.expanded.update((open) => !open);
  }
}
