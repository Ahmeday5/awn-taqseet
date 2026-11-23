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
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { Subscription } from 'rxjs';
import { map } from 'rxjs/operators';

import { CustomersService } from '../../services/customers.service';
import { InstallmentsService } from '../../services/installments.service';
import { ContractsService } from '../../../contracts/services/contracts.service';
import { TreasuryService } from '../../../treasury/services/treasury.service';
import { DialogService } from '../../../../core/services/dialog.service';
import {
  ClientContractRow,
  ClientContractsSummary,
  ContractDetails,
  ContractPaymentRow,
  InstallmentPaymentResult,
  PayInstallmentPayload,
} from '../../models/client-statement.model';
import {
  describeAllocations,
  formatAmount,
  roundMoney,
} from '../../utils/installment-schedule.util';
import { InstallmentScheduleTableComponent } from '../../components/installment-schedule-table/installment-schedule-table.component';
import { ContractPaymentsTableComponent } from '../../components/contract-payments-table/contract-payments-table.component';
import { InstallmentPaymentEditModalComponent } from '../../components/installment-payment-edit-modal/installment-payment-edit-modal.component';
import {
  PaymentReceiptContext,
  PaymentReceiptModalComponent,
} from '../../components/payment-receipt-modal/payment-receipt-modal.component';
import { DashboardClient } from '../../models/dashboard-client.model';
import { LookupItem } from '../../../../core/models/lookup.model';
import {
  BadgeComponent,
  BadgeType,
} from '../../../../shared/components/badge/badge.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { HttpCacheService } from '../../../../core/services/http-cache.service';
import { onInvalidate } from '../../../../core/utils/auto-refresh.util';
import { todayIsoDate } from '../../../../shared/utils/date-iso.util';
import { PrintConfig, PrintService } from '../../../../core/services/print.service';
import { WhatsappSendButtonComponent } from '../../../../shared/components/whatsapp-send-button/whatsapp-send-button.component';
import { formatMoneyAr } from '../../../../shared/utils/number-format.util';
import { PdfExportService } from '../../../../core/services/pdf-export.service';
import { reportFromPrintConfig } from '../../../../core/pdf/pdf-report.template';
import { formatPrintCurrency } from '../../../../core/utils/print-format.util';
import { fetchAllPages } from '../../../../core/utils/api-list.util';
import { DirectContractModalComponent } from '../../components/direct-contract-modal/direct-contract-modal.component';

const DEFAULT_PAGE_SIZE = 10;

interface PaymentForm {
  amount: number;
  treasuryId: number | null;
  /**
   * «إغلاق العقد» — pays off the contract's full remaining balance. While on,
   * the submitted amount is derived from `summary.totalRemaining` (see
   * `payAmount`), so a refresh can never leave a stale payoff amount behind.
   */
  settle: boolean;
  paymentDate: string;
  notes: string;
}

/** Header-card fields — satisfied by both the picker's list row and the client profile. */
type StatementClient = Pick<DashboardClient, 'id' | 'fullName' | 'phoneNumber' | 'address'>;

@Component({
  selector: 'app-statement',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterModule,
    BadgeComponent,
    ModalComponent,
    PaginationComponent,
    CurrencyArPipe,
    SearchableSelectComponent,
    DirectContractModalComponent,
    InstallmentScheduleTableComponent,
    ContractPaymentsTableComponent,
    InstallmentPaymentEditModalComponent,
    PaymentReceiptModalComponent,
    WhatsappSendButtonComponent,
  ],
  templateUrl: './statement.component.html',
  styleUrl: './statement.component.scss',
})
export class StatementComponent {
  /**
   * When set (e.g. embedded inside the client-profile modal), the client
   * picker is preset and locked to this client instead of left for the
   * user to choose freely on the standalone /customers/statement page.
   */
  readonly initialClientId = input<number | null>(null);
  /** `?clientId=` query param (router input binding) — deep links from other screens. */
  readonly clientId = input<string | undefined>(undefined);

