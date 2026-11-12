import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { ShareholdersService } from '../../services/shareholders.service';
import { CapitalClassification } from '../../models/capital-classification.model';
import { CapitalClassificationFormModalComponent } from '../../components/capital-classification-form-modal/capital-classification-form-modal.component';

import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { DateArPipe } from '../../../../shared/pipes/date-ar.pipe';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';
import { FormMode } from '../../../../shared/models/form-mode.model';
import { PERMISSIONS } from '../../../../core/constants/permissions.const';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';

const DEFAULT_PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * تصنيفات رأس المال — CRUD list. View needs `Shareholders.View`;
 * add/edit/delete need `Shareholders.FullAccess`. Delete is disabled while
 * the classification is still used by capital movements (the server rejects
 * it anyway with an Arabic message we show verbatim).
 */
@Component({
  selector: 'app-capital-classifications',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    RouterLink,
    PaginationComponent,
    DateArPipe,
    HasPermissionDirective,
    CapitalClassificationFormModalComponent,
  ],
  templateUrl: './capital-classifications.component.html',
  styleUrl: './capital-classifications.component.scss',
})
export class CapitalClassificationsComponent {
  private readonly service = inject(ShareholdersService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  protected readonly PERMS = PERMISSIONS;
  protected readonly canManage = computed(() =>
    this.auth.hasPermission(PERMISSIONS.shareholdersFullAccess),
  );

  protected readonly rows = signal<CapitalClassification[]>([]);
  protected readonly loading = signal(false);
  protected readonly search = signal('');
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly count = signal(0);
  protected readonly totalPages = signal(0);
  protected readonly deletingId = signal<number | null>(null);

  protected readonly modalOpen = signal(false);
  protected readonly modalMode = signal<FormMode>('create');
  protected readonly modalItem = signal<CapitalClassification | null>(null);

  private readonly trigger = computed(() => ({
    search: this.search().trim(),
    pageIndex: this.pageIndex(),
    pageSize: this.pageSize(),
  }));

  private debounce: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const t = this.trigger();
      if (this.debounce) clearTimeout(this.debounce);
      this.debounce = setTimeout(() => this.fetch(t, false), SEARCH_DEBOUNCE_MS);
    });
  }

  protected refresh(): void {
    this.fetch(this.trigger(), true);
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    if (this.pageIndex() !== 1) this.pageIndex.set(1);
  }

  protected clearSearch(): void {
    this.onSearch('');
  }

  protected onPageChange(page: number): void {
    this.pageIndex.set(page);
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    if (this.pageIndex() !== 1) this.pageIndex.set(1);
  }

  protected openCreate(): void {
    this.modalItem.set(null);
    this.modalMode.set('create');
    this.modalOpen.set(true);
  }

  protected openEdit(c: CapitalClassification): void {
    this.modalItem.set(c);
    this.modalMode.set('edit');
    this.modalOpen.set(true);
  }

  protected closeModal(): void {
    this.modalOpen.set(false);
  }

  protected onSaved(): void {
    this.modalOpen.set(false);
    this.refresh();
  }

  protected async confirmDelete(c: CapitalClassification): Promise<void> {
    if (c.transactionsCount > 0) return;
    const ok = await this.dialog.confirm({
      title: 'حذف تصنيف',
      message: `هل أنت متأكد من حذف التصنيف "${c.name}"؟`,
      confirmText: 'حذف',
      cancelText: 'إلغاء',
      type: 'danger',
    });
    if (!ok) return;

    this.deletingId.set(c.id);
    this.service.deleteClassification(c.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.toast.success('تم حذف التصنيف بنجاح');
        if (this.rows().length === 1 && this.pageIndex() > 1) {
          this.pageIndex.update((p) => p - 1);
        } else {
          this.refresh();
        }
      },
      error: (err: ApiError) => {
        this.deletingId.set(null);
        this.toast.error(apiErrorToMessage(err, 'تعذّر حذف التصنيف'));
      },
    });
  }

  private fetch(t: ReturnType<typeof this.trigger>, force: boolean): void {
    this.loading.set(true);
    this.service.listClassifications(t, force).subscribe({
      next: (page) => {
        this.rows.set(page.data ?? []);
        this.count.set(page.count ?? 0);
        this.totalPages.set(page.totalPages ?? 0);
        this.loading.set(false);
      },
      error: (err: ApiError) => {
        this.rows.set([]);
        this.count.set(0);
        this.totalPages.set(0);
        this.loading.set(false);
        this.toast.error(apiErrorToMessage(err, 'تعذّر تحميل التصنيفات'));
      },
    });
  }
}
