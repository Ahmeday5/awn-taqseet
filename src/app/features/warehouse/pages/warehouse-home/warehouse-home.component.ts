import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { WarehouseService } from '../../services/warehouse.service';
import {
  InventoryAvailability,
  Warehouse,
  WarehouseInventoryItem,
  WarehouseInventoryQuery,
  WarehouseInventoryResponse,
  WarehouseInventoryTotals,
  WarehouseInventoryWarehouseTotals,
  WarehouseSummary,
} from '../../models/warehouse.model';
import {
  DEFAULT_INVENTORY_AVAILABILITY,
  INVENTORY_AVAILABILITY_OPTIONS,
  toInventoryAvailability,
} from '../../constants/inventory-availability';
import { salesValue } from '../../utils/inventory-metrics';
import { WarehouseFormModalComponent } from '../../components/warehouse-form-modal/warehouse-form-modal.component';
import { InventoryTotalsStripComponent } from '../../components/inventory-totals-strip/inventory-totals-strip.component';
import { WarehouseTotalsBreakdownComponent } from '../../components/warehouse-totals-breakdown/warehouse-totals-breakdown.component';
import { FormMode } from '../../../../shared/models/form-mode.model';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { HttpCacheService } from '../../../../core/services/http-cache.service';
import { onInvalidate } from '../../../../core/utils/auto-refresh.util';
import { ApiError } from '../../../../core/models/api-response.model';
import { PERMISSIONS } from '../../../../core/constants/permissions.const';
import { AuthService } from '../../../../core/services/auth.service';

/**
 * Per-card cycling palette. The summary endpoint doesn't expose a "color"
 * yet, so we rotate through three tones to match the prototype's visual
 * rhythm (teal / purple / amber). Picked deterministically by card index
 * so the same warehouse always gets the same color across renders.
 */
const CARD_PALETTE = ['te', 'pu', 'am'] as const;
const BADGE_PALETTE = ['bte', 'bpu', 'bwarn'] as const;

const INVENTORY_PAGE_SIZE = 10;

/**
 * Warehouse home page.
 *
 * Owns three concerns:
 *
 *   1. Live warehouse summary (`/dashboard/warehouses/summary`) — drives
 *      the card grid with real purchased/sold/available/value/profit.
 *
 *   2. Live per-warehouse inventory (`/dashboard/warehouses/inventory`)
 *      — paginated + name-searchable, fed by a warehouse picker, with
 *      grand totals and (for "all warehouses") a per-warehouse breakdown.
 *
 *   3. CRUD modal (create / edit / delete) for warehouses themselves.
 *      Every successful mutation re-fetches the summary so the cards
 *      stay canonical (no optimistic drift).
 */
@Component({
  selector: 'app-warehouse-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DecimalPipe,
    CurrencyArPipe,
    PaginationComponent,
    WarehouseFormModalComponent,
    InventoryTotalsStripComponent,
    WarehouseTotalsBreakdownComponent,
  ],
  templateUrl: './warehouse-home.component.html',
  styleUrl: './warehouse-home.component.scss',
})
export class WarehouseHomeComponent implements OnInit {
  private readonly svc    = inject(WarehouseService);
  private readonly dialog = inject(DialogService);
  private readonly toast  = inject(ToastService);

  /** Exposed so the template can gate write actions with `*appHasPermission`. */
  protected readonly PERMS = PERMISSIONS;
  private readonly cache  = inject(HttpCacheService);
  private readonly auth   = inject(AuthService);

  protected readonly canWrite = computed(
    () =>
      this.auth.hasPermission(PERMISSIONS.warehousesFullAccess) ||
      this.auth.hasAnyRole(['Representative']),
  );

  constructor() {
    // Auto-refresh whenever any warehouse-related cache key is
    // invalidated — own CRUD, plus any invoice/inventory mutation
    // that touches the per-warehouse aggregates.
    onInvalidate(this.cache, 'warehous', () => {
      this.refreshSummary();
      this.refreshInventory();
    });
  }

  // ── live summary (cards) ──
  protected readonly warehouses = signal<WarehouseSummary[]>([]);
  protected readonly loading    = signal(false);

