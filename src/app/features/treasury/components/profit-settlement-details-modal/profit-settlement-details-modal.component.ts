import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { VoucherNumberComponent } from '../../../../shared/components/voucher-number/voucher-number.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { DateArPipe } from '../../../../shared/pipes/date-ar.pipe';
import { ApiError } from '../../../../core/models/api-response.model';

import { ShareholdersService } from '../../services/shareholders.service';
import { ProfitSettlement } from '../../models/profit-settlement.model';

/**
 * Read-only details for one executed profit settlement.
 *
 *   <app-profit-settlement-details-modal
 *     [open]="detailsOpen()"
 *     [settlementId]="detailsId()"
 *     (closed)="closeDetails()" />
 *
 * Fetches the full record (header + per-shareholder lines with their issued
 * voucher numbers) whenever it opens with an id. Voucher numbers are 70+ chars,
 * so they're shown shortened and copyable on click (`app-voucher-number`).
 */
@Component({
  selector: 'app-profit-settlement-details-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, ModalComponent, VoucherNumberComponent, CurrencyArPipe, DateArPipe],
  templateUrl: './profit-settlement-details-modal.component.html',
  styleUrl: './profit-settlement-details-modal.component.scss',
})
export class ProfitSettlementDetailsModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly settlementId = input<number | null>(null);

  // ── outputs ──
  readonly closed = output<void>();

  // ── deps ──
  private readonly service = inject(ShareholdersService);

  // ── state ──
  protected readonly settlement = signal<ProfitSettlement | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  // ── derived ──
  protected readonly lines = computed(() => this.settlement()?.lines ?? []);

  constructor() {
    effect(
      () => {
        const id = this.settlementId();
        if (!this.open() || id == null) return;
        this.load(id);
      },
      { allowSignalWrites: true },
    );
  }

  // ─────────── template handlers ───────────

  protected close(): void {
    this.closed.emit();
  }

  // ─────────── internals ───────────

  private load(id: number): void {
    this.settlement.set(null);
    this.error.set(null);
    this.loading.set(true);
    this.service.getSettlement(id).subscribe({
      next: (settlement) => {
        this.settlement.set(settlement);
        this.loading.set(false);
      },
      error: (err: ApiError) => {
        this.loading.set(false);
        this.error.set(err.message || 'تعذّر تحميل تفاصيل التوزيع');
      },
    });
  }
}
