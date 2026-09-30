import { NavIconName } from '../../../shared/components/nav-icon/nav-icon.component';
import { BalanceProfitDto } from '../models/balance-check.model';

/** Palette keys — each maps to the global `--{tone}` / `--{tone}-l` CSS variables. */
export type BalanceTone = 'bl' | 'gr' | 'am' | 're' | 'te' | 'pu' | 'pi';

export type AssetSectionKey =
  | 'treasuries'
  | 'receivables'
  | 'inventory'
  | 'subAccounts';

export type ObligationSectionKey = 'capital' | 'profit' | 'suppliers';

export type BalanceSectionKey = AssetSectionKey | ObligationSectionKey;

export interface BalanceSectionMeta {
  readonly title: string;
  readonly description: string;
  readonly icon: NavIconName;
  readonly tone: BalanceTone;
}

/**
 * Presentation metadata for every reconciliation line. Declaration order is
 * the render order (and the order of the composition-bar segments).
 */
export const ASSET_SECTIONS: Readonly<Record<AssetSectionKey, BalanceSectionMeta>> = {
  treasuries: {
    title: 'الخزائن',
    description: 'أرصدة كل الخزائن النقدية والبنكية — بدون خزائن الأرباح',
    icon: 'wallet',
    tone: 'bl',
  },
  receivables: {
    title: 'المستحقات',
    description: 'إجمالي الأقساط المستحقة على العملاء ولم تُسدَّد بعد',
    icon: 'file-invoice',
    tone: 'gr',
  },
  inventory: {
    title: 'المخزون',
    description: 'قيمة البضاعة المتاحة في المخازن بسعر الشراء',
    icon: 'warehouse',
    tone: 'am',
  },
  subAccounts: {
    title: 'الحسابات الفرعية',
    description: 'صافي أرصدة الحسابات الفرعية المرتبطة بالمناديب',
    icon: 'users',
    tone: 'pu',
  },
};

export const OBLIGATION_SECTIONS: Readonly<
  Record<ObligationSectionKey, BalanceSectionMeta>
> = {
  capital: {
    title: 'رأس مال الشركاء',
    description: 'إجمالي مساهمات الشركاء في رأس المال',
    icon: 'hand-coin',
    tone: 'te',
  },
  profit: {
    title: 'الأرباح',
    description: 'صافي الأرباح غير الموزعة بعد المصروفات والعمولات',
    icon: 'chart',
    tone: 'gr',
  },
  suppliers: {
    title: 'مستحقات الموردين',
    description: 'المتبقي للموردين على فواتير المشتريات المفتوحة',
    icon: 'truck',
    tone: 're',
  },
};

export interface ProfitLineMeta {
  readonly key: Exclude<keyof BalanceProfitDto, 'totalProfit'>;
  readonly label: string;
  readonly hint: string;
  /** `+1` adds to net profit, `-1` is deducted from it. */
  readonly sign: 1 | -1;
}

/**
 * Net-profit equation, in reading order:
 *   contracts profit + revenues − expenses − distributed − commissions
 */
export const PROFIT_LINES: ReadonlyArray<ProfitLineMeta> = [
  {
    key: 'grossContractsProfit',
    label: 'ربح العقود',
    hint: 'إجمالي هامش الربح على عقود التقسيط',
    sign: 1,
  },
  {
    key: 'revenues',
    label: 'الإيرادات',
    hint: 'الإيرادات الأخرى المسجلة',
    sign: 1,
  },
  {
    key: 'expenses',
    label: 'المصروفات',
    hint: 'المصروفات التشغيلية',
    sign: -1,
  },
  {
    key: 'distributedProfit',
    label: 'الأرباح الموزعة',
    hint: 'حصص المساهمين المصروفة عند التوزيع',
    sign: -1,
  },
  {
    key: 'representativeCommission',
    label: 'عمولة المناديب',
    hint: 'العمولات المستحقة للمناديب',
    sign: -1,
  },
];

export const BALANCE_CHECK_COPY = {
  title: 'ميزان المراجعة',
  subtitle: 'مطابقة إجمالي الأصول مع إجمالي الالتزامات — يجب أن يكون الفرق صفرًا',
  loadError: 'تعذّر تحميل ميزان المراجعة. حاول مجددًا.',
  forbidden: 'ليس لديك صلاحية لعرض ميزان المراجعة.',
} as const;