  // ── live inventory (table) ──
  protected readonly inventory   = signal<WarehouseInventoryItem[]>([]);
  protected readonly invLoading  = signal(false);
  /** Selected warehouse for the inventory table; 0 = all warehouses. */
  protected readonly selectedWarehouseId = signal<number>(0);
  protected readonly invSearch   = signal('');
  protected readonly invAvailability = signal<InventoryAvailability>(DEFAULT_INVENTORY_AVAILABILITY);
  protected readonly availabilityOptions = INVENTORY_AVAILABILITY_OPTIONS;
  protected readonly invPageIndex = signal(1);
  protected readonly invPageSize  = signal(INVENTORY_PAGE_SIZE);
  protected readonly invCount      = signal(0);
  protected readonly invTotalPages = signal(0);
  /** Aggregates over the whole filtered result set, not just this page. */
  protected readonly invTotals          = signal<WarehouseInventoryTotals | null>(null);
  protected readonly invWarehouseTotals = signal<WarehouseInventoryWarehouseTotals[]>([]);

  /** Per-warehouse breakdown only makes sense when no single warehouse is picked. */
  protected readonly showWarehouseBreakdown = computed(
    () => this.selectedWarehouseId() === 0 && this.invWarehouseTotals().length > 0,
  );

  private readonly inventoryCard = viewChild<ElementRef<HTMLElement>>('inventoryCard');

  // ── modal state ──
  protected readonly modalOpen      = signal(false);
  protected readonly modalMode      = signal<FormMode>('create');
  protected readonly modalWarehouse = signal<Warehouse | null>(null);
  protected readonly deletingId     = signal<number | null>(null);

  // ── derived ──
  protected readonly inventoryRows = computed(() =>
    this.inventory().map((item) => ({ ...item, salesValue: salesValue(item) })),
  );
  protected readonly hasWarehouses = computed(
    () => this.warehouses().length > 0,
  );
  protected readonly criticalCount = computed(
    () => this.warehouses().filter((w) => w.needsRestock).length,
  );

