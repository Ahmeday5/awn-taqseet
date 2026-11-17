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
import { map } from 'rxjs';

import { ShareholdersService } from '../../services/shareholders.service';
import {
  CapitalClassificationStatement,
  CapitalClassificationStatementEntry,
} from '../../models/capital-classification.model';
import { buildClassificationWhatsappMessage } from '../../constants/classification-whatsapp.util';

import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { DateArPipe } from '../../../../shared/pipes/date-ar.pipe';
import {
  DateRange,
  EMPTY_DATE_RANGE,
  hasDateRange,
  periodLabel,
  withPeriod,
} from '../../../../shared/utils/period-label.util';
import { reserveWhatsappShare } from '../../../../shared/utils/whatsapp-share.util';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { fetchAllPages } from '../../../../core/utils/api-list.util';

const DEFAULT_PAGE_SIZE = 10;

/**
 * كشف حساب التصنيف — every capital movement tagged with one classification,
 * newest first. Net balance and running balance may be negative (shown red).
 */
@Component({
  selector: 'app-capital-classification-statement',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PaginationComponent, CurrencyArPipe, DateArPipe],
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
  /** Fetching every page for the WhatsApp message. */
  protected readonly sharing = signal(false);

  protected readonly classificationId = computed(() => Number(this.id()) || 0);
  protected readonly entries = computed(() => this.statement()?.entries.data ?? []);
  protected readonly count = computed(() => this.statement()?.entries.count ?? 0);
  protected readonly totalPages = computed(() => this.statement()?.entries.totalPages ?? 0);
  protected readonly hasFilters = computed(() => !!this.fromDate() || !!this.toDate());

  /**
   * Serial of the first row on the shown page — rows are numbered 1, 2, 3…
   * in statement order across pages (taken from the loaded page, so numbers
   * stay right while the next page is still loading).
   */
  protected readonly rowOffset = computed(() => {
    const page = this.statement()?.entries;
    return Math.max(0, ((page?.pageIndex ?? 1) - 1) * (page?.pageSize ?? this.pageSize()));
  });
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

  /**
   * Shares the full statement on WhatsApp — every movement of the applied
   * period (all pages, not the draft inputs), numbered like the table, plus
   * the totals.
   */
  protected shareOnWhatsapp(): void {
    const st = this.statement();
    const id = this.classificationId();
    if (!st || !id || this.sharing()) return;

    // Reserved inside the click so the popup isn't blocked after the fetch.
    const share = reserveWhatsappShare();
    const range = this.appliedRange();
    this.sharing.set(true);

    fetchAllPages<CapitalClassificationStatementEntry>((pageIndex, pageSize) =>
      this.service
        .getClassificationStatement(
          id,
          {
            pageIndex,
            pageSize,
            fromDate: range.fromDate || undefined,
            toDate: range.toDate || undefined,
          },
          true,
        )
        .pipe(map((res) => res.entries)),
    ).subscribe({
      next: (entries) => {
        this.sharing.set(false);
        share.send(buildClassificationWhatsappMessage(st, entries, range));
      },
      error: (err: ApiError) => {
        this.sharing.set(false);
        share.cancel();
        this.toast.error(apiErrorToMessage(err, 'تعذّر تجهيز كشف الحساب للمشاركة'));
      },
    });
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
