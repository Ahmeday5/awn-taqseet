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
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { catchError, of } from 'rxjs';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { BadgeComponent, BadgeType } from '../../../../shared/components/badge/badge.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select.component';
import { ApiError } from '../../../../core/models/api-response.model';
import { AuthService } from '../../../../core/services/auth.service';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { RepsService } from '../../../reps/services/reps.service';
import { SuppliersService } from '../../services/suppliers.service';
import {
  Supplier,
  SupplierStatement,
  SupplierStatementInvoice,
  SupplierStatementInvoiceStatus,
  SupplierStatementPayment,
  SupplierStatementQuery,
} from '../../models/supplier.model';
import { SupplierPaymentModalComponent } from '../supplier-payment-modal/supplier-payment-modal.component';
import { PrintConfig, PrintService } from '../../../../core/services/print.service';
import { WhatsappSendButtonComponent } from '../../../../shared/components/whatsapp-send-button/whatsapp-send-button.component';
import { formatMoneyAr } from '../../../../shared/utils/number-format.util';
import { PdfExportService } from '../../../../core/services/pdf-export.service';
import { reportFromPrintConfig } from '../../../../core/pdf/pdf-report.template';
import { formatPrintCurrency } from '../../../../core/utils/print-format.util';

const STATUS_BADGE: Record<SupplierStatementInvoiceStatus, BadgeType> = {
  Draft: 'info',
  Pending: 'warn',
  PartiallyPaid: 'warn',
  Paid: 'ok',
  Confirmed: 'ok',
  Cancelled: 'bad',
};

const STATUS_LABEL: Record<SupplierStatementInvoiceStatus, string> = {
  Draft: 'مسودة',
  Pending: 'بانتظار الدفع',
  PartiallyPaid: 'مدفوعة جزئيًا',
  Paid: 'مسددة',
  Confirmed: 'مؤكدة',
  Cancelled: 'ملغاة',
};

/** A movement with no representative was made by the admin. */
const ADMIN_LABEL = 'الإدارة';

/** `representativeId=0` scopes the statement to the admin's own movements. */
const ADMIN_REPRESENTATIVE_ID = 0;

