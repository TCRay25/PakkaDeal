/**
 * Canonical amounts calculation for PakkaDeal escrow.
 *
 * Rules:
 * - rental/service: always full_payment: held = price, cod = 0.
 * - product + full_payment: held = price + charge, cod = 0.
 * - product + delivery_only: held = max(charge + returnCharge, minDeposit), cod = price.
 * - fee = max(feeMin, round(held * feePercent / 100)); total_amount = held + fee (what buyer pays into escrow now).
 * - seller_payout = held (what seller receives from escrow); in delivery_only seller gets product price from courier COD.
 */
export function computeAmounts({
  dealType = "product",
  mode = "delivery_only",
  price = 0,
  charge = 0,
  returnCharge = 0,
  feePercent = 1,
  feeMin = 10,
  minDeposit = 60,
} = {}) {
  const p = Math.max(0, Math.round(Number(price) || 0));
  const c = Math.max(0, Math.round(Number(charge) || 0));
  const rc = Math.max(0, Math.round(Number(returnCharge) || 0));
  const fp = Number(feePercent !== undefined && feePercent !== null ? feePercent : 1);
  const fm = Number(feeMin !== undefined && feeMin !== null ? feeMin : 10);
  const md = Number(minDeposit !== undefined && minDeposit !== null ? minDeposit : 60);

  const isProduct = dealType === "product";
  const effectiveMode = isProduct
    ? (mode === "full_payment" ? "full_payment" : "delivery_only")
    : "full_payment";

  let held_amount = 0;
  let cod_amount = 0;

  if (!isProduct) {
    // rental/service: always full_payment: held = price, cod = 0.
    held_amount = p;
    cod_amount = 0;
  } else if (effectiveMode === "full_payment") {
    // product + full_payment: held = price + charge, cod = 0.
    held_amount = p + c;
    cod_amount = 0;
  } else {
    // product + delivery_only: held = max(charge + returnCharge, minDeposit), cod = price.
    held_amount = Math.max(c + rc, md);
    cod_amount = p;
  }

  // fee = max(feeMin, round(held * feePercent / 100));
  const fee_amount = Math.max(fm, Math.round((held_amount * fp) / 100));

  // total_amount = held + fee (what the buyer pays into escrow now).
  const total_amount = held_amount + fee_amount;

  // seller_payout = held (what the seller receives from escrow).
  const seller_payout = held_amount;

  return {
    held_amount,
    cod_amount,
    fee_amount,
    total_amount,
    seller_payout,
  };
}
