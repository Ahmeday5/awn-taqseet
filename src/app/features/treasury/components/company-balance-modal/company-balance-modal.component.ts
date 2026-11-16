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
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin, map } from 'rxjs';

import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select.component';
import { shortenVoucherNumber } from '../../../../shared/components/voucher-number/voucher-number.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { todayIsoDate } from '../../../../shared/utils/date-iso.util';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';

import { ShareholdersService } from '../../services/shareholders.service';
import {
  CompanyBalanceTransaction,
  CompanyBalanceTransactionPayload,
  CompanyBalanceTxEditTarget,
  CompanyBalanceTxType,
} from '../../models/shareholder.model';

const TYPE_OPTIONS: ReadonlyArray<{ value: CompanyBalanceTxType; label: string }> = [
  { value: CompanyBalanceTxType.Deposit, label: 'إيداع' },
  { value: CompanyBalanceTxType.Withdrawal, label: 'سحب' },
];

/** Signed effect of a movement on the company balance. */
function signedAmount(type: CompanyBalanceTxType, amount: number): number {
  return type === CompanyBalanceTxType.Deposit ? amount : -amount;
}

/**
 * Deposit to / withdraw from the company's own balance, or edit an existing
 * manual movement.
 *
 *  - create: `POST shareholders/company-balance/transactions` — the type is
 *    fixed by the button that opened the modal.
 *  - edit (`transaction` set): `PUT …/transactions/{id}` — the type can be
 *    switched.
 *
 * Every movement moves real money through a treasury, so the treasury is
 * required — except when editing a legacy movement that never had one,
 * where leaving it empty keeps it as is (the API treats `null` as "keep").
 * Withdrawals are deliberately NOT capped: the company balance may go
 * negative, so the projection only colours a negative result red.
 */
@Component({
  selector: 'app-company-balance-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ModalComponent,
    FormErrorComponent,
    SearchableSelectComponent,
    CurrencyArPipe,
  ],
  templateUrl: './company-balance-modal.component.html',
})
export class CompanyBalanceModalComponent {
  readonly open = input.required<boolean>();
  /** Create mode only — the movement type chosen by the opening button. */
  readonly type = input<CompanyBalanceTxType>(CompanyBalanceTxType.Deposit);
  /** Movement being edited; null = create mode. */
  readonly transaction = input<CompanyBalanceTxEditTarget | null>(null);
  /** Current company balance, for the live projection. */
  readonly currentBalance = input<number>(0);

