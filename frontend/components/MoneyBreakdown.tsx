"use client";
import { useI18n } from "@/lib/i18n";
import { Deal } from "@/lib/api";
import { toBengaliDigits } from "@/lib/settings";

export default function MoneyBreakdown({
  deal,
  isSeller = false,
}: {
  deal: Deal;
  isSeller?: boolean;
}) {
  const { t, lang } = useI18n();
  const cur = lang === "bn" ? " টাকা" : " BDT";

  // Calculate historical percentage for this specific deal
  const dealPercent =
    deal.fee_percent !== undefined && deal.fee_percent !== null && Number(deal.fee_percent) > 0
      ? Number(deal.fee_percent)
      : 1;

  const feeLabel =
    lang === "bn"
      ? `পাক্কাডিল এসক্রো সার্ভিস ফি (${toBengaliDigits(dealPercent)}%)`
      : `PakkaDeal Escrow Fee (${dealPercent}%)`;

  const sellerPayout = deal.seller_payout || (deal.price + (deal.delivery_charge || 0));

  if (isSeller) {
    // SELLER VIEW: Only shows item price, delivery charge, and 100% full seller payout. No buyer fee shown.
    return (
      <div className="box border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
        <h3 className="text-sm font-semibold tracking-wide uppercase text-neutral-800 dark:text-neutral-200 border-b border-neutral-200 dark:border-neutral-800 pb-2">
          {t("moneyBreakdown")}
        </h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
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
          <div className="flex justify-between items-center col-span-2 pt-2 border-t border-neutral-200 dark:border-neutral-800 text-sm font-semibold">
            <span className="text-emerald-600 dark:text-emerald-400">
              {lang === "bn" ? "আপনার মোট পাওনা" : t("sellerPayout")}
            </span>
            <span className="text-emerald-600 dark:text-emerald-400 font-mono text-base font-bold">
              {sellerPayout.toLocaleString()}{cur}
            </span>
          </div>
        </div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900 p-2.5 border border-neutral-200 dark:border-neutral-800">
          <span className="font-medium text-emerald-600 dark:text-emerald-400 block mb-0.5">
            {lang === "bn" ? "✓ সম্পূর্ণ পাওনা নিশ্চয়তা" : "✓ 100% Payout Guaranteed"}
          </span>
          <p className="text-[11px] leading-relaxed">
            {lang === "bn"
              ? "আপনার নির্ধারিত বিক্রয়মূল্য থেকে কোনো প্ল্যাটফর্ম ফি কাটা হবে না। ডেলিভারি সম্পন্ন হলে আপনি সম্পূর্ণ টাকা বুঝে পাবেন।"
              : "0% fee deducted from seller. You will receive 100% of your payout upon successful delivery."}
          </p>
        </div>
      </div>
    );
  }

  // BUYER VIEW: Shows item price, delivery charge, +1% escrow service fee, and total amount to deposit
  const subtotal = deal.price + (deal.delivery_charge || 0);
  const fee = deal.fee_amount || Math.max(10, Math.round((subtotal * dealPercent) / 100));
  const totalHeld = deal.total_amount || (subtotal + fee);

  return (
    <div className="box border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
      <h3 className="text-sm font-semibold tracking-wide uppercase text-neutral-800 dark:text-neutral-200 border-b border-neutral-200 dark:border-neutral-800 pb-2">
        {t("moneyBreakdown")}
      </h3>
      <div className="grid grid-cols-2 gap-3 text-sm">
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
        <div className="flex justify-between items-center col-span-2 text-xs text-accent font-medium pt-1">
          <span>{feeLabel}</span>
          <span className="font-mono font-bold">+{fee.toLocaleString()}{cur}</span>
        </div>
        <div className="col-span-2 pt-2 border-t border-dashed border-neutral-200 dark:border-neutral-800 flex justify-between items-center">
          <span className="font-bold text-neutral-800 dark:text-neutral-200">
            {lang === "bn" ? "মোট প্রদেয় (এসক্রো চার্জ সহ)" : t("totalHeld")}
          </span>
          <span className="text-base font-bold text-accent font-mono">{totalHeld.toLocaleString()}{cur}</span>
        </div>
      </div>
      <div className="text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900 p-2.5 border border-neutral-200 dark:border-neutral-800">
        <span className="font-medium text-neutral-700 dark:text-neutral-300 block mb-0.5">
          {lang === "bn" ? "🔒 এসক্রো ভল্ট নিরাপত্তা" : t("buyerRefundGuarantee")}
        </span>
        <p className="text-[11px] leading-relaxed">
          {lang === "bn"
            ? `অনলাইন আর্থিক নিরাপত্তার জন্য মাত্র ${toBengaliDigits(dealPercent)}% এসক্রো সার্ভিস ফি প্রযোজ্য। পণ্য হাতে পেয়ে যাচাই না করা পর্যন্ত এই সম্পূর্ণ টাকা পাক্কাডিল ভল্টে নিরাপদে সংরক্ষিত থাকবে।`
            : `A transparent ${dealPercent}% escrow service fee is added to guarantee your funds are safely locked until you inspect and verify the product.`}
        </p>
      </div>
    </div>
  );
}
