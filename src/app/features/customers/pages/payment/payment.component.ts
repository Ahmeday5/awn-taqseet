import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CustomersService } from '../../services/customers.service';
import { ContractsService } from '../../../contracts/services/contracts.service';
import { InstallmentsService } from '../../services/installments.service';
import { TreasuryService } from '../../../treasury/services/treasury.service';
import { DialogService } from '../../../../core/services/dialog.service';
import { DashboardClient } from '../../models/dashboard-client.model';
import {
  ClientContractRow,
  ContractDetails,
  InstallmentPaymentResult,
  PayInstallmentPayload,
} from '../../models/client-statement.model';
import {
  PaymentReceiptContext,
  PaymentReceiptModalComponent,
} from '../../components/payment-receipt-modal/payment-receipt-modal.component';
import { LookupItem } from '../../../../core/models/lookup.model';
import { PaymentRecord } from '../../models/customer.model';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { todayIsoDate } from '../../../../shared/utils/date-iso.util';
import { HttpCacheService } from '../../../../core/services/http-cache.service';
import { onInvalidate } from '../../../../core/utils/auto-refresh.util';
import { formatAmount, roundMoney } from '../../utils/installment-schedule.util';

const CONTRACT_PAGE_SIZE = 100;

@Component({
  selector: 'app-payment',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    BadgeComponent,
    CurrencyArPipe,
    SearchableSelectComponent,
    PaymentReceiptModalComponent,
  ],
  templateUrl: './payment.component.html',
  styleUrl: './payment.component.scss',
})
export class PaymentComponent {
  private readonly customersService = inject(CustomersService);
  private readonly contractsService = inject(ContractsService);
  private readonly installmentsService = inject(InstallmentsService);
  private readonly treasuryService = inject(TreasuryService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  private readonly cache = inject(HttpCacheService);

  // ── lookup data ──
  protected readonly clients = signal<DashboardClient[]>([]);
  protected readonly contracts = signal<ClientContractRow[]>([]);
  protected readonly treasuries = signal<LookupItem[]>([]);
  protected readonly contractDetails = signal<ContractDetails | null>(null);
  protected readonly recentPayments = signal<PaymentRecord[]>([]);

  /** Client list shaped for the searchable select (name + phone search). */
  protected readonly clientOptions = computed<SearchableSelectOption[]>(() =>
    this.clients().map((c) => ({
      value: c.id,
      label: c.fullName,
      hint: c.phoneNumber,
    })),
  );

  // ── form state ──
  protected readonly selectedClientId = signal<number | null>(null);
  protected readonly selectedContractId = signal<number | null>(null);
  protected readonly payTreasuryId = signal<number | null>(null);
  protected readonly payAmount = signal<number>(0);
  /** «إغلاق العقد» — pay off the full remaining balance (see `effectiveAmount`). */
  protected readonly paySettle = signal(false);
  protected readonly payDate = signal<string>(todayIsoDate());
  protected readonly payNotes = signal<string>('');

  protected readonly submitting = signal(false);
  protected readonly detailsLoading = signal(false);

  // ── receipt shown after a successful payment ──
  protected readonly receipt = signal<InstallmentPaymentResult | null>(null);
  protected readonly receiptContext = signal<PaymentReceiptContext | null>(null);

  // ── derived ──
  protected readonly selectedClient = computed(() =>
    this.clients().find((c) => c.id === this.selectedClientId()) ?? null,
  );

  protected readonly selectedContract = computed(() =>
    this.contracts().find((c) => c.id === this.selectedContractId()) ?? null,
  );

  /**
   * Live payment breakdown — uses real contract details when available so
   * the card mirrors the same numbers the customer sees in the statement
   * modal. Falls back to the table row data when details haven't loaded yet.
   */
  /** Live balance — contract details when loaded, the table row otherwise. */
  private readonly contractRemaining = computed(() => {
    const c = this.selectedContract();
    if (!c) return 0;
    return roundMoney(this.contractDetails()?.summary.totalRemaining ?? c.remainingAmount);
  });

  /** The amount actually submitted — derived from the balance while settling. */
  protected readonly effectiveAmount = computed(() =>
    this.paySettle() ? this.contractRemaining() : Number(this.payAmount()) || 0,
  );

  protected readonly paymentInfo = computed(() => {
    const c = this.selectedContract();
    if (!c) return null;
    const d = this.contractDetails();
    const totalRemaining = this.contractRemaining();
    const now = this.effectiveAmount();
    return {
      installmentDue: d?.nextInstallment?.amount ?? c.installmentAmount,
      totalPaid: d?.summary.totalPaid ?? c.totalPaid,
      now,
      remainingAfter: Math.max(0, roundMoney(totalRemaining - now)),
      totalRemaining,
      overdue: d?.summary.overdueAmount ?? 0,
    };
  });

  constructor() {
    this.loadClients();
    this.loadTreasuries();

    // Loaders run `untracked`: cache hits replay synchronously, so any signal
    // read in a subscriber would otherwise become a dependency of the effect
    // (e.g. `payAmount` → refetching details on every keystroke).

    // When the client changes, fetch their contracts and clear the
    // contract/details selection.
    effect(
      () => {
        const clientId = this.selectedClientId();
        this.selectedContractId.set(null);
        this.contractDetails.set(null);
        if (clientId === null) {
          this.contracts.set([]);
          return;
        }
        untracked(() => this.fetchContracts(clientId));
      },
      { allowSignalWrites: true },
    );

    // When the contract changes, fetch its details (for the live pay card).
    effect(
      () => {
        const contractId = this.selectedContractId();
        if (contractId === null) {
          this.contractDetails.set(null);
          return;
        }
        untracked(() => this.fetchContractDetails(contractId));
      },
      { allowSignalWrites: true },
    );

    // Auto-refresh on any contract/payment/installment invalidation, so a
    // payment recorded from anywhere in the app (this page, the statement
    // modal, etc.) keeps this page's contract list and live pay card in
    // sync without a manual reload.
    onInvalidate(this.cache, 'contract', () => this.refreshAfterMutation());
    onInvalidate(this.cache, 'payment', () => this.refreshAfterMutation());
    onInvalidate(this.cache, 'installment', () => this.refreshAfterMutation());
  }

  private refreshAfterMutation(): void {
    const clientId = this.selectedClientId();
    if (clientId !== null) this.fetchContracts(clientId);
    const contractId = this.selectedContractId();
    if (contractId !== null) this.fetchContractDetails(contractId);
  }

  // ─────────── loaders ───────────

  private loadClients(): void {
    this.customersService.listAllClients().subscribe({
      next: (list) => this.clients.set(list),
      error: () => this.clients.set([]),
    });
  }

  private loadTreasuries(): void {
    // Lookup is already role-scoped + active-only server-side; used verbatim.
    // No default treasury is pre-selected — the operator must explicitly
    // choose one for every payment.
    this.treasuryService.lookup().subscribe({
      next: (list) => this.treasuries.set(list),
      error: () => this.treasuries.set([]),
    });
  }

  private fetchContracts(clientId: number): void {
    this.customersService
      .getClientContracts(clientId, { pageIndex: 1, pageSize: CONTRACT_PAGE_SIZE })
      .subscribe({
        next: (res) => this.contracts.set(res?.items?.data ?? []),
        error: () => this.contracts.set([]),
      });
  }

  private fetchContractDetails(id: number): void {
    this.detailsLoading.set(true);
    this.contractsService.getDetails(id).subscribe({
      next: (d) => {
        this.contractDetails.set(d);
        // Suggest the next installment amount as the default value the
        // operator can accept or override.
        const next = d.nextInstallment?.amount ?? 0;
        if (this.payAmount() === 0 && next > 0) {
          this.payAmount.set(roundMoney(next));
        }
        this.detailsLoading.set(false);
      },
      error: () => {
        this.contractDetails.set(null);
        this.detailsLoading.set(false);
      },
    });
  }

  // ─────────── handlers ───────────

  protected onClientChange(value: number | string | null): void {
    const id = value === null || value === '' ? null : Number(value);
    this.selectedClientId.set(id !== null && Number.isFinite(id) ? id : null);
    this.resetAmount();
  }

  protected onContractChange(value: string): void {
    const id = value ? Number(value) : null;
    this.selectedContractId.set(Number.isFinite(id) ? id : null);
    this.resetAmount();
  }

  protected async recordPayment(): Promise<void> {
    if (this.submitting()) return;
    const contract = this.selectedContract();
    if (!contract) {
      this.toast.error('اختر العميل والعقد أولاً');
      return;
    }
    const amount = this.effectiveAmount();
    if (amount <= 0) {
      this.toast.error('أدخل مبلغًا صحيحًا');
      return;
    }
    const treasuryId = this.payTreasuryId();
    if (treasuryId === null) {
      this.toast.error('اختر الخزينة');
      return;
    }
    if (this.paySettle() && !(await this.confirmSettlement(contract.id, amount))) return;

    const payload: PayInstallmentPayload = {
      contractId: contract.id,
      amount,
      treasuryId,
      paymentDate: new Date(this.payDate()).toISOString(),
      notes: this.payNotes().trim() || '',
    };

    this.submitting.set(true);
    this.installmentsService.pay(payload).subscribe({
      next: (result) => {
        this.submitting.set(false);
        this.receiptContext.set({
          clientName: this.selectedClient()?.fullName ?? '',
          contractId: contract.id,
          treasuryName: this.treasuries().find((t) => t.id === treasuryId)?.name ?? null,
        });
        this.receipt.set(result);
        // Refresh this page's own data directly — don't rely solely on the
        // cache-invalidation cascade to eventually reach this instance.
        this.refreshAfterMutation();
        this.resetAmount();
        this.payNotes.set('');
      },
      error: (err: ApiError) => {
        this.submitting.set(false);
        this.toast.error(apiErrorToMessage(err, 'فشل تسجيل الدفعة'));
      },
    });
  }
  
  protected closeReceipt(): void {
    this.receipt.set(null);
    this.receiptContext.set(null);
  }

  // ─────────── view helpers ───────────

  protected getStatusLabel(s: PaymentRecord['status']): string {
    const map: Record<PaymentRecord['status'], string> = {
      complete: 'مكتمل',
      partial: 'جزئي',
      remainder: 'تتمة',
    };
    return map[s];
  }

  protected getStatusBadge(s: PaymentRecord['status']): 'ok' | 'warn' {
    return s === 'partial' ? 'warn' : 'ok';
  }

  protected contractOptionLabel(c: ClientContractRow): string {
    const items = c.items ?? [];
    const productLabel =
      items.length === 0
        ? '—'
        : items.length === 1
          ? items[0].productName || '—'
          : `${items[0].productName || '—'} (+${items.length - 1})`;
    return `عقد #${c.id} — ${productLabel} (${c.installmentsCount} قسط)`;
  }

  // ─────────── internals ───────────

  private resetAmount(): void {
    this.payAmount.set(0);
    this.paySettle.set(false);
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
}
