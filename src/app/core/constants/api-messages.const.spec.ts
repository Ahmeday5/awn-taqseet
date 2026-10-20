import { translateApiMessage } from './api-messages.const';

describe('translateApiMessage — verbatim purchase-invoice guards', () => {
  it('keeps the partly-sold delete guard exactly as sent', () => {
    const msg =
      "لا يمكن حذف هذه الفاتورة: تم بيع 3 من كمية المنتج 'X' من هذه الفاتورة. ألغِ عقود البيع المرتبطة أولاً.";
    expect(translateApiMessage(msg)).toBe(msg);
  });

  it('is not rewritten by generic rules matching the product name', () => {
    const msg =
      "لا يمكن تعديل هذه الفاتورة: تم بيع 2 من كمية المنتج 'Foreign Key مرتبط بالمخزن' من هذه الفاتورة.";
    expect(translateApiMessage(msg)).toBe(msg);
  });
});
