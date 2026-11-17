import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';

import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { VoucherNumberComponent } from '../../../../shared/components/voucher-number/voucher-number.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { MoneyArPipe } from '../../../../shared/pipes/money-ar.pipe';
import { DateArPipe } from '../../../../shared/pipes/date-ar.pipe';
import {
  DateRange,
  EMPTY_DATE_RANGE,
  hasDateRange,
  periodLabel,
  withPeriod,
} from '../../../../shared/utils/period-label.util';
import { formatMoneyAr } from '../../../../shared/utils/number-format.util';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';
import { DialogService } from '../../../../core/services/dialog.service';
import { AuthService } from '../../../../core/services/auth.service';
import { PERMISSIONS } from '../../../../core/constants/permissions.const';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';

import { ShareholdersService } from '../../services/shareholders.service';
import {
  CompanyProfitStatement,
  CompanyProfitStatementQuery,
} from '../../models/company-profit-statement.model';
import { CompanyBalanceTxEditTarget } from '../../models/shareholder.model';
import {
  CompanyProfitEntryRow,
  TRANSFER_BADGE,
  companyBalanceTxKind,
  companyBalanceTxSource,
  toCompanyBalanceEditTarget,
  toCompanyProfitEntryRow,
} from '../../constants/company-profit-labels';
import { CompanyBalanceModalComponent } from '../company-balance-modal/company-balance-modal.component';

const DEFAULT_PAGE_SIZE = 10;

/** Smallest balance gap worth flagging — anything below is rounding noise. */
const DIFFERENCE_THRESHOLD = 0.01;

/**
 * كشف حساب الشركة — every movement of the company balance: settlements,
 * capitalisations, manual deposits/withdrawals, treasury transfers and the
 * company's consolidated profit-share vouchers.
 *
 * `isEditable` lines (manual movements, payment vouchers, legacy transfers)
 * can be edited or deleted from here; both echo the line's `source`. Totals
 * and net balance follow the applied period; the current balance and the
 * pending profit never do.
 */
