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
import { firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';

import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { DateArPipe } from '../../../../shared/pipes/date-ar.pipe';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';
import { DialogService } from '../../../../core/services/dialog.service';
import { AuthService } from '../../../../core/services/auth.service';
import { PERMISSIONS } from '../../../../core/constants/permissions.const';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { fetchAllPages } from '../../../../core/utils/api-list.util';
import { PdfExportService } from '../../../../core/services/pdf-export.service';
import { formatPrintCurrency, formatPrintDate } from '../../../../core/utils/print-format.util';
import { WhatsappSendButtonComponent } from '../../../../shared/components/whatsapp-send-button/whatsapp-send-button.component';
import { formatMoneyAr, formatPercentAr } from '../../../../shared/utils/number-format.util';

import { ShareholdersService } from '../../services/shareholders.service';
import { Shareholder } from '../../models/shareholder.model';
import {
  ShareholderStatement,
  StatementEntry,
  StatementQuery,
  StatementTransactionType,
} from '../../models/shareholder-statement.model';
import {
  STATEMENT_TX_BADGE,
  STATEMENT_TX_LABELS,
  affectsCapital,
  canDeleteStatementEntry,
  isStatementInflow,
} from '../../constants/statement-transaction-labels';
import { ReinvestDistributedProfitModalComponent } from '../reinvest-distributed-profit-modal/reinvest-distributed-profit-modal.component';
import { WithdrawDistributedProfitModalComponent } from '../withdraw-distributed-profit-modal/withdraw-distributed-profit-modal.component';

const DEFAULT_PAGE_SIZE = 10;
const VOUCHER_PREFIX_LEN = 18;

@Component({
  selector: 'app-shareholder-statement-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    ModalComponent,
    PaginationComponent,
    BadgeComponent,
    CurrencyArPipe,
    DateArPipe,
    HasPermissionDirective,
    ReinvestDistributedProfitModalComponent,
    WithdrawDistributedProfitModalComponent,
    WhatsappSendButtonComponent,
  ],
  templateUrl: './shareholder-statement-modal.component.html',
  styleUrl: './shareholder-statement-modal.component.scss',
})
export class ShareholderStatementModalComponent {
  readonly open = input.required<boolean>();
  readonly shareholder = input<Shareholder | null>(null);
  readonly closed = output<void>();

