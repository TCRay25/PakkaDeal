"use client";
import { useI18n } from "@/lib/i18n";
import { Deal } from "@/lib/api";
import { useSettings, toBengaliDigits } from "@/lib/settings";

export default function MoneyBreakdown({
  deal,
  isSeller = false,
}: {
  deal: Deal;
  isSeller?: boolean;
}) {
  const { t, lang } = useI18n();
  const { feePercent } = useSettings();
  const cur = lang === "bn" ? " টাকা" : " BDT";

  // Read the fee percentage ONLY from deal.fee_percent / settings, with no hard-coded fallback
  const dealPercent =
    deal.fee_percent !== undefined && deal.fee_percent !== null && Number(deal.fee_percent) > 0
      ? Number(deal.fee_percent)
      : feePercent;

  const feeLabel =
    lang === "bn"
      ? `পাক্কাডিল এসক্রো ফি (${toBengaliDigits(dealPercent)}%)`
      : `PakkaDeal Escrow Fee (${dealPercent}%)`;

  const fee = deal.fee_amount !== undefined && deal.fee_amount !== null ? deal.fee_amount : 0;
  const totalHeld = deal.total_amount !== undefined && deal.total_amount !== null ? deal.total_amount : 0;
  const codAmount = deal.cod_amount || 0;
  const isDeliveryOnly = deal.payment_mode === "delivery_only" && codAmount > 0;
  const heldAmount = Math.max(0, totalHeld - fee);
  const sellerPayoutFromEscrow = deal.seller_payout !== undefined && deal.seller_payout !== null ? deal.seller_payout : heldAmount;
  const totalSellerProceeds = isDeliveryOnly ? sellerPayoutFromEscrow + codAmount : sellerPayoutFromEscrow;

  if (isSeller) {
    // SELLER VIEW: Shows Released from escrow, Collected by courier (COD) if delivery_only, and full seller proceeds.
    return (
      <div className="box border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
        <h3 className="text-sm font-semibold tracking-wide uppercase text-neutral-800 dark:text-neutral-200 border-b border-neutral-200 dark:border-neutral-800 pb-2">
          {t("moneyBreakdown")}
        </h3>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-neutral-500 dark:text-neutral-400 block text-xs uppercase">{t("agreedItemPrice")}</span>
              <span className="font-semibold">{deal.price.toLocaleString()}{cur}</span>
            </div>
            {deal.deal_type === "product" && (
              <div>
                <span className="text-neutral-500 dark:text-neutral-400 block text-xs uppercase">{t("deliveryChargeLabel")}</span>
                <span className="font-semibold">{(deal.delivery_charge || 0).toLocaleString()}{cur}</span>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 space-y-1.5 text-xs">
            <div className="flex justify-between items-center text-neutral-700 dark:text-neutral-300">
              <span className="font-medium">
                {lang === "bn" ? "এসক্রো থেকে প্রাপ্তি:" : `${t("releasedFromEscrow")}:`}
              </span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {sellerPayoutFromEscrow.toLocaleString()}{cur}
              </span>
            </div>

            {isDeliveryOnly && (
              <div className="flex justify-between items-center text-neutral-700 dark:text-neutral-300">
                <span className="font-medium">
                  {lang === "bn" ? "কুরিয়ার কর্তৃক সংগ্রহ (COD):" : `${t("collectedByCourierCod")}:`}
                </span>
                <span className="font-mono font-bold text-neutral-900 dark:text-neutral-100">
                  {codAmount.toLocaleString()}{cur}
                </span>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-neutral-200 dark:border-neutral-800 text-sm font-semibold">
            <span className="text-emerald-600 dark:text-emerald-400">
              {lang === "bn" ? "আপনার মোট পাওনা" : t("sellerPayout")}
            </span>
            <span className="text-emerald-600 dark:text-emerald-400 font-mono text-base font-bold">
              {totalSellerProceeds.toLocaleString()}{cur}
            </span>
          </div>
        </div>

        <div className="text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900 p-2.5 border border-neutral-200 dark:border-neutral-800">
          <span className="font-medium text-emerald-600 dark:text-emerald-400 block mb-0.5">
            {lang === "bn" ? "✓ সম্পূর্ণ পাওনা নিশ্চয়তা" : "✓ Full Payout Guarantee"}
          </span>
          <p className="text-[11px] leading-relaxed">
            {lang === "bn"
              ? isDeliveryOnly
                ? "ডেলিভারি সম্পন্ন হলে কুরিয়ার থেকে পণ্যের মূল্য এবং এসক্রো থেকে ডেলিভারি ডিপোজিট বুঝে পাবেন। এসক্রো ফি ক্রেতা বহন করেন।"
                : "ডেলিভারি বা হ্যান্ডওভার সম্পন্ন হলে এসক্রো থেকে আপনার সম্পূর্ণ পাওনা বুঝে পাবেন। প্ল্যাটফর্ম এসক্রো ফি ক্রেতা বহন করেন।"
              : isDeliveryOnly
                ? "Upon delivery, collect the product price from courier COD and receive the delivery deposit from escrow. Platform fees are paid by the buyer."
                : "You will receive your full agreed payout upon successful delivery. Platform escrow fees are paid by the buyer."}
          </p>
        </div>
      </div>
    );
  }

  // BUYER VIEW: Two clear sections: "Pay now into escrow" and "Pay in cash to the courier on delivery"
  return (
    <div className="box border border-neutral-200 dark:border-neutral-800 p-4 space-y-4">
      <h3 className="text-sm font-semibold tracking-wide uppercase text-neutral-800 dark:text-neutral-200 border-b border-neutral-200 dark:border-neutral-800 pb-2">
        {t("moneyBreakdown")}
      </h3>

      {/* Section 1: Pay now into escrow */}
      <div className="space-y-2 border-b border-neutral-200 dark:border-neutral-800 pb-3">
        <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-accent">
          <span>{lang === "bn" ? "এখন এসক্রোতে পরিশোধযোগ্য" : t("payNowIntoEscrow")}</span>
          <span className="font-mono text-sm">{totalHeld.toLocaleString()}{cur}</span>
        </div>

        <div className="space-y-1.5 text-xs text-neutral-600 dark:text-neutral-400 pl-2 border-l-2 border-accent/40">
          <div className="flex justify-between">
            <span>
              {isDeliveryOnly
                ? (lang === "bn" ? "অগ্রিম ডেলিভারি ডিপোজিট:" : "Delivery Deposit (Held):")
                : (lang === "bn" ? "পণ্যের মূল্য ও ডেলিভারি:" : "Agreed Price & Delivery:")}
            </span>
            <span className="font-mono font-medium">{heldAmount.toLocaleString()}{cur}</span>
          </div>
          <div className="flex justify-between text-accent font-medium">
            <span>{feeLabel}</span>
            <span className="font-mono font-bold">+{fee.toLocaleString()}{cur}</span>
          </div>
        </div>
      </div>

      {/* Section 2: Pay in cash to the courier on delivery (if delivery_only) */}
      {isDeliveryOnly && (
        <div className="space-y-2 border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
            <span>{lang === "bn" ? "ডেলিভারিতে কুরিয়ারকে ক্যাশ পরিশোধযোগ্য" : t("payCashOnDelivery")}</span>
            <span className="font-mono text-sm text-neutral-900 dark:text-neutral-100">{codAmount.toLocaleString()}{cur}</span>
          </div>

          <div className="space-y-1 text-xs text-neutral-600 dark:text-neutral-400 pl-2 border-l-2 border-neutral-400 dark:border-neutral-600">
            <div className="flex justify-between">
              <span>{lang === "bn" ? "পণ্যের মূল্য (ডোরস্টেপে কুরিয়ারকে দিবেন):" : "Product Price (Pay to courier):"}</span>
              <span className="font-mono font-medium">{codAmount.toLocaleString()}{cur}</span>
            </div>
          </div>
        </div>
      )}

      {/* Total Deal Value */}
      <div className="flex justify-between items-center pt-1 text-sm font-bold">
        <span className="text-neutral-900 dark:text-neutral-100">
          {lang === "bn" ? "সর্বমোট অর্ডারের খরচ:" : "Total Order Value:"}
        </span>
        <span className="text-accent font-mono text-base font-extrabold">
          {(totalHeld + codAmount).toLocaleString()}{cur}
        </span>
      </div>

      {/* Plain Words Refusal Rule Notice */}
      <div className="text-xs text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900 p-2.5 border border-neutral-200 dark:border-neutral-800 space-y-1">
        <span className="font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1">
          <span>⚖️</span>
          <span>{lang === "bn" ? "পার্সেল প্রত্যাখ্যানের নিয়ম" : t("refusalRuleTitle")}</span>
        </span>
        <p className="text-[11px] leading-relaxed">
          {lang === "bn"
            ? "আপনি যদি সঠিক পার্সেল নিতে অস্বীকার করেন, তবে আপনার ডেলিভারি চার্জ বিক্রেতাকে ক্ষতিপূরণ হিসেবে দেওয়া হবে।"
            : t("refusalRuleNotice")}
        </p>
      </div>
    </div>
  );
}
