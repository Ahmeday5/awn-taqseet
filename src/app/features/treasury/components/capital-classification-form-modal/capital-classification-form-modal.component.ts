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
import { FormMode } from '../../../../shared/models/form-mode.model';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';

import { ShareholdersService } from '../../services/shareholders.service';
import {
  CapitalClassification,
  CLASSIFICATION_NAME_MAX,
  CLASSIFICATION_NOTES_MAX,
} from '../../models/capital-classification.model';

/** Create / edit a capital classification (تصنيف رأس المال). */
@Component({
  selector: 'app-capital-classification-form-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ModalComponent, FormErrorComponent],
  templateUrl: './capital-classification-form-modal.component.html',
})
export class CapitalClassificationFormModalComponent {
  readonly open = input.required<boolean>();
  readonly mode = input<FormMode>('create');
  readonly classification = input<CapitalClassification | null>(null);

  readonly closed = output<void>();
  readonly saved = output<CapitalClassification>();

  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ShareholdersService);
  private readonly toast = inject(ToastService);

  protected readonly NAME_MAX = CLASSIFICATION_NAME_MAX;
  protected readonly NOTES_MAX = CLASSIFICATION_NOTES_MAX;

  protected readonly submitting = signal(false);
  /** Server message shown verbatim (e.g. "يوجد تصنيف بنفس الاسم بالفعل."). */
  protected readonly serverError = signal<string | null>(null);

  protected readonly isCreate = computed(() => this.mode() === 'create');
  protected readonly title = computed(() =>
    this.isCreate() ? 'إضافة تصنيف رأس مال' : 'تعديل تصنيف رأس المال',
  );

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(CLASSIFICATION_NAME_MAX)]],
    notes: ['', [Validators.maxLength(CLASSIFICATION_NOTES_MAX)]],
  });

  constructor() {
    effect(
      () => {
        if (!this.open()) return;
        const c = this.classification();
        this.submitting.set(false);
        this.serverError.set(null);
        this.form.reset({
          name: this.isCreate() ? '' : (c?.name ?? ''),
          notes: this.isCreate() ? '' : (c?.notes ?? ''),
        });
      },
      { allowSignalWrites: true },
    );
  }

  protected submit(): void {
    if (this.submitting()) return;
    const name = this.form.controls.name.value.trim();
    if (!name) this.form.controls.name.setValue('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = {
      name,
      notes: this.form.controls.notes.value.trim() || null,
    };
    const editing = this.classification();
    const req$ =
      this.isCreate() || !editing
        ? this.service.createClassification(payload)
        : this.service.updateClassification(editing.id, payload);

    this.serverError.set(null);
    this.submitting.set(true);
    req$.subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.toast.success(
          this.isCreate() ? 'تمت إضافة التصنيف بنجاح' : 'تم تعديل التصنيف بنجاح',
        );
        this.saved.emit(res);
      },
      error: (err: ApiError) => {
        this.submitting.set(false);
        this.serverError.set(apiErrorToMessage(err, 'تعذّر حفظ التصنيف'));
      },
    });
  }

  protected close(): void {
    if (this.submitting()) return;
    this.closed.emit();
  }
}
