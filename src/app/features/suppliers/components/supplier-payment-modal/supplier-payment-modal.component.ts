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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';
import { LookupItem } from '../../../../core/models/lookup.model';

import { TreasuryService } from '../../../treasury/services/treasury.service';
import { SuppliersService } from '../../services/suppliers.service';
import {
  Supplier,
  SupplierPaymentPayload,
  SupplierPaymentResponse,
  SupplierStatementPayment,
} from '../../models/supplier.model';

/**
 * Records a direct payment to a supplier, or edits an existing one when
 * `payment` is set (same form, prefilled, sent as PUT).
 *
 * In edit mode the amount isn't capped client-side: the owed balance is
 * scoped to the payment's representative, so the server validates it and
 * its Arabic 400 message is shown as-is.
 */
@Component({
  selector: 'app-supplier-payment-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ModalComponent,
    FormErrorComponent,
    SearchableSelectComponent,
    CurrencyArPipe,
  ],
  templateUrl: './supplier-payment-modal.component.html',
  styleUrl: './supplier-payment-modal.component.scss',
})
export class SupplierPaymentModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly supplier = input<Supplier | null>(null);
  /** Payment being edited; null = record a new one. */
  readonly payment = input<SupplierStatementPayment | null>(null);

  // ── outputs ──
  readonly closed = output<void>();
  readonly paid = output<SupplierPaymentResponse>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly suppliersService = inject(SuppliersService);
  private readonly treasuryService = inject(TreasuryService);
  private readonly toast = inject(ToastService);

  // ── state ──
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly treasuries = signal<LookupItem[]>([]);
  protected readonly loadingTreasuries = signal(false);
  protected readonly draftAmount = signal(0);

  // ── derived ──
  protected readonly isEdit = computed(() => this.payment() !== null);

  protected readonly submitLabel = computed(() => {
    if (this.isEdit()) return this.submitting() ? 'جاري الحفظ...' : 'حفظ التعديل';
    return this.submitting() ? 'جاري التسجيل...' : 'تسجيل الدفعة';
  });

  protected readonly remaining = computed(
    () => this.supplier()?.remainingAmount ?? 0,
  );

  protected readonly projectedOwed = computed(() =>
    Math.max(0, this.remaining() - this.draftAmount()),
  );

  protected readonly amountExceedsRemaining = computed(
    () => !this.isEdit() && this.draftAmount() > this.remaining() + 1e-9,
  );

  /** Keeps the edited payment's treasury selectable even if the lookup omits it. */
  protected readonly treasuryOptions = computed<SearchableSelectOption[]>(() => {
    const options = this.treasuries().map((t) => ({ value: t.id, label: t.name }));
    const p = this.payment();
    if (p?.treasuryId != null && !options.some((o) => o.value === p.treasuryId)) {
      options.push({ value: p.treasuryId, label: p.treasuryName ?? `#${p.treasuryId}` });
    }
    return options;
  });

  // ── form ──
  protected readonly form = this.fb.nonNullable.group({
    treasuryId: this.fb.control<number | null>(null, [Validators.required]),
    amount: [0, [Validators.required, Validators.min(0.01)]],
    paymentDate: [this.todayISO(), [Validators.required]],
    notes: [''],
  });

  constructor() {
    effect(
      () => {
        const sup = this.supplier();
        if (!this.open() || !sup) return;
        const p = this.payment();
        const amount = p ? p.amount : (sup.remainingAmount ?? 0);
        this.serverError.set(null);
        this.submitting.set(false);
        this.draftAmount.set(amount);
        this.form.reset({
          treasuryId: p?.treasuryId ?? null,
          amount,
          paymentDate: p?.date ? p.date.slice(0, 10) : this.todayISO(),
          notes: p?.notes ?? '',
        });
        this.loadTreasuries();
      },
      { allowSignalWrites: true },
    );
  }

  // ─────────── template handlers ───────────

  protected onAmountChange(value: string): void {
    this.draftAmount.set(Number(value) || 0);
  }

  protected useFullRemaining(): void {
    const amount = Number(this.remaining().toFixed(2));
    this.form.controls.amount.setValue(amount);
    this.draftAmount.set(amount);
  }

  protected onSubmit(): void {
    if (this.submitting()) return;
    const sup = this.supplier();
    if (!sup) return;

    if (this.form.invalid || this.amountExceedsRemaining()) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const payload: SupplierPaymentPayload = {
      treasuryId: Number(raw.treasuryId),
      amount: Number(raw.amount),
      paymentDate: raw.paymentDate,
      notes: (raw.notes ?? '').trim() || undefined,
    };
    const payment = this.payment();
    const request$ = payment
      ? this.suppliersService.updatePayment(sup.id, payment.id, payload)
      : this.suppliersService.pay(sup.id, payload);

    this.serverError.set(null);
    this.submitting.set(true);

    request$.subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.toast.success(
          payment
            ? `تم تعديل الدفعة بنجاح${res?.voucherNumber ? ` — سند رقم ${res.voucherNumber}` : ''}`
            : `تم تسجيل دفعة ${Number(raw.amount).toLocaleString('ar-EG')} ج.م للمورد ${res.supplierName}`,
        );
        this.paid.emit(res);
      },
      error: (err: ApiError) => {
        this.submitting.set(false);
        this.serverError.set(
          err.message || (payment ? 'تعذّر تعديل الدفعة' : 'تعذّر تسجيل الدفعة'),
        );
      },
    });
  }

  protected close(): void {
    if (this.submitting()) return;
    this.closed.emit();
  }

  protected isInvalid(field: keyof typeof this.form.controls): boolean {
    const ctrl = this.form.controls[field];
    return ctrl.invalid && (ctrl.dirty || ctrl.touched);
  }

  // ─────────── internals ───────────

  private loadTreasuries(): void {
    if (this.treasuries().length > 0) return;
    this.loadingTreasuries.set(true);
    this.treasuryService.lookup().subscribe({
      next: (list) => {
        this.treasuries.set(list ?? []);
        this.loadingTreasuries.set(false);
      },
      error: () => {
        this.treasuries.set([]);
        this.loadingTreasuries.set(false);
      },
    });
  }

  private todayISO(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
