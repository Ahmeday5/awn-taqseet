import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { ShareholdersService } from '../../services/shareholders.service';
import { CapitalClassificationStatement } from '../../models/capital-classification.model';

import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { DateArPipe } from '../../../../shared/pipes/date-ar.pipe';
import { VoucherNumberComponent } from '../../../../shared/components/voucher-number/voucher-number.component';
import {
  DateRange,
  EMPTY_DATE_RANGE,
  hasDateRange,
  periodLabel,
  withPeriod,
} from '../../../../shared/utils/period-label.util';
import { formatMoneyAr } from '../../../../shared/utils/number-format.util';
import { openWhatsappShare } from '../../../../shared/utils/whatsapp-share.util';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';

const DEFAULT_PAGE_SIZE = 10;

/**
 * WhatsApp summary of a classification statement. A classification has no
 * owner or phone, so it is shared as text and the user picks the recipient.
 */
export function buildClassificationWhatsappMessage(
  st: CapitalClassificationStatement,
  range: DateRange,
): string {
  const period = periodLabel(range);
  return [
    `*كشف حساب تصنيف — ${st.classification?.name ?? ''}*`,
    `الفترة: ${period || 'كل الحركات'}`,
    '',
    `إجمالي الإيداعات: ${formatMoneyAr(st.totalDeposits)}`,
    `إجمالي السحوبات: ${formatMoneyAr(st.totalWithdrawals)}`,
    `${withPeriod('صافي الرصيد', range)}: ${formatMoneyAr(st.netBalance)}`,
    `عدد الحركات: ${(st.entries?.count ?? 0).toLocaleString('ar-EG')}`,
  ].join('\n');
}

/**
 * كشف حساب التصنيف — every capital movement tagged with one classification,
 * newest first. Net balance and running balance may be negative (shown red).
 */
@Component({
  selector: 'app-capital-classification-statement',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PaginationComponent, VoucherNumberComponent, CurrencyArPipe, DateArPipe],
  templateUrl: './capital-classification-statement.component.html',
  styleUrl: './capital-classification-statement.component.scss',
})
export class CapitalClassificationStatementComponent {
  /** Route param, bound via `withComponentInputBinding`. */
  readonly id = input.required<string>();

  private readonly service = inject(ShareholdersService);
  private readonly toast = inject(ToastService);

  protected readonly statement = signal<CapitalClassificationStatement | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly fromDate = signal('');
  protected readonly toDate = signal('');
  /** The range the shown totals were fetched with — totals are scoped to it by the API. */
  private readonly appliedRange = signal<DateRange>(EMPTY_DATE_RANGE);
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);

  protected readonly classificationId = computed(() => Number(this.id()) || 0);
  protected readonly entries = computed(() => this.statement()?.entries.data ?? []);
  protected readonly count = computed(() => this.statement()?.entries.count ?? 0);
  protected readonly totalPages = computed(() => this.statement()?.entries.totalPages ?? 0);
  protected readonly hasFilters = computed(() => !!this.fromDate() || !!this.toDate());
  protected readonly isPeriodApplied = computed(() => hasDateRange(this.appliedRange()));
  protected readonly periodText = computed(() => periodLabel(this.appliedRange()));
  protected readonly netTitle = computed(() => withPeriod('صافي الرصيد', this.appliedRange()));

  protected readonly title = computed(
    () => this.statement()?.classification?.name ?? 'كشف حساب التصنيف',
  );

  constructor() {
    effect(() => {
      const id = this.classificationId();
      if (!id) return;
      untracked(() => {
        this.fromDate.set('');
        this.toDate.set('');
        this.appliedRange.set(EMPTY_DATE_RANGE);
        this.pageIndex.set(1);
        this.statement.set(null);
        this.fetch(false);
      });
    });
  }

  /** Summary of what is on screen — the applied period, not the draft inputs. */
  protected shareOnWhatsapp(): void {
    const st = this.statement();
    if (!st) return;
    openWhatsappShare(buildClassificationWhatsappMessage(st, this.appliedRange()));
  }

  protected applyDates(): void {
    this.pageIndex.set(1);
    this.fetch(true);
  }

  protected clearDates(): void {
    this.fromDate.set('');
    this.toDate.set('');
    this.applyDates();
  }

  protected refresh(): void {
    this.fetch(true);
  }

  protected onPageChange(page: number): void {
    this.pageIndex.set(page);
    this.fetch(false);
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(1);
    this.fetch(false);
  }

  private fetch(force: boolean): void {
    const id = this.classificationId();
    if (!id) return;
    this.loading.set(true);
    this.error.set(null);
    const range = {
      fromDate: this.fromDate() || undefined,
      toDate: this.toDate() || undefined,
    } satisfies DateRange;
    this.service
      .getClassificationStatement(
        id,
        { pageIndex: this.pageIndex(), pageSize: this.pageSize(), ...range },
        force,
      )
      .subscribe({
        next: (res) => {
          this.statement.set(res);
          this.appliedRange.set(range);
          this.loading.set(false);
        },
        error: (err: ApiError) => {
          const msg = apiErrorToMessage(err, 'تعذّر تحميل كشف حساب التصنيف');
          this.statement.set(null);
          this.error.set(msg);
          this.loading.set(false);
          this.toast.error(msg);
        },
      });
  }
}