  private readonly service = inject(ShareholdersService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  private readonly auth = inject(AuthService);
  private readonly pdf = inject(PdfExportService);

  /** Exposed so the template can gate write actions with `*appHasPermission`. */
  protected readonly PERMS = PERMISSIONS;

  /** Gates the ledger's actions column (header + cells must agree, so not via the directive). */
  protected readonly canManage = computed(() =>
    this.auth.hasPermission(PERMISSIONS.shareholdersFullAccess),
  );

  protected readonly statement = signal<ShareholderStatement | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  // ── date filters (UI state — applied on explicit click) ──
  protected readonly fromDate = signal('');
  protected readonly toDate = signal('');

  // ── distributed profit actions (child modals) ──
  protected readonly reinvestOpen = signal(false);
  protected readonly withdrawOpen = signal(false);

  /** Ledger row currently being deleted, for inline button state. */
  protected readonly deletingId = signal<number | null>(null);

  // ── pagination ──
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly count = signal(0);
  protected readonly totalPages = signal(0);

  // ── derived ──
  protected readonly title = computed(() => {
    const sh = this.shareholder();
    return sh ? `كشف حساب — ${sh.name}` : 'كشف حساب مساهم';
  });

  /**
   * Hero figures. The statement header is fetched alongside the ledger, so it
   * reflects writes made from inside this modal; the `shareholder` input (a
   * row from the parent list) is only the fallback until the first load.
   */
  protected readonly heroFigures = computed(() => {
    const fresh = this.statement()?.shareholder;
    const row = this.shareholder();
    return {
      contributedAmount: fresh?.contributedAmount ?? row?.contributedAmount ?? 0,
      ownedPercentage: fresh?.ownedPercentage ?? row?.ownedPercentage ?? 0,
      accruedProfit: fresh?.accruedProfit ?? row?.accruedProfit ?? 0,
    };
  });

  protected readonly distributedProfitBalance = computed(
    () => this.statement()?.distributedProfitBalance ?? 0,
  );

  /** Both reinvest and cash withdrawal draw from the same available balance. */
  protected readonly hasDistributedBalance = computed(
    () => !this.loading() && this.distributedProfitBalance() > 0,
  );

  private readonly childOpen = computed(
    () => this.reinvestOpen() || this.withdrawOpen(),
  );

  /** Parent modal must ignore Esc/backdrop while busy or while a child modal is on top. */
  protected readonly dismissible = computed(
    () => !this.loading() && !this.childOpen(),
  );

  protected readonly entries = computed(
    () => this.statement()?.entries.data ?? [],
  );

  protected readonly hasFilters = computed(
    () => !!this.fromDate() || !!this.toDate(),
  );

  private lastShId: number | null = null;

  constructor() {
    effect(
      () => {
        const sh = this.shareholder();
        if (!this.open() || !sh) return;
        if (sh.id === this.lastShId) return;
        this.lastShId = sh.id;
        this.reinvestOpen.set(false);
        this.withdrawOpen.set(false);
        this.statement.set(null);
        this.error.set(null);
        this.fromDate.set('');
        this.toDate.set('');
        this.pageIndex.set(1);
        this.fetch(sh.id, 1, this.pageSize(), false);
      },
      { allowSignalWrites: true },
    );
  }

  protected close(): void {
    if (this.childOpen()) return;
    this.closed.emit();
  }

  // ─────────── reinvest distributed profit ───────────

  protected openReinvest(): void {
    if (!this.hasDistributedBalance()) return;
    this.reinvestOpen.set(true);
  }

  protected closeReinvest(): void {
    this.reinvestOpen.set(false);
  }

  /**
   * Capital, ownership %, the distributed-profit card and the ledger all
   * change — reload the whole statement from the server (cache bypassed).
   */
  protected onReinvested(): void {
    this.reinvestOpen.set(false);
    this.refresh();
  }

  // ─────────── withdraw distributed profit (cash) ───────────

  protected openWithdraw(): void {
    if (!this.hasDistributedBalance()) return;
    this.withdrawOpen.set(true);
  }

  protected closeWithdraw(): void {
    this.withdrawOpen.set(false);
  }

  /** The distributed-profit card and the ledger change; capital does not. */
  protected onWithdrawn(): void {
    this.withdrawOpen.set(false);
    this.refresh();
  }

  // ─────────── cancel a reinvestment / withdrawal ───────────

  protected canDelete(e: StatementEntry): boolean {
    return canDeleteStatementEntry(e.transactionType);
  }

  protected async confirmDeleteEntry(e: StatementEntry): Promise<void> {
    const sh = this.shareholder();
    if (!sh || this.deletingId() != null) return;

    const isWithdrawal = e.transactionType === 'DistributedProfitWithdrawal';
    const ok = await this.dialog.confirm({
      title: 'إلغاء العملية',
      message: isWithdrawal
        ? `هل أنت متأكد من إلغاء ${this.txLabel(e.transactionType)} بمبلغ ${e.amount}؟ سيعود المبلغ إلى الخزينة وإلى رصيد الأرباح الموزعة المتاح.`
        : `هل أنت متأكد من إلغاء ${this.txLabel(e.transactionType)} بمبلغ ${e.amount}؟ سيُخصم المبلغ من رأس المال ويعود إلى رصيد الأرباح الموزعة المتاح.`,
      confirmText: 'حذف',
      cancelText: 'تراجع',
      type: 'danger',
    });
    if (!ok) return;

    this.deletingId.set(e.id);
    this.service.deleteCapitalTransaction(sh.id, e.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.toast.success('تم إلغاء العملية بنجاح');
        // Step back a page if we just emptied a non-first page; else reload in place.
        if (this.entries().length === 1 && this.pageIndex() > 1) {
          this.pageIndex.update((p) => p - 1);
        }
        this.refresh();
      },
      error: (err: ApiError) => {
        this.deletingId.set(null);
        this.toast.error(apiErrorToMessage(err, 'تعذّر إلغاء العملية'));
      },
    });
  }

  protected refresh(): void {
    const sh = this.shareholder();
    if (!sh) return;
    this.fetch(sh.id, this.pageIndex(), this.pageSize(), true);
  }

  protected applyDates(): void {
    const sh = this.shareholder();
    if (!sh) return;
    this.pageIndex.set(1);
    this.fetch(sh.id, 1, this.pageSize(), true);
  }

  protected clearDates(): void {
    this.fromDate.set('');
    this.toDate.set('');
    const sh = this.shareholder();
    if (!sh) return;
    this.pageIndex.set(1);
    this.fetch(sh.id, 1, this.pageSize(), true);
  }

  protected onPageChange(page: number): void {
    this.pageIndex.set(page);
    const sh = this.shareholder();
    if (sh) this.fetch(sh.id, page, this.pageSize(), false);
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(1);
    const sh = this.shareholder();
    if (sh) this.fetch(sh.id, 1, size, false);
  }

  protected txLabel(type: StatementTransactionType): string {
    return STATEMENT_TX_LABELS[type] ?? type;
  }

  protected txBadge(type: StatementTransactionType) {
    return STATEMENT_TX_BADGE[type] ?? 'info';
  }

  protected isInflow(type: StatementTransactionType): boolean {
    return isStatementInflow(type);
  }

  protected affectsCapital(type: StatementTransactionType): boolean {
    return affectsCapital(type);
  }

  protected shortVoucher(value: string | undefined): string {
    if (!value) return '—';
    return value.length > VOUCHER_PREFIX_LEN
      ? `${value.slice(0, VOUCHER_PREFIX_LEN)}…`
      : value;
  }

  // ─────────── whatsapp ───────────

  protected readonly whatsappCaption = computed(() => {
    const sh = this.shareholder();
    if (!sh) return '';
    const hero = this.heroFigures();
    return [
      `كشف حساب المساهم: ${sh.name}`,
      `رأس المال: ${formatMoneyAr(hero.contributedAmount)}`,
      `نسبة الملكية: ${formatPercentAr(hero.ownedPercentage)}`,
      `الأرباح المستحقة: ${formatMoneyAr(hero.accruedProfit)}`,
      `الأرباح الموزعة المتاحة: ${formatMoneyAr(this.distributedProfitBalance())}`,
    ].join('\n');
  });

  /** Full ledger (every page, current date filter) as a PDF file for WhatsApp. */
  protected readonly buildStatementPdf = async (): Promise<string> => {
    const sh = this.shareholder();
    if (!sh) throw new Error('No shareholder selected');

    const fromDate = this.fromDate() || undefined;
    const toDate = this.toDate() || undefined;
    const rows = await firstValueFrom(
      fetchAllPages<StatementEntry>((pageIndex, pageSize) =>
        this.service
          .refreshStatement(sh.id, { pageIndex, pageSize, fromDate, toDate })
          .pipe(map((res) => res.entries)),
      ),
    );

    const hero = this.heroFigures();
    const st = this.statement();
    const header = st?.shareholder;

    return this.pdf.renderReport<StatementEntry>({
      title: 'كشف حساب مساهم',
      subtitle: sh.name,
      orientation: 'landscape',
      fields: [
        { label: 'المساهم', value: sh.name },
        { label: 'الهاتف', value: sh.phoneNumber },
        { label: 'العنوان', value: sh.address },
        { label: 'خزينة رأس المال', value: header?.capitalTreasuryName ?? sh.capitalTreasuryName ?? '—' },
        {
          label: 'الفترة',
          value: fromDate || toDate
            ? `${fromDate ? formatPrintDate(fromDate) : 'البداية'} ← ${toDate ? formatPrintDate(toDate) : 'اليوم'}`
            : 'كل الحركات',
        },
      ],
      metrics: [
        { label: 'رأس المال', value: formatPrintCurrency(hero.contributedAmount), emphasis: true },
        { label: 'نسبة الملكية', value: formatPercentAr(hero.ownedPercentage), tone: 'accent' },
        { label: 'الأرباح المستحقة', value: formatPrintCurrency(hero.accruedProfit), tone: 'positive' },
        { label: 'الأرباح الموزعة المتاحة', value: formatPrintCurrency(this.distributedProfitBalance()) },
        ...(st ? [{ label: 'إجمالي الأرباح الموزعة', value: formatPrintCurrency(st.totalProfitDistributed) }] : []),
      ],
      table: {
        caption: `الحركات (${rows.length.toLocaleString('ar-EG')})`,
        emptyMessage: 'لا توجد حركات في هذه الفترة',
        rows,
        columns: [
          { key: 'date', header: 'التاريخ', align: 'center', format: 'shortDate', width: '10%' },
          { key: 'transactionType', header: 'النوع', align: 'center', width: '15%', format: (v) => this.txLabel(v as StatementTransactionType) },
          {
            key: 'amount',
            header: 'المبلغ',
            align: 'end',
            bold: true,
            width: '12%',
            format: (v, row) => `${this.isInflow(row.transactionType) ? '+' : '−'} ${formatPrintCurrency(v)}`,
          },
          { key: 'shareholderShare', header: 'نصيب المساهم', align: 'end', format: 'currency', width: '11%' },
          { key: 'companyShare', header: 'نصيب الشركة', align: 'end', format: 'currency', width: '11%' },
          {
            key: 'capitalBalanceAfter',
            header: 'رأس المال بعد',
            align: 'end',
            width: '12%',
            format: (v, row) => (this.affectsCapital(row.transactionType) ? formatPrintCurrency(v) : '—'),
          },
          { key: 'treasuryName', header: 'الخزينة', align: 'start', width: '12%' },
          { key: (row) => row.notes || '—', header: 'ملاحظات', align: 'start' },
        ],
      },
    });
  };

  private fetch(
    shId: number,
    pageIndex: number,
    pageSize: number,
    force: boolean,
  ): void {
    this.loading.set(true);
    this.error.set(null);

    const query: StatementQuery = {
      pageIndex,
      pageSize,
      fromDate: this.fromDate() || undefined,
      toDate: this.toDate() || undefined,
    };

    const stream$ = force
      ? this.service.refreshStatement(shId, query)
      : this.service.getStatement(shId, query);

    stream$.subscribe({
      next: (res) => {
        this.statement.set(res);
        this.count.set(res.entries.count ?? 0);
        this.totalPages.set(res.entries.totalPages ?? 0);
        this.loading.set(false);
      },
      error: (err: ApiError) => {
        this.statement.set(null);
        this.count.set(0);
        this.totalPages.set(0);
        this.error.set(err?.message || 'تعذّر تحميل كشف الحساب');
        this.loading.set(false);
        this.toast.error(err?.message || 'تعذّر تحميل كشف الحساب');
      },
    });
  }
}
