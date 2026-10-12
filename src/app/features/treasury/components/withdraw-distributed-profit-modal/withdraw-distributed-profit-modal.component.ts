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

import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { todayIsoDate } from '../../../../shared/utils/date-iso.util';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';

import { ShareholdersService } from '../../services/shareholders.service';
import { WithdrawDistributedProfitPayload } from '../../models/capital-transaction.model';
import { ShareholderTreasuryLookup } from '../../models/shareholder-treasury-lookup.model';

const MIN_AMOUNT = 0.01;
const SUCCESS_MESSAGE = 'تم صرف الأرباح الموزعة للمساهم.';
const FALLBACK_ERROR = 'تعذّر صرف الأرباح الموزعة';

/** Money is exchanged with the API at 2-decimal precision. */
function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Pays part of a shareholder's distributed profit out in cash from a chosen
 * treasury. Capital is untouched — only the distributed-profit balance and the
 * treasury balance go down.
 *
 *   <app-withdraw-distributed-profit-modal
 *     [open]="withdrawOpen()"
 *     [shareholderId]="sh.id"
 *     [availableBalance]="st.distributedProfitBalance"
 *     (closed)="closeWithdraw()"
 *     (withdrawn)="onWithdrawn()" />
 *
 * The form is re-seeded every time the modal opens: amount defaults to (and is
 * capped at) the available balance, date defaults to today.
 */
@Component({
  selector: 'app-withdraw-distributed-profit-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ModalComponent,
    FormErrorComponent,
    SearchableSelectComponent,
    CurrencyArPipe,
  ],
  templateUrl: './withdraw-distributed-profit-modal.component.html',
  styleUrl: './withdraw-distributed-profit-modal.component.scss',
})
export class WithdrawDistributedProfitModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly shareholderId = input<number | null>(null);
  /** Distributed profit still available — the amount's upper bound. */
  readonly availableBalance = input<number>(0);

  // ── outputs ──
  readonly closed = output<void>();
  readonly withdrawn = output<void>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ShareholdersService);
  private readonly toast = inject(ToastService);

  // ── state ──
  protected readonly submitting = signal(false);
  protected readonly treasuries = signal<ShareholderTreasuryLookup[]>([]);
  protected readonly treasuriesLoading = signal(false);

  // ── form ──
  protected readonly form = this.fb.group({
    amount: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(MIN_AMOUNT),
    ]),
    treasuryId: this.fb.control<number | null>(null, [Validators.required]),
    date: this.fb.nonNullable.control(todayIsoDate()),
    notes: this.fb.nonNullable.control(''),
  });

  private readonly draftAmount = toSignal(this.form.controls.amount.valueChanges, {
    initialValue: null,
  });

  // ── derived ──
  protected readonly maxAmount = computed(() => roundMoney(this.availableBalance()));

  protected readonly amount = computed(() => roundMoney(this.draftAmount() ?? 0));

  protected readonly remainingBalance = computed(() =>
    Math.max(0, roundMoney(this.maxAmount() - this.amount())),
  );

  protected readonly hasBalance = computed(() => this.maxAmount() > 0);

  protected readonly treasuryOptions = computed<SearchableSelectOption[]>(() =>
    this.treasuries().map((t) => ({
      value: t.id,
      label: t.name,
      hint: t.representativeName ?? undefined,
    })),
  );

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.resetForm();
        if (!this.treasuries().length) this.loadTreasuries();
      });
    });
  }

  // ─────────── template handlers ───────────

  protected useFullBalance(): void {
    this.form.controls.amount.setValue(this.maxAmount());
    this.form.controls.amount.markAsDirty();
  }

  protected submit(): void {
    if (this.submitting()) return;
    const shareholderId = this.shareholderId();
    if (shareholderId == null) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.service
      .withdrawDistributedProfit(shareholderId, this.toPayload())
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.toast.success(SUCCESS_MESSAGE);
          this.withdrawn.emit();
        },
        error: (err: ApiError) => {
          this.submitting.set(false);
          this.toast.error(apiErrorToMessage(err, FALLBACK_ERROR));
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

  private resetForm(): void {
    const max = this.maxAmount();
    this.form.controls.amount.setValidators([
      Validators.required,
      Validators.min(MIN_AMOUNT),
      Validators.max(max),
    ]);
    this.form.reset({
      amount: max > 0 ? max : null,
      treasuryId: null,
      date: todayIsoDate(),
      notes: '',
    });
    this.submitting.set(false);
  }

  private loadTreasuries(): void {
    this.treasuriesLoading.set(true);
    this.service.treasuriesLookup().subscribe({
      next: (list) => {
        this.treasuries.set(list ?? []);
        this.treasuriesLoading.set(false);
      },
      error: () => {
        this.treasuries.set([]);
        this.treasuriesLoading.set(false);
      },
    });
  }

  private toPayload(): WithdrawDistributedProfitPayload {
    const raw = this.form.getRawValue();
    const notes = raw.notes.trim();
    return {
      amount: roundMoney(raw.amount ?? 0),
      treasuryId: Number(raw.treasuryId),
      ...(raw.date ? { date: raw.date } : {}),
      ...(notes ? { notes } : {}),
    };
  }
}