  /** Search-only debounce — pagination + warehouse changes fire immediately. */
  private invDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.loadSummary();
    this.fetchInventoryNow();
  }

  // ─────────── data loaders ───────────

  protected loadSummary(): void {
    this.fetchSummary(false);
  }

  /** Force-refresh the summary cards, bypassing the cache. */
  protected refreshSummary(): void {
    this.fetchSummary(true);
  }

  private fetchSummary(force: boolean): void {
    this.loading.set(true);
    const stream$ = force ? this.svc.refreshSummary() : this.svc.summary();
    stream$.subscribe({
      next: (list) => {
        this.warehouses.set(list ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.warehouses.set([]);
        this.loading.set(false);
      },
    });
  }

  protected refreshInventory(): void {
    this.fetchInventoryNow(true);
  }

  /**
   * Fire an inventory fetch immediately (no debounce). Used by warehouse
   * picker, pagination, manual refresh — anything that maps to a single
   * deliberate user action where waiting would feel sluggish.
   */
  private fetchInventoryNow(force = false): void {
    if (this.invDebounceTimer) {
      clearTimeout(this.invDebounceTimer);
      this.invDebounceTimer = null;
    }
    this.fetchInventory(force);
  }

  /**
   * Fire an inventory fetch after 300ms — used by the search input so
   * typing doesn't issue a request per keystroke.
   */
  private fetchInventoryDebounced(): void {
    if (this.invDebounceTimer) clearTimeout(this.invDebounceTimer);
    this.invDebounceTimer = setTimeout(() => this.fetchInventory(false), 300);
  }

  private fetchInventory(force: boolean): void {
    const query: WarehouseInventoryQuery = {
      warehouseId: this.selectedWarehouseId(),
      search: this.invSearch().trim(),
      availability: this.invAvailability(),
      pageIndex: this.invPageIndex(),
      pageSize: this.invPageSize(),
    };

    this.invLoading.set(true);
    const stream$ = force
      ? this.svc.refreshInventory(query)
      : this.svc.inventory(query);
    stream$.subscribe({
      next: (res) => {
        this.applyInventory(res);
        this.invLoading.set(false);
      },
      error: () => {
        this.applyInventory(null);
        this.invLoading.set(false);
      },
    });
  }

  private applyInventory(res: WarehouseInventoryResponse | null): void {
    this.inventory.set(res?.data ?? []);
    this.invCount.set(res?.count ?? 0);
    this.invTotalPages.set(res?.totalPages ?? 0);
    this.invTotals.set(res?.totals ?? null);
    this.invWarehouseTotals.set(res?.warehouseTotals ?? []);
  }

  // ─────────── inventory filter handlers ───────────

  protected onWarehouseChange(value: string): void {
    const id = Number(value) || 0;
    this.selectedWarehouseId.set(id);
    this.invPageIndex.set(1);
    this.fetchInventoryNow();
  }

  protected onInvSearch(value: string): void {
    this.invSearch.set(value);
    if (this.invPageIndex() !== 1) this.invPageIndex.set(1);
    this.fetchInventoryDebounced();
  }

  protected onInvAvailabilityChange(value: string): void {
    this.invAvailability.set(toInventoryAvailability(value));
    this.invPageIndex.set(1);
    this.fetchInventoryNow();
  }

  /** Drill-down from the per-warehouse breakdown into that warehouse's rows. */
  protected onBreakdownWarehouseSelect(warehouseId: number): void {
    this.onWarehouseChange(String(warehouseId));
    this.inventoryCard()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected onInvPageChange(page: number): void {
    this.invPageIndex.set(page);
    this.fetchInventoryNow();
  }

  protected onInvPageSizeChange(size: number): void {
    this.invPageSize.set(size);
    this.invPageIndex.set(1);
    this.fetchInventoryNow();
  }

  // ─────────── modal handlers ───────────

  protected openCreate(): void {
    this.modalWarehouse.set(null);
    this.modalMode.set('create');
    this.modalOpen.set(true);
  }

  protected openEdit(warehouse: WarehouseSummary | Warehouse): void {
    this.modalWarehouse.set(this.toWarehouse(warehouse));
    this.modalMode.set('edit');
    this.modalOpen.set(true);
  }

  protected closeModal(): void {
    this.modalOpen.set(false);
  }

  protected onSaved(_saved: Warehouse): void {
    this.modalOpen.set(false);
    // Re-fetch from server (bypassing cache) so the cached entry that
    // survives F5 stays canonical — no optimistic drift.
    this.refreshSummary();
  }

  // ─────────── delete ───────────

  protected async confirmDelete(warehouse: WarehouseSummary): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'حذف مخزن',
      message: `هل أنت متأكد من حذف "${warehouse.name}"؟ هذا الإجراء لا يمكن التراجع عنه.`,
      confirmText: 'حذف',
      cancelText: 'إلغاء',
      type: 'danger',
    });
    if (!ok) return;

    this.deletingId.set(warehouse.id);
    this.svc.delete(warehouse.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.toast.success('تم حذف المخزن بنجاح');
        this.refreshSummary();
        // If the deleted warehouse was selected for inventory, reset to "all".
        if (this.selectedWarehouseId() === warehouse.id) {
          this.selectedWarehouseId.set(0);
          this.fetchInventoryNow();
        }
      },
      error: (_err: ApiError) => this.deletingId.set(null),
    });
  }

  // ─────────── view helpers ───────────

  protected colorVar(index: number): string {
    return `var(--${CARD_PALETTE[index % CARD_PALETTE.length]})`;
  }

  protected badgeClass(index: number): string {
    return BADGE_PALETTE[index % BADGE_PALETTE.length];
  }

  /**
   * Adapt a `WarehouseSummary` row (what the cards render from) into
   * the `Warehouse` shape the form modal expects. Avoids a separate
   * GET call when the user opens the edit dialog.
   */
  private toWarehouse(w: WarehouseSummary | Warehouse): Warehouse {
    return {
      id: w.id,
      name: w.name,
      location: w.location,
      isActive: w.isActive,
      createdAt: (w as Warehouse).createdAt ?? '',
    };
  }
}
