/**
 * Calculates refundable amount (excluding 5% VAT) for a booking/payment.
 *
 * Pricing model:
 * - baseAmount = event price * guestsCount
 * - finalAmountBeforeVat = baseAmount - discountAmount
 * - vatAmount = Math.round(finalAmountBeforeVat * 0.05 * 100) / 100
 * - totalCharged (finalAmount) = finalAmountBeforeVat + vatAmount
 *
 * When refunding:
 * - 5% VAT is non-refundable.
 * - refundAmount = finalAmountBeforeVat (base booking price minus promo discount).
 * - vatAmount = retained VAT amount.
 *
 * @param {Object} payment - Payment document or object
 * @param {Object} [booking] - Booking document or object (optional fallback)
 * @returns {{ refundAmount: number, vatAmount: number, refundAmountInCents: number, totalCharged: number }}
 */
function calculateRefundWithoutVat(payment, booking = null) {
  const totalCharged = Number(payment?.finalAmount ?? booking?.finalAmount ?? payment?.amount ?? booking?.amount ?? 0);
  if (totalCharged <= 0) {
    return { refundAmount: 0, vatAmount: 0, refundAmountInCents: 0, totalCharged: 0 };
  }

  const baseAmount = payment?.amount ?? booking?.amount;
  const discount = Number(payment?.discountAmount ?? booking?.discountAmount ?? 0);

  let preVatAmount;
  if (baseAmount !== undefined && baseAmount !== null) {
    preVatAmount = Math.max(0, Number(baseAmount) - discount);
  } else {
    // If base amount is not recorded, derive from totalCharged / 1.05
    preVatAmount = Math.round((totalCharged / 1.05) * 100) / 100;
  }

  // Ensure preVatAmount does not exceed totalCharged
  preVatAmount = Math.min(preVatAmount, totalCharged);
  const vatAmount = Math.max(0, Math.round((totalCharged - preVatAmount) * 100) / 100);
  const refundAmount = Math.round(preVatAmount * 100) / 100;
  const refundAmountInCents = Math.round(refundAmount * 100);

  return { refundAmount, vatAmount, refundAmountInCents, totalCharged };
}

module.exports = {
  calculateRefundWithoutVat,
};
