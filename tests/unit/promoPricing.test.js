const {
  buildTotals,
  computeCodeDiscount,
  round2,
  PromoError,
  STRIPE_MIN_AED,
  MAX_PROMO_CODES_PER_ORDER,
} = require('../../src/services/pricing.service');
const { validatePromoCodeInput } = require('../../src/utils/promoCodeValidation');
const { buildPromoMetadata, buildPromoFields, sameCodeSet } = require('../../src/services/promoCheckout.service');
const { toCsv } = require('../../src/utils/csv');

const code = (o = {}) => ({
  promoCode: { code: 'SAVE', fundedBy: 'organiser', discountType: 'percentage', discountValue: 20, ...o },
});

describe('pricing: computeCodeDiscount', () => {
  it('percentage of the base', () => {
    expect(computeCodeDiscount({ discountType: 'percentage', discountValue: 20 }, 100)).toBe(20);
  });
  it('fixed amount', () => {
    expect(computeCodeDiscount({ discountType: 'fixed', discountValue: 25 }, 100)).toBe(25);
  });
  it('caps a percentage at maxDiscountAmount', () => {
    expect(computeCodeDiscount({ discountType: 'percentage', discountValue: 50, maxDiscountAmount: 10 }, 100)).toBe(10);
  });
  it('never discounts more than the base', () => {
    expect(computeCodeDiscount({ discountType: 'fixed', discountValue: 500 }, 40)).toBe(40);
  });
  it('rounds to 2 decimals', () => {
    expect(computeCodeDiscount({ discountType: 'percentage', discountValue: 33 }, 10.01)).toBe(3.3);
  });
});

describe('pricing: buildTotals', () => {
  it('matches the plan example: 100 AED, 20% code -> 80 + 4 VAT = 84', () => {
    const t = buildTotals(100, [code({ fundedBy: 'rally' })]);
    expect(t).toMatchObject({
      originalAmount: 100,
      discountAmount: 20,
      subtotal: 80,
      vatAmount: 4,
      finalAmount: 84,
      rallyFundedDiscount: 20,
      organiserFundedDiscount: 0,
    });
    expect(t.appliedPromos).toEqual([{ code: 'SAVE', fundedBy: 'rally', discountAmount: 20 }]);
  });

  it('no codes: price plus 5% VAT', () => {
    expect(buildTotals(100, [])).toMatchObject({ discountAmount: 0, subtotal: 100, vatAmount: 5, finalAmount: 105 });
  });

  it('organiser-funded discount goes to organiserFundedDiscount', () => {
    const t = buildTotals(100, [code({ discountType: 'fixed', discountValue: 25 })]);
    expect(t.organiserFundedDiscount).toBe(25);
    expect(t.rallyFundedDiscount).toBe(0);
  });

  it('VAT is rounded to 2 decimals on the discounted subtotal', () => {
    const t = buildTotals(33.33, [code({ discountType: 'fixed', discountValue: 3.33 })]);
    expect(t.subtotal).toBe(30);
    expect(t.vatAmount).toBe(1.5);
    expect(t.finalAmount).toBe(31.5);
  });

  it('a 100% code gives a free booking (final 0, no VAT)', () => {
    const t = buildTotals(50, [code({ discountValue: 100 })]);
    expect(t).toMatchObject({ discountAmount: 50, subtotal: 0, vatAmount: 0, finalAmount: 0 });
  });

  describe('Stripe minimum charge', () => {
    it('is 2 AED', () => {
      expect(STRIPE_MIN_AED).toBe(2);
    });

    it('a code that would leave under 2 AED gives back discount so the player pays exactly 2.00', () => {
      const t = buildTotals(10, [code({ discountType: 'fixed', discountValue: 9.5 })]);
      expect(t.finalAmount).toBe(2);
      expect(t.subtotal + t.vatAmount).toBeCloseTo(2, 5);
      // discount, funding split and applied promo stay consistent with the new total
      expect(t.discountAmount).toBe(round2(10 - t.subtotal));
      expect(t.appliedPromos[0].discountAmount).toBe(t.discountAmount);
      expect(t.organiserFundedDiscount).toBe(t.discountAmount);
    });

    it('applies to every small total between 0 and 2 AED', () => {
      for (let base = 2; base <= 8; base += 0.37) {
        for (const d of [0.5, 1, 1.5, 2, 3, 5]) {
          let t;
          try {
            t = buildTotals(base, [code({ discountType: 'fixed', discountValue: d })]);
          } catch (e) {
            expect(e).toBeInstanceOf(PromoError);
            continue;
          }
          if (t.finalAmount > 0) {
            expect(t.finalAmount).toBeGreaterThanOrEqual(2);
          }
        }
      }
    });

    it('a booking too small to ever reach 2 AED is NOT_APPLICABLE for a code', () => {
      expect(() => buildTotals(1.5, [code({ discountType: 'fixed', discountValue: 1 })])).toThrow(PromoError);
      try {
        buildTotals(1.5, [code({ discountType: 'fixed', discountValue: 1 })]);
      } catch (e) {
        expect(e.code).toBe('NOT_APPLICABLE');
      }
    });

    it('does not touch totals that are free or already above 2 AED', () => {
      expect(buildTotals(100, [code({ discountValue: 100 })]).finalAmount).toBe(0);
      expect(buildTotals(100, [code({ discountValue: 20 })]).finalAmount).toBe(84);
    });
  });

  it('the app applies at most one code per order by default', () => {
    expect(MAX_PROMO_CODES_PER_ORDER).toBe(1);
  });
});

