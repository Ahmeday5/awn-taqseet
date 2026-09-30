import { BalanceCheckDto } from '../models/balance-check.model';
import { normalizeBalanceCheck } from './balance-check.normalize';
import {
  average,
  buildAssetSegments,
  buildProfitLines,
  shareOf,
} from './balance-check.view-model';

describe('balance-check utils', () => {
  describe('normalizeBalanceCheck', () => {
    it('fills missing arrays and numbers with safe defaults', () => {
      const dto = normalizeBalanceCheck({} as Partial<BalanceCheckDto>);

      expect(dto.assets.treasuries).toEqual([]);
      expect(dto.assets.receivables.amount).toBe(0);
      expect(dto.obligations.profit.totalProfit).toBe(0);
      expect(dto.difference).toBe(0);
      expect(dto.isBalanced).toBeTrue();
    });

    it('keeps the server verdict and totals verbatim', () => {
      const dto = normalizeBalanceCheck({
        assets: { total: 100 } as BalanceCheckDto['assets'],
        obligations: { total: 90 } as BalanceCheckDto['obligations'],
        difference: 10,
        isBalanced: false,
      });

      expect(dto.assets.total).toBe(100);
      expect(dto.difference).toBe(10);
      expect(dto.isBalanced).toBeFalse();
    });

    it('derives the difference when the server omits it', () => {
      const dto = normalizeBalanceCheck({
        assets: { total: 50 } as BalanceCheckDto['assets'],
        obligations: { total: 80 } as BalanceCheckDto['obligations'],
      });

      expect(dto.difference).toBe(-30);
      expect(dto.isBalanced).toBeFalse();
    });
  });

  describe('shareOf', () => {
    it('returns a clamped percentage of magnitudes', () => {
      expect(shareOf(25, 100)).toBe(25);
      expect(shareOf(-25, 100)).toBe(25);
      expect(shareOf(150, 100)).toBe(100);
    });

    it('returns 0 for a zero whole', () => {
      expect(shareOf(10, 0)).toBe(0);
    });
  });

  it('average returns 0 when count is 0', () => {
    expect(average(100, 0)).toBe(0);
    expect(average(100, 4)).toBe(25);
  });

  it('buildAssetSegments splits the composition bar to 100%', () => {
    const dto = normalizeBalanceCheck({
      assets: {
        treasuriesTotal: 50,
        receivables: { amount: 30, contractsCount: 1, installmentsCount: 1 },
        inventoryTotal: 20,
        subAccountsTotal: 0,
      } as BalanceCheckDto['assets'],
    });

    const segments = buildAssetSegments(dto.assets);
    const sum = segments.reduce((s, x) => s + x.share, 0);

    expect(segments.map((s) => s.key)).toEqual([
      'treasuries',
      'receivables',
      'inventory',
      'subAccounts',
    ]);
    expect(sum).toBeCloseTo(100, 6);
    expect(segments[0].share).toBe(50);
  });

  it('buildProfitLines signs deductions and scales bars to the largest term', () => {
    const lines = buildProfitLines({
      grossContractsProfit: 1000,
      revenues: 200,
      expenses: 100,
      distributedProfit: 500,
      representativeCommission: 0,
      totalProfit: 600,
    });

    expect(lines.map((l) => l.sign)).toEqual([1, 1, -1, -1, -1]);
    expect(lines[0].weight).toBe(100);
    expect(lines[3].weight).toBe(50);
    expect(lines[4].weight).toBe(0);
  });
});
