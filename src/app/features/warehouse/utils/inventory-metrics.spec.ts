import { toInventoryAvailability } from '../constants/inventory-availability';
import {
  profitMarginPercent,
  salesValue,
  sellThroughPercent,
} from './inventory-metrics';

describe('inventory metrics', () => {
  it('derives sales value as sold cost plus profit', () => {
    expect(salesValue({ soldCost: 4_843_171, totalProfit: 98_461 })).toBe(4_941_632);
  });

  it('computes sell-through against purchased units and guards zero', () => {
    expect(sellThroughPercent({ purchasedQuantity: 342, soldQuantity: 295 })).toBe(86);
    expect(sellThroughPercent({ purchasedQuantity: 0, soldQuantity: 0 })).toBe(0);
  });

  it('computes profit margin against sales value', () => {
    expect(profitMarginPercent({ soldCost: 98, totalProfit: 2 })).toBe(2);
    expect(profitMarginPercent({ soldCost: 0, totalProfit: 0 })).toBe(0);
  });
});

describe('toInventoryAvailability', () => {
  it('accepts known values and falls back to "all"', () => {
    expect(toInventoryAvailability('available')).toBe('available');
    expect(toInventoryAvailability('unavailable')).toBe('unavailable');
    expect(toInventoryAvailability('true')).toBe('all');
    expect(toInventoryAvailability('')).toBe('all');
  });
});