  readonly closed = output<void>();
  readonly saved = output<CompanyBalanceTransaction>();

  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ShareholdersService);
  private readonly toast = inject(ToastService);

  protected readonly typeOptions = TYPE_OPTIONS;
  protected readonly CompanyBalanceTxType = CompanyBalanceTxType;

  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  // ── lookups ──
  protected readonly treasuryOptions = signal<SearchableSelectOption[]>([]);
  protected readonly classificationOptions = signal<SearchableSelectOption[]>([]);
  protected readonly lookupsLoading = signal(false);
  protected readonly lookupsError = signal<string | null>(null);
  private lookupsLoaded = false;

  protected readonly form = this.fb.group({
    type: this.fb.nonNullable.control<CompanyBalanceTxType>(CompanyBalanceTxType.Deposit),
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    date: this.fb.nonNullable.control(todayIsoDate(), [Validators.required]),
    treasuryId: this.fb.control<number | null>(null),
    capitalClassificationId: this.fb.control<number | null>(null),
    notes: this.fb.nonNullable.control(''),
  });

  private readonly formValue = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  // ── derived ──
  protected readonly isEdit = computed(() => this.transaction() !== null);
  protected readonly isDeposit = computed(
    () => this.formValue().type === CompanyBalanceTxType.Deposit,
  );

  /** A legacy movement recorded before treasuries were required. */
  protected readonly isLegacy = computed(
    () => this.isEdit() && this.transaction()?.treasuryId == null,
  );

  protected readonly title = computed(() => {
    const tx = this.transaction();
    if (tx) {
      const voucher = shortenVoucherNumber(tx.voucherNumber);
      return voucher ? `تعديل عملية رصيد الشركة — ${voucher}` : 'تعديل عملية رصيد الشركة';
    }
    return this.isDeposit() ? 'إيداع لرصيد الشركة' : 'سحب من رصيد الشركة';
  });

  /** Balance after saving: in edit mode the original movement is backed out first. */
  protected readonly projected = computed(() => {
    const v = this.formValue();
    const draft = signedAmount(v.type, Number(v.amount) || 0);
    const tx = this.transaction();
    const original = tx ? signedAmount(tx.type, tx.amount) : 0;
    return this.currentBalance() - original + draft;
  });

  protected readonly submitLabel = computed(() => {
    if (this.submitting()) return 'جاري الحفظ...';
    if (this.isEdit()) return 'حفظ التعديل';
    return this.isDeposit() ? 'تسجيل الإيداع' : 'تسجيل السحب';
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const tx = this.transaction();
      const type = this.type();
      untracked(() => {
        this.resetForm(tx, type);
        this.loadLookups();
      });
    });
  }

  protected submit(): void {
    if (this.submitting()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = this.toPayload();
    const tx = this.transaction();
    const request$ = tx
      ? this.service.updateCompanyBalanceTransaction(tx.id, payload)
      : this.service.createCompanyBalanceTransaction(payload);

    this.serverError.set(null);
    this.submitting.set(true);
    request$.subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.toast.success(this.successMessage(res));
        this.saved.emit(res);
      },
      error: (err: ApiError) => {
        this.submitting.set(false);
        // The API returns Arabic messages ("الخزنة مطلوبة." …) — shown verbatim.
        this.serverError.set(
          apiErrorToMessage(err, tx ? 'تعذّر تعديل العملية' : 'تعذّر تنفيذ العملية'),
        );
      },
    });
  }

  protected close(): void {
    if (this.submitting()) return;
    this.closed.emit();
  }

  protected retryLookups(): void {
    this.lookupsLoaded = false;
    this.loadLookups();
  }

  // ─────────── internals ───────────

  private resetForm(tx: CompanyBalanceTxEditTarget | null, type: CompanyBalanceTxType): void {
    this.submitting.set(false);
    this.serverError.set(null);

    // Required on create; on edit only when the movement already has a
    // treasury (a legacy one may stay without — null keeps it unchanged).
    const treasury = this.form.controls.treasuryId;
    treasury.setValidators(!tx || tx.treasuryId != null ? [Validators.required] : []);

    this.form.reset({
      type: tx?.type ?? type,
      amount: tx?.amount ?? null,
      date: tx?.date ? tx.date.slice(0, 10) : todayIsoDate(),
      treasuryId: tx?.treasuryId ?? null,
      capitalClassificationId: tx?.capitalClassificationId ?? null,
      notes: tx?.notes ?? '',
    });
  }

  private toPayload(): CompanyBalanceTransactionPayload {
    const raw = this.form.getRawValue();
    return {
      type: raw.type,
      amount: Number(raw.amount) || 0,
      date: raw.date || null,
      treasuryId: raw.treasuryId != null ? Number(raw.treasuryId) : null,
      // Always sent: on PUT, null would clear the classification.
      capitalClassificationId:
        raw.capitalClassificationId != null ? Number(raw.capitalClassificationId) : null,
      notes: raw.notes.trim() || null,
    };
  }

  private successMessage(res: CompanyBalanceTransaction): string {
    const voucher = res?.voucherNumber ? ` — سند رقم ${shortenVoucherNumber(res.voucherNumber)}` : '';
    if (this.isEdit()) return `تم تعديل العملية بنجاح${voucher}`;
    return (
      (this.isDeposit() ? 'تم الإيداع لرصيد الشركة بنجاح' : 'تم السحب من رصيد الشركة بنجاح') +
      voucher
    );
  }

  /** Both lists are cached by the service; loaded once per component lifetime. */
  private loadLookups(): void {
    if (this.lookupsLoaded || this.lookupsLoading()) return;
    this.lookupsLoading.set(true);
    this.lookupsError.set(null);

    forkJoin({
      treasuries: this.service.treasuriesLookup(),
      classifications: this.service.allClassifications(),
    }).subscribe({
      next: ({ treasuries, classifications }) => {
        this.treasuryOptions.set(
          treasuries.map((t) => ({
            value: t.id,
            label: t.name,
            hint: t.representativeName ?? undefined,
          })),
        );
        this.classificationOptions.set(
          classifications.map((c) => ({ value: c.id, label: c.name })),
        );
        this.lookupsLoaded = true;
        this.lookupsLoading.set(false);
      },
      error: (err: ApiError) => {
        this.lookupsLoading.set(false);
        this.lookupsError.set(apiErrorToMessage(err, 'تعذّر تحميل الخزائن والتصنيفات'));
      },
    });
  }
}