describe('promo code input validation', () => {
  const valid = { code: 'PADEL20', discountType: 'percentage', discountValue: 20, usageLimit: 60, userUsageLimit: 1 };

  it('accepts a valid code, no limit and no expiry', () => {
    expect(validatePromoCodeInput({ ...valid, usageLimit: null, userUsageLimit: null, validUntil: null })).toEqual([]);
  });
  it('rejects bad code formats', () => {
    expect(validatePromoCodeInput({ ...valid, code: 'ab' })).not.toEqual([]);
    expect(validatePromoCodeInput({ ...valid, code: 'HAS SPACE' })).not.toEqual([]);
    expect(validatePromoCodeInput({ ...valid, code: 'X'.repeat(21) })).not.toEqual([]);
  });
  it('percentage must be 1-100, fixed must be > 0', () => {
    expect(validatePromoCodeInput({ ...valid, discountValue: 101 })).not.toEqual([]);
    expect(validatePromoCodeInput({ ...valid, discountValue: 0 })).not.toEqual([]);
    expect(validatePromoCodeInput({ ...valid, discountType: 'fixed', discountValue: 0 })).not.toEqual([]);
    expect(validatePromoCodeInput({ ...valid, discountType: 'fixed', discountValue: 10 })).toEqual([]);
  });
  it('limits are null or at least 1', () => {
    expect(validatePromoCodeInput({ ...valid, usageLimit: 0 })).not.toEqual([]);
    expect(validatePromoCodeInput({ ...valid, userUsageLimit: -1 })).not.toEqual([]);
    expect(validatePromoCodeInput({ ...valid, usageLimit: 1.5 })).not.toEqual([]);
  });
  it('validUntil must be after validFrom', () => {
    expect(validatePromoCodeInput({ ...valid, validFrom: '2026-12-10', validUntil: '2026-12-01' })).not.toEqual([]);
  });
  it('admin codes cannot use subscribers eligibility', () => {
    expect(validatePromoCodeInput({ ...valid, ownerType: 'admin', eligibility: 'subscribers' })).not.toEqual([]);
    expect(validatePromoCodeInput({ ...valid, ownerType: 'organiser', eligibility: 'subscribers' })).toEqual([]);
  });
  it('partial mode only checks the fields present', () => {
    expect(validatePromoCodeInput({ usageLimit: 5 }, { partial: true })).toEqual([]);
    expect(validatePromoCodeInput({ usageLimit: 0 }, { partial: true })).not.toEqual([]);
  });
});

describe('checkout helpers: Stripe metadata and stored fields', () => {
  const quote = buildTotals(100, [code({ fundedBy: 'rally' })]);

  it('metadata carries the promo split as strings (plan section 4.3 keys)', () => {
    const meta = buildPromoMetadata(quote, 'orgId123');
    expect(meta).toEqual({
      originalAmount: '100',
      discountAmount: '20',
      rallyFundedDiscount: '20',
      organiserFundedDiscount: '0',
      promoCodes: 'SAVE',
      promoFundedBy: 'rally',
      organiserId: 'orgId123',
      promoCode: 'SAVE',
    });
    Object.values(meta).forEach((v) => expect(typeof v).toBe('string'));
  });

  it('metadata with no code has no legacy promoCode and empty funder', () => {
    const meta = buildPromoMetadata(buildTotals(100, []), 'o1');
    expect(meta.promoCodes).toBe('');
    expect(meta.promoFundedBy).toBe('');
    expect(meta.promoCode).toBeUndefined();
  });

  it('stored fields keep the legacy promoCode (first) and discountAmount (sum)', () => {
    const fields = buildPromoFields(quote, [{ promoCode: { _id: 'id1', code: 'SAVE' } }], [{ redemptionId: 'PRD9' }]);
    expect(fields).toMatchObject({
      promoCode: 'SAVE',
      promoCodeId: 'id1',
      discountAmount: 20,
      vatAmount: 4,
      rallyFundedDiscount: 20,
      organiserFundedDiscount: 0,
    });
    expect(fields.appliedPromos).toEqual([{ promoCodeId: 'id1', code: 'SAVE', fundedBy: 'rally', discountAmount: 20, redemptionId: 'PRD9' }]);
  });

  it('sameCodeSet compares codes regardless of order and falls back to the legacy promoCode', () => {
    expect(sameCodeSet({ appliedPromos: [{ code: 'A' }, { code: 'B' }] }, ['B', 'A'])).toBe(true);
    expect(sameCodeSet({ promoCode: 'a' }, ['A'])).toBe(true);
    expect(sameCodeSet({}, [])).toBe(true);
    expect(sameCodeSet({ promoCode: 'A' }, [])).toBe(false);
  });
});

describe('csv util', () => {
  it('escapes quotes, commas and newlines, and neutralises formulas', () => {
    const csv = toCsv(['a', 'b'], [['=SUM(A1)', 'x,"y"'], ['line\nbreak', null]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain('"x,""y"""');
    expect(csv).toContain('"line\nbreak"');
  });
});