  private readonly customersService = inject(CustomersService);
  private readonly contractsService = inject(ContractsService);
  private readonly installmentsService = inject(InstallmentsService);
  private readonly treasuryService = inject(TreasuryService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly cache = inject(HttpCacheService);
  private readonly printer = inject(PrintService);
  private readonly pdf = inject(PdfExportService);
  private readonly router = inject(Router);

  protected readonly isPrinting = signal(false);

  // ── client picker ──────────────────────────────────────────────────
  protected readonly clients = signal<DashboardClient[]>([]);
  protected readonly clientsLoading = signal(false);
  protected readonly selectedClientId = signal<number | null>(null);

  /**
   * The preset client fetched on its own (`GET /clients/{id}`), so the
   * embedded statement renders immediately instead of waiting for the full
   * multi-page client list that only the picker needs.
   */
  private readonly resolvedClient = signal<StatementClient | null>(null);

  protected readonly selectedClient = computed<StatementClient | null>(() => {
    const id = this.selectedClientId();
    if (id === null) return null;
    const resolved = this.resolvedClient();
    if (resolved?.id === id) return resolved;
    return this.clients().find((c) => c.id === id) ?? null;
  });

  /** Client list shaped for the searchable select (name + phone search). */
  protected readonly clientOptions = computed<SearchableSelectOption[]>(() =>
    this.clients().map((c) => ({
      value: c.id,
      label: c.fullName,
      hint: c.phoneNumber,
    })),
  );

  // ── contracts table ────────────────────────────────────────────────
  protected readonly contracts = signal<ClientContractRow[]>([]);
  protected readonly contractsLoading = signal(false);
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly count = signal(0);
  protected readonly totalPages = signal(0);

  /** Free-text filter over the contract's representative name (debounced). */
  protected readonly representativeSearch = signal('');
  private repSearchDebounce: ReturnType<typeof setTimeout> | null = null;

  // ── server-computed totals across ALL of the client's contracts ────
  protected readonly contractsSummary = signal<ClientContractsSummary>({
    totalContractsValue: 0,
    totalRemaining: 0,
    totalOverdue: 0,
  });

  // ── details modal ──────────────────────────────────────────────────
  protected readonly detailsOpen = signal(false);
  protected readonly detailsLoading = signal(false);
  /** Last details-request failure — drives the inline retry state. */
  protected readonly detailsError = signal<string | null>(null);
  protected readonly details = signal<ContractDetails | null>(null);
  protected readonly activeContractId = signal<number | null>(null);
  private detailsSub: Subscription | null = null;

  // ── payment modal ──────────────────────────────────────────────────
  protected readonly payOpen = signal(false);
  protected readonly paySubmitting = signal(false);
  protected readonly treasuries = signal<LookupItem[]>([]);

  protected readonly payForm = signal<PaymentForm>(this.emptyPaymentForm());

  private readonly contractRemaining = computed(() =>
    roundMoney(this.details()?.summary.totalRemaining ?? 0),
  );

  /** The amount actually submitted — the full balance when settling the contract. */
  protected readonly payAmount = computed(() =>
    this.payForm().settle
      ? this.contractRemaining()
      : Number(this.payForm().amount) || 0,
  );

  protected readonly payRemainingAfter = computed(() =>
    Math.max(0, roundMoney(this.contractRemaining() - this.payAmount())),
  );

  // ── payment receipt (shown after a successful payment) ─────────────────
  protected readonly receipt = signal<InstallmentPaymentResult | null>(null);
  protected readonly receiptContext = signal<PaymentReceiptContext | null>(null);

  // ── per-voucher edit / delete ──────────────────────────────────────────
  protected readonly editPaymentTarget = signal<ContractPaymentRow | null>(null);
  /** Voucher with an in-flight delete — its row actions are disabled. */
  protected readonly busyVoucherId = signal<number | null>(null);

  // ── directContract edit modal ──────────────────────────────────────────────────
  protected readonly directContractEditOpen = signal(false);
  protected readonly directContractEditId = signal<number | null>(null);

  // ── contract actions ──────────────────────────────────────────────────────────
  protected readonly contractActioningId = signal<number | null>(null);
  protected readonly contractActionName = signal<'cancel' | null>(null);

  constructor() {
    this.loadClients();
    this.loadTreasuries();

    // Preset the picker to a given client when embedded elsewhere (e.g. the
    // client-profile modal) — the picker itself stays visible and usable so
    // the user can still switch to a different client from the same modal.
    // Reactive (not a one-off constructor read): `initialClientId` is bound
    // by the parent *after* construction, so reading it here directly would
    // always see `null` and silently fall back to the "choose a client"
    // empty state instead of the client the user was already viewing.
    effect(
      () => {
        const fromQuery = Number(this.clientId());
        const presetClientId =
          this.initialClientId() ?? (Number.isFinite(fromQuery) && fromQuery > 0 ? fromQuery : null);
        if (presetClientId !== null) {
          this.selectedClientId.set(presetClientId);
          untracked(() => this.resolveClient(presetClientId));
        }
      },
      { allowSignalWrites: true },
    );

    // Refetch contracts whenever the selected client, page, or rep-name
    // filter changes. The rep-name filter is debounced (see `onRepSearch`)
    // by writing into `representativeSearch` only after the pause, so this
    // effect doesn't need its own debounce logic.
    effect(
      () => {
        const clientId = this.selectedClientId();
        const page = this.pageIndex();
        const size = this.pageSize();
        const repName = this.representativeSearch();
        if (clientId === null || clientId === undefined || !Number.isFinite(clientId)) {
          this.contracts.set([]);
          this.count.set(0);
          this.totalPages.set(0);
          return;
        }
        // `untracked`: cache hits replay synchronously inside this effect.
        untracked(() => this.fetchContracts(clientId, page, size, repName, false));
      },
      { allowSignalWrites: true },
    );

    // Auto-refresh on any contract/payment/installment invalidation
    // (covers cross-tab events as well).
    onInvalidate(this.cache, 'contract', () => this.refreshAfterMutation());
    onInvalidate(this.cache, 'payment', () => this.refreshAfterMutation());
    onInvalidate(this.cache, 'installment', () => this.refreshAfterMutation());
  }

  // ─────────── loaders ───────────

  private loadClients(): void {
    this.clientsLoading.set(true);
    this.customersService.listAllClients().subscribe({
      next: (list) => {
        this.clients.set(list);
        this.clientsLoading.set(false);
      },
      error: () => {
        this.clients.set([]);
        this.clientsLoading.set(false);
      },
    });
  }

  /** Loads just this client so the header card never waits on `loadClients`. */
  private resolveClient(id: number): void {
    if (this.resolvedClient()?.id === id) return;
    this.customersService.getClientProfile(id).subscribe({
      next: ({ client }) => {
        if (this.selectedClientId() !== id) return;
        this.resolvedClient.set({
          id: client.id,
          fullName: client.fullName,
          phoneNumber: client.phoneNumber,
          address: client.address,
        });
      },
      // Non-fatal: the header falls back to the picker list once it loads.
      error: () => undefined,
    });
  }

  private loadTreasuries(): void {
    // Lookup is role-scoped + active-only server-side — used verbatim.
    this.treasuryService.lookup().subscribe({
      next: (list) => this.treasuries.set(list),
      error: () => this.treasuries.set([]),
    });
  }

  private fetchContracts(
    clientId: number,
    pageIndex: number,
    pageSize: number,
    representativeName: string,
    force: boolean,
  ): void {
    if (!Number.isFinite(clientId)) return;
    this.contractsLoading.set(true);
    const query = { pageIndex, pageSize, representativeName };
    const stream$ = force
      ? this.customersService.refreshClientContracts(clientId, query)
      : this.customersService.getClientContracts(clientId, query);

    stream$.subscribe({
      next: (res) => {
        this.contracts.set(res?.items?.data ?? []);
        this.count.set(res?.items?.count ?? 0);
        this.totalPages.set(res?.items?.totalPages ?? 0);
        this.contractsSummary.set(
          res?.summary ?? {
            totalContractsValue: 0,
            totalRemaining: 0,
            totalOverdue: 0,
          },
        );
        this.contractsLoading.set(false);
      },
      error: (err: ApiError) => {
        this.contracts.set([]);
        this.count.set(0);
        this.totalPages.set(0);
        this.contractsSummary.set({
          totalContractsValue: 0,
          totalRemaining: 0,
          totalOverdue: 0,
        });
        this.contractsLoading.set(false);
        this.toast.error(apiErrorToMessage(err, 'تعذّر تحميل عقود العميل'));
      },
    });
  }

  private refreshAfterMutation(): void {
    const clientId = this.selectedClientId();
    if (clientId !== null) {
      this.fetchContracts(
        clientId,
        this.pageIndex(),
        this.pageSize(),
        this.representativeSearch(),
        true,
      );
    }
    const contractId = this.activeContractId();
    if (contractId !== null && this.detailsOpen()) {
      this.reloadDetails(contractId);
    }
  }

  // ─────────── client picker handlers ───────────

  protected onClientChange(value: number | string | null): void {
    const id = value === null || value === '' ? null : Number(value);
    this.selectedClientId.set(id !== null && Number.isFinite(id) ? id : null);
    this.pageIndex.set(1);
  }

  protected refreshContracts(): void {
    const id = this.selectedClientId();
    if (id === null) return;
    this.fetchContracts(
      id,
      this.pageIndex(),
      this.pageSize(),
      this.representativeSearch(),
      true,
    );
  }

  /** Debounced handler for the "بحث باسم المندوب" input. */
  protected onRepresentativeSearch(value: string): void {
    if (this.repSearchDebounce) clearTimeout(this.repSearchDebounce);
    this.repSearchDebounce = setTimeout(() => {
      this.pageIndex.set(1);
      this.representativeSearch.set(value.trim());
    }, 300);
  }

  /**
   * Exports every contract for the selected client as a single PDF. Always
   * paginates through every server page so the printed document is complete
   * — the visible table may only be showing the first 10 rows.
   */
  protected printStatement(): void {
    const client = this.selectedClient();
    if (!client || this.isPrinting()) return;
    this.isPrinting.set(true);

    this.loadStatementPrintConfig(client).subscribe({
      next: (config) => {
        this.isPrinting.set(false);
        this.printer.print(config);
      },
      error: () => {
        this.isPrinting.set(false);
        this.toast.error('تعذر تجهيز ملف الطباعة');
      },
    });
  }

  // ─────────── whatsapp ───────────

  protected readonly whatsappCaption = computed(() => {
    const client = this.selectedClient();
    if (!client) return '';
    const s = this.contractsSummary();
    return [
      `كشف حساب العميل: ${client.fullName}`,
      `إجمالي العقود: ${formatMoneyAr(s.totalContractsValue)}`,
      `المتبقي: ${formatMoneyAr(s.totalRemaining)}`,
      ...(s.totalOverdue > 0 ? [`المتأخر: ${formatMoneyAr(s.totalOverdue)}`] : []),
    ].join('\n');
  });

  /** Same report as the printout (every page, not just the visible one), as a PDF. */
  protected readonly buildStatementPdf = async (): Promise<string> => {
    const client = this.selectedClient();
    if (!client) throw new Error('No client selected');
    const config = await firstValueFrom(this.loadStatementPrintConfig(client));
    const s = this.contractsSummary();
    return this.pdf.renderReport(reportFromPrintConfig(config, {
      caption: `العقود (${config.rows.length.toLocaleString('ar-EG')})`,
      metrics: [
        { label: 'إجمالي العقود', value: formatPrintCurrency(s.totalContractsValue), emphasis: true },
        { label: 'المتبقي', value: formatPrintCurrency(s.totalRemaining), tone: s.totalRemaining > 0 ? 'negative' : 'positive' },
        { label: 'المتأخر', value: formatPrintCurrency(s.totalOverdue), tone: s.totalOverdue > 0 ? 'warning' : 'default' },
        { label: 'عدد العقود', value: config.rows.length.toLocaleString('ar-EG') },
      ],
    }));
  };

  private loadStatementPrintConfig(
    client: StatementClient,
  ): Observable<PrintConfig<ClientContractRow>> {
    const representativeName = this.representativeSearch();
    return fetchAllPages<ClientContractRow>((pageIndex, pageSize) =>
      this.customersService
        .refreshClientContracts(client.id, {
          pageIndex,
          pageSize,
          representativeName,
        })
        .pipe(map((res) => res.items)),
    ).pipe(
      map((rows): PrintConfig<ClientContractRow> => {
        const totalSale = rows.reduce(
          (s, r) => s + (r.totalContractAmount ?? 0),
          0,
        );
        const totalPaid = rows.reduce((s, r) => s + (r.totalPaid ?? 0), 0);
        const totalRemaining = rows.reduce(
          (s, r) => s + (r.remainingAmount ?? 0),
          0,
        );

        return {
          title: 'كشف حساب العميل',
          subtitle: client.fullName,
          meta: [
            { label: 'العميل', value: client.fullName },
            ...(client.phoneNumber
              ? [{ label: 'الهاتف', value: client.phoneNumber }]
              : []),
            { label: 'عدد العقود', value: String(rows.length) },
          ],
          orientation: 'landscape',
          columns: [
            {
              key: 'id',
              header: 'العقد',
              align: 'center',
              width: '52px',
              format: (v) => `#${v}`,
            },
            {
              key: (row) => this.rowProductLabel(row),
              header: 'المنتج',
              align: 'start',
              bold: true,
            },
            {
              key: (row) => this.rowQuantityTotal(row),
              header: 'الكمية',
              align: 'center',
              format: 'number',
            },
            {
              key: 'dateOfSale',
              header: 'تاريخ البيع',
              align: 'center',
              format: 'shortDate',
            },
            {
              key: 'cashPrice',
              header: 'سعر النقد',
              align: 'end',
              format: 'currency',
            },
            {
              key: 'downPayment',
              header: 'المقدم',
              align: 'end',
              format: 'currency',
            },
            {
              key: 'installmentsCount',
              header: 'عدد الأقساط',
              align: 'center',
              format: 'number',
            },
            {
              key: 'installmentAmount',
              header: 'قيمة القسط',
              align: 'end',
              format: 'currency',
            },
            {
              key: 'totalContractAmount',
              header: 'إجمالي العقد',
              align: 'end',
              format: 'currency',
              bold: true,
            },
            {
              key: 'totalPaid',
              header: 'المدفوع',
              align: 'end',
              format: 'currency',
            },
            {
              key: 'remainingAmount',
              header: 'المتبقي',
              align: 'end',
              format: 'currency',
              bold: true,
            },
            {
              key: 'status',
              header: 'الحالة',
              align: 'center',
              format: (v) => this.contractStatusLabel(String(v)),
            },
          ],
          totals: {
            label: 'الإجمالي',
            labelColSpan: 8,
            cells: [
              null,
              `${Math.round(totalSale).toLocaleString('ar-EG')} ج.م`,
              `${Math.round(totalPaid).toLocaleString('ar-EG')} ج.م`,
              `${Math.round(totalRemaining).toLocaleString('ar-EG')} ج.م`,
              null,
            ],
          },
          rows,
        };
      }),
    );
  }

  // ─────────── pagination ───────────

  protected onPageChange(page: number): void {
    this.pageIndex.set(page);
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(1);
  }

  // ─────────── edit contract handler ───────────

  /**
   * Routes the user to the appropriate edit handler based on contract type:
   * - Regular contract → navigate to contract-new page
   * - Direct contract → open direct-contract-modal
   */
  protected editContract(row: ClientContractRow): void {
    if (row.isDirectContract) {
      this.directContractEditId.set(row.id);
      this.directContractEditOpen.set(true);
    } else {
      this.router.navigate(['/customers/contract'], {
        queryParams: { editId: row.id },
      });
    }
  }

  protected closeDirectContractModal(): void {
    this.directContractEditOpen.set(false);
    this.directContractEditId.set(null);
  }

  protected onDirectContractUpdated(): void {
    this.directContractEditOpen.set(false);
    this.directContractEditId.set(null);
    const clientId = this.selectedClientId();
    if (clientId !== null) {
      this.fetchContracts(
        clientId,
        this.pageIndex(),
        this.pageSize(),
        this.representativeSearch(),
        true,
      );
    }
  }

  // ─────────── contract action handlers ───────────

  protected isContractActionPending(
    contractId: number,
    action: 'cancel',
  ): boolean {
    return (
      this.contractActioningId() === contractId &&
      this.contractActionName() === action
    );
  }

  protected async confirmContractAction(
    row: ClientContractRow,
    action: 'cancel',
  ): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'إلغاء العقد',
      message: 'هل أنت متأكد من إلغاء هذا العقد؟',
      confirmText: 'إلغاء',
      cancelText: 'تراجع',
      type: 'danger',
    });
    if (!ok) return;

    this.contractActioningId.set(row.id);
    this.contractActionName.set(action);

    this.contractsService.cancel(row.id).subscribe({
      next: () => {
        this.contractActioningId.set(null);
        this.contractActionName.set(null);
        this.toast.success('تم إلغاء العقد بنجاح');
        this.refreshContracts();
        if (this.activeContractId() === row.id) {
          this.reloadDetails(row.id);
        }
      },
      error: (err: ApiError) => {
        this.contractActioningId.set(null);
        this.contractActionName.set(null);
        this.toast.error(apiErrorToMessage(err, 'فشل إلغاء العقد'));
      },
    });
  }

  // ─────────── delete contract (Cancelled only) ───────────

  protected readonly deletingContractId = signal<number | null>(null);

  protected async confirmDeleteContract(row: ClientContractRow): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'حذف العقد',
      message: `هل أنت متأكد من حذف العقد رقم #${row.id}؟ هذا الإجراء لا يمكن التراجع عنه.`,
      confirmText: 'حذف',
      cancelText: 'تراجع',
      type: 'danger',
    });
    if (!ok) return;

    this.deletingContractId.set(row.id);
    this.contractsService.delete(row.id).subscribe({
      next: () => {
        this.deletingContractId.set(null);
        this.toast.success('تم حذف العقد بنجاح');
        if (this.activeContractId() === row.id) this.closeDetails();
        this.refreshContracts();
      },
      error: (err: ApiError) => {
        this.deletingContractId.set(null);
        this.toast.error(apiErrorToMessage(err, 'فشل حذف العقد'));
      },
    });
  }

  // ─────────── per-voucher edit / delete ───────────

  protected openEditPayment(payment: ContractPaymentRow): void {
    if (!payment.canEdit) return;
    this.editPaymentTarget.set(payment);
  }

  protected closeEditPayment(): void {
    this.editPaymentTarget.set(null);
  }

  /** The backend re-allocated every payment — statuses may have changed. */
  protected onPaymentEdited(): void {
    this.editPaymentTarget.set(null);
    this.refreshAfterMutation();
  }

  /**
   * Deletes the WHOLE voucher (not just the part it was triggered from), so
   * the dialog spells out every installment it covered.
   */
  protected async confirmDeletePayment(payment: ContractPaymentRow): Promise<void> {
    if (!payment.canDelete || this.busyVoucherId() !== null) return;

    const source = payment.treasuryName ? ` من ${payment.treasuryName}` : '';
    const lines = [
      `حذف السند ${payment.voucherNumber} بقيمة ${formatAmount(payment.amount)}${source}؟`,
      'سيتم خصم المبلغ من الخزنة وإعادة توزيع باقي الدفعات على الأقساط.',
    ];
    if (payment.installments.length > 1) {
      lines.push(
        '',
        'هذا السند يغطي أكثر من قسط، والحذف يشمل السند بالكامل:',
        describeAllocations(payment.installments, this.details()?.installments),
      );
    }

    const ok = await this.dialog.confirm({
      title: 'حذف سند القبض',
      message: lines.join('\n'),
      confirmText: 'حذف السند',
      cancelText: 'تراجع',
      type: 'danger',
    });
    if (!ok) return;

    this.busyVoucherId.set(payment.id);
    this.installmentsService.deletePayment(payment.id).subscribe({
      next: () => {
        this.busyVoucherId.set(null);
        this.toast.success(`تم حذف السند ${payment.voucherNumber} بنجاح`);
        this.refreshAfterMutation();
      },
      error: (err: ApiError) => {
        this.busyVoucherId.set(null);
        this.toast.error(apiErrorToMessage(err, 'فشل حذف السند'));
      },
    });
  }

  protected closeReceipt(): void {
    this.receipt.set(null);
    this.receiptContext.set(null);
  }

  // ─────────── details modal ───────────

  protected openDetails(row: ClientContractRow): void {
    this.activeContractId.set(row.id);
    this.details.set(null);
    this.detailsOpen.set(true);
    this.loadDetails(row.id, false);
  }

  protected closeDetails(): void {
    this.detailsSub?.unsubscribe();
    this.detailsSub = null;
    this.detailsOpen.set(false);
    this.detailsLoading.set(false);
    this.detailsError.set(null);
    this.activeContractId.set(null);
    this.details.set(null);
  }

  protected retryDetails(): void {
    const id = this.activeContractId();
    if (id !== null) this.loadDetails(id, true);
  }

  private reloadDetails(id: number): void {
    this.loadDetails(id, true);
  }

  /**
   * Single entry point for the details request. Cancels any in-flight one so
   * switching contracts quickly never paints a stale contract, and keeps the
   * current data on screen during a background refresh.
   */
  private loadDetails(id: number, force: boolean): void {
    this.detailsSub?.unsubscribe();
    this.detailsLoading.set(true);
    this.detailsError.set(null);
    const request$ = force
      ? this.contractsService.refreshDetails(id)
      : this.contractsService.getDetails(id);
    this.detailsSub = request$.subscribe({
      next: (d) => {
        if (this.activeContractId() !== id) return;
        this.details.set(d);
        this.detailsLoading.set(false);
      },
      error: (err: ApiError) => {
        if (this.activeContractId() !== id) return;
        this.detailsLoading.set(false);
        this.detailsError.set(apiErrorToMessage(err, 'تعذّر تحميل تفاصيل العقد'));
      },
    });
  }

  // ─────────── payment modal ───────────

  protected openPayment(): void {
    const d = this.details();
    if (!d) return;
    const suggested =
      d.nextInstallment?.amount ?? d.summary.totalRemaining ?? 0;
    this.payForm.set({ ...this.emptyPaymentForm(), amount: roundMoney(suggested) });
    this.payOpen.set(true);
  }

  protected closePayment(): void {
    if (this.paySubmitting()) return;
    this.payOpen.set(false);
  }

  protected updatePayForm<K extends keyof PaymentForm>(
    key: K,
    value: PaymentForm[K],
  ): void {
    this.payForm.update((f) => ({ ...f, [key]: value }));
  }

  protected async submitPayment(): Promise<void> {
    const d = this.details();
    const f = this.payForm();
    if (!d || this.paySubmitting()) return;
    const amount = this.payAmount();
    if (amount <= 0) {
      this.toast.error('أدخل مبلغًا صحيحًا');
      return;
    }
    const treasuryId = f.treasuryId;
    if (treasuryId === null) {
      this.toast.error('اختر الخزينة');
      return;
    }
    if (f.settle && !(await this.confirmSettlement(d.contract.id, amount))) return;

    const payload: PayInstallmentPayload = {
      contractId: d.contract.id,
      amount,
      treasuryId,
      paymentDate: new Date(f.paymentDate).toISOString(),
      notes: f.notes?.trim() || '',
    };

    this.paySubmitting.set(true);
    this.installmentsService.pay(payload).subscribe({
      next: (result) => {
        this.paySubmitting.set(false);
        this.payOpen.set(false);
        this.receiptContext.set({
          clientName: d.client.fullName,
          contractId: d.contract.id,
          treasuryName: this.treasuries().find((t) => t.id === treasuryId)?.name ?? null,
        });
        this.receipt.set(result);
        // Refresh this modal's own data directly — don't rely solely on
        // the cache-invalidation cascade to eventually reach this instance.
        this.refreshAfterMutation();
      },
      error: (err: ApiError) => {
        this.paySubmitting.set(false);
        this.toast.error(apiErrorToMessage(err, 'فشل تسجيل الدفعة'));
      },
    });
  }

  private confirmSettlement(contractId: number, amount: number): Promise<boolean> {
    return this.dialog.confirm({
      title: 'إغلاق العقد',
      message: `سيتم سداد كامل المتبقي (${formatAmount(amount)}) وإغلاق العقد #${contractId}. هل تريد المتابعة؟`,
      confirmText: 'إغلاق العقد',
      cancelText: 'تراجع',
      type: 'warning',
    });
  }

  // ─────────── view helpers ───────────

  /** "Product (+N)" for the details payload — mirrors `rowProductLabel`. */
  protected detailsProductLabel(d: ContractDetails): string {
    if (d.items.length === 0) return '—';
    const first = d.items[0].productName || '—';
    return d.items.length > 1 ? `${first} (+${d.items.length - 1})` : first;
  }

  /** Notes column fallback — backend may send null/empty. */
  protected notesLabel(notes: string | null | undefined): string {
    const trimmed = notes?.trim();
    return trimmed ? trimmed : 'لا يوجد ملاحظات';
  }

  /** First item's product name, with a "+N" suffix when the contract has more than one line. */
  protected rowProductLabel(row: ClientContractRow): string {
    const items = row.items ?? [];
    if (items.length === 0) return '—';
    const first = items[0].productName || '—';
    return items.length > 1 ? `${first} (+${items.length - 1})` : first;
  }

  /** Total quantity across every item line on the contract. */
  protected rowQuantityTotal(row: ClientContractRow): number {
    const items = row.items ?? [];
    if (items.length === 0) return row.quantity ?? 0;
    return items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
  }

  protected freqLabel(freq: string | null): string {
    if (!freq) return '—';
    const map: Record<string, string> = {
      Monthly: 'شهري',
      Weekly: 'أسبوعي',
      Bimonthly: 'كل شهرين',
      Quarterly: 'ربع سنوي',
      SemiAnnual: 'نصف سنوي',
      SemiAnnually: 'نصف سنوي',
      Annual: 'سنوي',
      Annually: 'سنوي',
    };
    return map[freq] ?? freq;
  }

  protected contractStatusLabel(status: string): string {
    const map: Record<string, string> = {
      Active: 'ساري',
      Completed: 'مكتمل',
      Defaulted: 'متعثر',
      Cancelled: 'ملغي',
    };
    return map[status] ?? status;
  }

  protected contractStatusBadge(status: string): BadgeType {
    switch (status) {
      case 'Active':
        return 'info';
      case 'Completed':
        return 'ok';
      case 'Defaulted':
        return 'bad';
      case 'Cancelled':
        return 'warn';
      default:
        return 'info';
    }
  }

  protected formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    // Backend returns either ISO datetime or YYYY-MM-DD.
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  // ─────────── internals ───────────

  private emptyPaymentForm(): PaymentForm {
    // No default treasury — the operator must explicitly choose one.
    return {
      amount: 0,
      treasuryId: null,
      settle: false,
      paymentDate: todayIsoDate(),
      notes: '',
    };
  }
}
