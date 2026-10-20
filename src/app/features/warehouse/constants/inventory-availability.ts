import { InventoryAvailability } from '../models/warehouse.model';

export interface InventoryAvailabilityOption {
  value: InventoryAvailability;
  label: string;
}

export const DEFAULT_INVENTORY_AVAILABILITY: InventoryAvailability = 'all';

/** Options for the inventory table's availability picker, in display order. */
export const INVENTORY_AVAILABILITY_OPTIONS: readonly InventoryAvailabilityOption[] = [
  { value: 'all',         label: 'الكل (متاح وغير متاح)' },
  { value: 'available',   label: 'المتاح فقط' },
  { value: 'unavailable', label: 'غير المتاح فقط' },
];

/** Narrows an untrusted `<select>` value; unknown values fall back to `all`. */
export function toInventoryAvailability(value: string): InventoryAvailability {
  return INVENTORY_AVAILABILITY_OPTIONS.some((o) => o.value === value)
    ? (value as InventoryAvailability)
    : DEFAULT_INVENTORY_AVAILABILITY;
}