@Component({
  selector: 'app-company-profit-statement-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ModalComponent,
    PaginationComponent,
    BadgeComponent,
    VoucherNumberComponent,
    CompanyBalanceModalComponent,
    CurrencyArPipe,
    MoneyArPipe,
    DateArPipe,
  ],
  templateUrl: './company-profit-statement-modal.component.html',
  styleUrl: './company-profit-statement-modal.component.scss',
})
export class CompanyProfitStatementModalComponent {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  private readonly service = inject(ShareholdersService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  private readonly auth = inject(AuthService);

  /** Gates the actions column (header + cells must agree, so not via the directive). */
  protected readonly canManage = computed(() =>
    this.auth.hasPermission(PERMISSIONS.shareholdersFullAccess),
  );

  protected readonly statement = signal<CompanyProfitStatement | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  // ── date filters (draft inputs — applied on explicit click) ──
  protected readonly fromDate = signal('');
  protected readonly toDate = signal('');
  /** The range the shown figures were actually fetched with. */
  private readonly appliedRange = signal<DateRange>(EMPTY_DATE_RANGE);

  // ── pagination ──
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly count = signal(0);
  protected readonly totalPages = signal(0);

  // ── edit / delete ──
  protected readonly editOpen = signal(false);
  protected readonly editTarget = signal<CompanyBalanceTxEditTarget | null>(null);
  protected readonly deletingKey = signal<string | null>(null);

  // ── derived ──
  protected readonly transferBadge = TRANSFER_BADGE;

  protected readonly rows = computed(() =>
    (this.statement()?.entries.data ?? []).map(toCompanyProfitEntryRow),
  );

  /** Actions column only when the user may act AND the page has something editable. */
  protected readonly showActions = computed(
    () => this.canManage() && this.rows().some((r) => r.entry.isEditable),
  );
  protected readonly columnCount = computed(() => (this.showActions() ? 11 : 10));

  /**
   * Non-null only when the balance isn't explained by the movements
   * (always computed over every movement). Expected to be 0.
   */
  protected readonly unexplainedDifference = computed(() => {
    const diff = this.statement()?.unexplainedDifference ?? 0;
    return Math.abs(diff) >= DIFFERENCE_THRESHOLD ? diff : null;
  });

  protected readonly hasFilters = computed(
    () => !!this.fromDate() || !!this.toDate(),
  );
  protected readonly isPeriodApplied = computed(() => hasDateRange(this.appliedRange()));
  protected readonly periodText = computed(() => periodLabel(this.appliedRange()));
  protected readonly netTitle = computed(() => withPeriod('صافي الرصيد', this.appliedRange()));
  protected readonly netBalance = computed(() => {
    const st = this.statement();
    if (!st) return 0;
    return st.netBalance ?? st.totalReceived - st.totalPaid;
  });

  /** Parent modal must ignore Esc/backdrop while busy or while the edit modal is on top. */
  protected readonly dismissible = computed(() => !this.loading() && !this.editOpen());

  constructor() {
    // Fresh on every open: the company balance moves with every booked
    // profit, not only with writes made from this screen.
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.editOpen.set(false);
        this.fetch(this.pageIndex(), this.pageSize(), true);
      });
    });
  }

  protected close(): void {
    if (this.editOpen()) return;
    this.closed.emit();
  }

  protected refresh(): void {
    this.fetch(this.pageIndex(), this.pageSize(), true);
  }

  protected applyDates(): void {
    this.pageIndex.set(1);
    this.fetch(1, this.pageSize(), true);
  }

  protected clearDates(): void {
    this.fromDate.set('');
    this.toDate.set('');
    this.pageIndex.set(1);
    this.fetch(1, this.pageSize(), true);
  }

  protected onPageChange(page: number): void {
    this.pageIndex.set(page);
    this.fetch(page, this.pageSize(), false);
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(1);
    this.fetch(1, size, false);
  }

  // ─────────── edit ───────────

  protected openEdit(row: CompanyProfitEntryRow): void {
    if (!row.entry.isEditable) return;
    this.editTarget.set(toCompanyBalanceEditTarget(row.entry));
    this.editOpen.set(true);
  }

  protected closeEdit(): void {
    this.editOpen.set(false);
  }

  protected onEdited(): void {
    this.editOpen.set(false);
    this.afterChange();
  }

  // ─────────── delete ───────────

  protected async confirmDelete(row: CompanyProfitEntryRow): Promise<void> {
    const e = row.entry;
    if (!e.isEditable || this.deletingKey() !== null) return;

    const kind = this.deleteKindLabel(row);
    const treasury = e.counterpartyTreasuryName && companyBalanceTxKind(e) !== 'payment'
      ? (row.inflow ? ` وسيُخصم من خزينة "${e.counterpartyTreasuryName}"` : ` وسيعود إلى خزينة "${e.counterpartyTreasuryName}"`)
      : '';
    const ok = await this.dialog.confirm({
      title: `حذف ${kind}`,
      message:
        `هل أنت متأكد من حذف ${kind} بمبلغ ${formatMoneyAr(e.amount)}؟ ` +
        `سيتم عكس الأثر على رصيد الشركة${treasury}. هذا الإجراء لا يمكن التراجع عنه.`,
      confirmText: 'حذف',
      cancelText: 'إلغاء',
      type: 'danger',
    });
    if (!ok) return;

    this.deletingKey.set(row.key);
    this.service.deleteCompanyBalanceTransaction(e.id, companyBalanceTxSource(e)).subscribe({
      next: () => {
        this.deletingKey.set(null);
        this.toast.success(`تم حذف ${kind} بنجاح`);
        // Step back a page if we just emptied a non-first page.
        if (this.rows().length === 1 && this.pageIndex() > 1) {
          this.pageIndex.update((p) => p - 1);
        }
        this.afterChange();
      },
      error: (err: ApiError) => {
        this.deletingKey.set(null);
        this.toast.error(apiErrorToMessage(err, 'تعذّر حذف العملية'));
      },
    });
  }

  // ─────────── internals ───────────

  private deleteKindLabel(row: CompanyProfitEntryRow): string {
    switch (companyBalanceTxKind(row.entry)) {
      case 'transfer':
        return 'التحويل';
      case 'payment':
        return 'سند الصرف';
      default:
        return row.inflow ? 'عملية الإيداع' : 'عملية السحب';
    }
  }

  /**
   * Reloads the statement. The shareholders summary refreshes on its own:
   * the write invalidated the `shareholder` cache scope, which the
   * shareholders page listens to.
   */
  private afterChange(): void {
    this.refresh();
  }

  private fetch(pageIndex: number, pageSize: number, force: boolean): void {
    this.loading.set(true);
    this.error.set(null);

    const query: CompanyProfitStatementQuery = {
      pageIndex,
      pageSize,
      fromDate: this.fromDate() || undefined,
      toDate: this.toDate() || undefined,
    };

    const stream$ = force
      ? this.service.refreshCompanyProfitStatement(query)
      : this.service.getCompanyProfitStatement(query);

    stream$.subscribe({
      next: (res) => {
        this.statement.set(res);
        this.appliedRange.set({ fromDate: query.fromDate, toDate: query.toDate });
        this.count.set(res.entries?.count ?? 0);
        this.totalPages.set(res.entries?.totalPages ?? 0);
        this.loading.set(false);
      },
      error: (err: ApiError) => {
        const msg = apiErrorToMessage(err, 'تعذّر تحميل كشف الحساب');
        this.statement.set(null);
        this.count.set(0);
        this.totalPages.set(0);
        this.error.set(msg);
        this.loading.set(false);
        this.toast.error(msg);
      },
    });
  }
}