@Component({
  selector: 'app-supplier-statement-modal',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DecimalPipe,
    ModalComponent,
    CurrencyArPipe,
    BadgeComponent,
    SearchableSelectComponent,
    WhatsappSendButtonComponent,
    SupplierPaymentModalComponent,
  ],
  templateUrl: './supplier-statement-modal.component.html',
  styleUrl: './supplier-statement-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierStatementModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly supplier = input<Supplier | null>(null);

  // ── outputs ──
  readonly closed = output<void>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(SuppliersService);
  private readonly printer = inject(PrintService);
  private readonly pdf = inject(PdfExportService);
  private readonly auth = inject(AuthService);
  private readonly reps = inject(RepsService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);

  /** A Representative always sees only their own account — no filter. */
  protected readonly canFilterByRepresentative = computed(
    () => !this.auth.hasRole('Representative'),
  );
  protected readonly representativeOptions = signal<SearchableSelectOption[]>([]);
  private representativesLoaded = false;

  // ── payment edit / delete ──
  protected readonly editPayment = signal<SupplierStatementPayment | null>(null);
  protected readonly deletingPaymentId = signal<number | null>(null);

  // ── reactive state ──
  protected readonly statement = signal<SupplierStatement | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Set of expanded invoice ids — controls per-row item visibility. */
  protected readonly expanded = signal<ReadonlySet<number>>(new Set<number>());

  // ── filter form ──
  protected readonly form = this.fb.nonNullable.group({
    from: [''],
    to: [''],
    includeDrafts: [false],
    representativeId: this.fb.control<number | null>(null),
  });

  // ── derived ──
  protected readonly hasStatement = computed(() => this.statement() !== null);
  protected readonly invoicesCount = computed(
    () => this.statement()?.summary.invoicesCount ?? 0,
  );

  /**
   * Quick health indicator: ratio of paid-to-total. Used to render the
   * progress bar in the hero. Returns 0 when there's nothing purchased
   * (avoids NaN on first load).
   */
  protected readonly paidRatio = computed(() => {
    const s = this.statement()?.summary;
    if (!s || !s.totalPurchases) return 0;
    return Math.min(100, (s.totalPaid / s.totalPurchases) * 100);
  });

  /** Resolved title for the modal — supplier name, plus the representative when scoped to one. */
  protected readonly title = computed(() => {
    const s = this.supplier();
    if (!s) return 'كشف حساب المورد';
    const rep = this.statement()?.representative;
    return rep ? `كشف حساب — ${s.fullName} — المندوب ${rep.name}` : `كشف حساب — ${s.fullName}`;
  });

  /** Actions column only when at least one direct payment can be edited or deleted. */
  protected readonly showPaymentActions = computed(() =>
    (this.statement()?.payments ?? []).some((p) => p.canEdit || p.canDelete),
  );

  /** The statement must stay put while the edit modal is on top or a delete runs. */
  protected readonly dismissible = computed(
    () => !this.loading() && !this.editPayment() && this.deletingPaymentId() === null,
  );

  // ── debounce ──
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Refetch whenever the modal opens for a different supplier, or
    // when any filter changes (debounced).
    effect(
      () => {
        if (!this.open()) return;
        const supplier = this.supplier();
        if (!supplier) return;

        // First-open reset so reopening for the same supplier doesn't
        // surface a stale draft toggle from the previous session.
        this.resetIfNewSupplier(supplier.id);
        this.loadRepresentatives();
        this.fetch(supplier.id, this.currentQuery(), false);
      },
      { allowSignalWrites: true },
    );

    // Live debounce on form changes.
    this.form.valueChanges.subscribe(() => {
      const supplier = this.supplier();
      if (!supplier || !this.open()) return;
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.fetch(supplier.id, this.currentQuery(), false);
      }, 300);
    });
  }

  // ─────────── template handlers ───────────

  protected close(): void {
    if (!this.dismissible()) return;
    this.closed.emit();
  }

  protected refresh(): void {
    const supplier = this.supplier();
    if (!supplier) return;
    this.fetch(supplier.id, this.currentQuery(), true);
  }

  protected resetFilters(): void {
    this.form.reset({ from: '', to: '', includeDrafts: false, representativeId: null });
  }

  protected representativeLabel(name: string | null | undefined): string {
    return name || ADMIN_LABEL;
  }

  // ─────────── direct payment edit / delete ───────────

  protected openEditPayment(payment: SupplierStatementPayment): void {
    if (!payment.canEdit) return;
    this.editPayment.set(payment);
  }

  protected closeEditPayment(): void {
    this.editPayment.set(null);
  }

  /** Invoice statuses and remaining amounts move with the payment — reload. */
  protected onPaymentEdited(): void {
    this.editPayment.set(null);
    this.refresh();
  }

  protected async confirmDeletePayment(payment: SupplierStatementPayment): Promise<void> {
    const supplier = this.supplier();
    if (!supplier || !payment.canDelete || this.deletingPaymentId() !== null) return;

    const ok = await this.dialog.confirm({
      title: 'حذف دفعة المورد',
      message:
        `هل أنت متأكد من حذف الدفعة رقم ${payment.voucherNumber} بمبلغ ${formatMoneyAr(payment.amount)}؟ ` +
        'سيعود المبلغ إلى الخزنة وتُعاد حالة الفواتير التي سددتها. هذا الإجراء لا يمكن التراجع عنه.',
      confirmText: 'حذف',
      cancelText: 'إلغاء',
      type: 'danger',
    });
    if (!ok) return;

    this.deletingPaymentId.set(payment.id);
    this.service.deletePayment(supplier.id, payment.id).subscribe({
      next: () => {
        this.deletingPaymentId.set(null);
        this.toast.success('تم حذف الدفعة بنجاح');
        this.refresh();
      },
      error: (err: ApiError) => {
        this.deletingPaymentId.set(null);
        this.toast.error(apiErrorToMessage(err, 'تعذّر حذف الدفعة'));
      },
    });
  }

  protected toggleInvoice(id: number): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  protected isExpanded(id: number): boolean {
    return this.expanded().has(id);
  }

  protected statusBadge(status: SupplierStatementInvoiceStatus): BadgeType {
    return STATUS_BADGE[status] ?? 'info';
  }

  protected statusLabel(status: SupplierStatementInvoiceStatus): string {
    return STATUS_LABEL[status] ?? status;
  }

  /** Locale-aware short date — falls back to `—` for missing/invalid input. */
  protected formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  /** Sum of `lineTotal` across invoice items. */
  protected itemsTotal(items: { lineTotal: number }[]): number {
    return items.reduce((sum, it) => sum + (it.lineTotal ?? 0), 0);
  }

  /** Sum of standalone payment amounts. */
  protected paymentsTotal(payments: SupplierStatementPayment[]): number {
    return payments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  }

  /**
   * Exports the supplier statement as a professional PDF via the unified
   * {@link PrintService}. The statement is already fully loaded in memory
   * (no extra fetch needed), so this is a synchronous render.
   */
  protected print(): void {
    const config = this.buildPrintConfig();
    if (config) this.printer.print(config);
  }

  // ─────────── whatsapp ───────────

  protected readonly whatsappCaption = computed(() => {
    const s = this.statement();
    const supplier = this.supplier();
    if (!s || !supplier) return '';
    return [
      `كشف حساب المورد: ${supplier.fullName}`,
      `إجمالي المشتريات: ${formatMoneyAr(s.summary.totalPurchases)}`,
      `المدفوع: ${formatMoneyAr(s.summary.totalPaid)}`,
      `المتبقي: ${formatMoneyAr(s.summary.totalRemaining)}`,
    ].join('\n');
  });

  /** Same report as the printout, as a PDF file for WhatsApp. */
  protected readonly buildStatementPdf = (): Promise<string> => {
    const config = this.buildPrintConfig();
    const s = this.statement();
    if (!config || !s) return Promise.reject(new Error('Statement not loaded'));
    return this.pdf.renderReport(reportFromPrintConfig(config, {
      caption: `الفواتير (${s.summary.invoicesCount.toLocaleString('ar-EG')})`,
      metrics: [
        { label: 'إجمالي المشتريات', value: formatPrintCurrency(s.summary.totalPurchases), emphasis: true },
        { label: 'المدفوع', value: formatPrintCurrency(s.summary.totalPaid), tone: 'positive' },
        { label: 'المتبقي', value: formatPrintCurrency(s.summary.totalRemaining), tone: s.summary.totalRemaining > 0 ? 'negative' : 'positive' },
        { label: 'عدد الفواتير', value: s.summary.invoicesCount.toLocaleString('ar-EG') },
      ],
    }));
  };

  private buildPrintConfig(): PrintConfig<SupplierStatementInvoice> | null {
    const s = this.statement();
    const supplier = this.supplier();
    if (!s || !supplier) return null;

    const meta: Array<{ label: string; value: string }> = [
      { label: 'المورد', value: supplier.fullName },
    ];
    if (s.representative) meta.push({ label: 'المندوب', value: s.representative.name });
    if (s.period.from) meta.push({ label: 'من تاريخ', value: this.formatDate(s.period.from) });
    if (s.period.to)   meta.push({ label: 'إلى تاريخ', value: this.formatDate(s.period.to) });
    meta.push({ label: 'عدد الفواتير', value: String(s.summary.invoicesCount) });
    if (s.summary.standalonePaidTotal > 0) {
      meta.push({
        label: 'مدفوع مباشر',
        value: `${Math.round(s.summary.standalonePaidTotal).toLocaleString('ar-EG')} ج.م`,
      });
    }

    return {
      title: 'كشف حساب المورد',
      subtitle: supplier.fullName,
      meta,
      orientation: 'landscape',
      columns: [
        { key: 'invoiceNumber',  header: 'رقم الفاتورة', align: 'center', bold: true },
        { key: 'invoiceDate',    header: 'تاريخ الفاتورة', align: 'center', format: 'shortDate' },
        { key: 'dueDate',        header: 'الاستحقاق',     align: 'center', format: 'shortDate' },
        {
          key: 'representativeName',
          header: 'المندوب',
          align: 'center',
          format: (v) => this.representativeLabel(v as string | null),
        },
        {
          key: 'status',
          header: 'الحالة',
          align: 'center',
          format: (v) => STATUS_LABEL[v as SupplierStatementInvoiceStatus] ?? String(v),
        },
        { key: 'subtotal',        header: 'الصافي',      align: 'end', format: 'currency' },
        { key: 'discountAmount',  header: 'الخصم',       align: 'end', format: 'currency' },
        { key: 'taxAmount',       header: 'الضريبة',     align: 'end', format: 'currency' },
        { key: 'totalAmount',     header: 'الإجمالي',    align: 'end', format: 'currency', bold: true },
        { key: 'paidAmount',      header: 'المدفوع',     align: 'end', format: 'currency' },
        { key: 'remainingAmount', header: 'المتبقي',     align: 'end', format: 'currency', bold: true },
      ],
      totals: {
        label: 'الإجمالي',
        labelColSpan: 8,
        cells: [
          `${Math.round(s.summary.totalPurchases).toLocaleString('ar-EG')} ج.م`,
          `${Math.round(s.summary.totalPaid).toLocaleString('ar-EG')} ج.م`,
          `${Math.round(s.summary.totalRemaining).toLocaleString('ar-EG')} ج.م`,
        ],
      },
      rows: s.invoices,
    };
  }

  // ─────────── internals ───────────

  private currentQuery(): SupplierStatementQuery {
    const raw = this.form.getRawValue();
    return {
      from: raw.from?.trim() || undefined,
      to: raw.to?.trim() || undefined,
      includeDrafts: !!raw.includeDrafts,
      representativeId: this.canFilterByRepresentative() ? raw.representativeId : null,
    };
  }

  /** Filter choices: "all" is the empty selection, then the admin, then each representative. */
  private loadRepresentatives(): void {
    if (!this.canFilterByRepresentative() || this.representativesLoaded) return;
    this.representativesLoaded = true;
    this.reps
      .lookup()
      .pipe(catchError(() => of([])))
      .subscribe((list) =>
        this.representativeOptions.set([
          { value: ADMIN_REPRESENTATIVE_ID, label: ADMIN_LABEL },
          ...list.map((r) => ({ value: r.id, label: r.name })),
        ]),
      );
  }

  /**
   * Track the last-opened supplier so we can wipe filters + cached
   * statement when the user opens the modal for a different one.
   */
  private lastSupplierId: number | null = null;

  private resetIfNewSupplier(id: number): void {
    if (this.lastSupplierId === id) return;
    this.lastSupplierId = id;
    this.statement.set(null);
    this.error.set(null);
    this.expanded.set(new Set<number>());
    this.editPayment.set(null);
    this.form.reset(
      { from: '', to: '', includeDrafts: false, representativeId: null },
      { emitEvent: false },
    );
  }

  private fetch(
    supplierId: number,
    query: SupplierStatementQuery,
    force: boolean,
  ): void {
    this.loading.set(true);
    this.error.set(null);

    const stream$ = force
      ? this.service.refreshStatement(supplierId, query)
      : this.service.statement(supplierId, query);

    stream$.subscribe({
      next: (res) => {
        this.statement.set(res);
        this.loading.set(false);
      },
      error: (err: ApiError) => {
        this.statement.set(null);
        this.error.set(err?.message || 'تعذّر تحميل كشف الحساب — حاول مرة أخرى');
        this.loading.set(false);
      },
    });
  }
}
