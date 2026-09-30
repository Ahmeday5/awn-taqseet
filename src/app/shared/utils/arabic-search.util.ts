/**
 * Folds the Arabic spelling variants users type interchangeably so a
 * client-side search for "احمد" also matches "أحمد", "مكة" matches "مكه",
 * and so on. Also strips tashkeel/tatweel and lower-cases Latin text.
 */
export function normalizeArabic(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/[ً-ٰٟـ]/g, '') // diacritics + tatweel
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .trim()
    .toLowerCase();
}
