"use client";
import { useI18n } from "@/lib/i18n";
import { Deal } from "@/lib/api";

export default function MoneyBreakdown({ deal }: { deal: Deal }) {
  const { t } = useI18n();

  return (
    <div className="box border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
      <h3 className="text-sm font-semibold tracking-wide uppercase text-neutral-800 dark:text-neutral-200 border-b border-neutral-200 dark:border-neutral-800 pb-2">
        {t("moneyBreakdown")}
      </h3>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-neutral-500 dark:text-neutral-400 block text-xs uppercase">{t("price")}</span>
          <span className="font-semibold">{deal.price.toLocaleString()} BDT</span>
        </div>
        {deal.deal_type === "product" && (
          <div>
            <span className="text-neutral-500 dark:text-neutral-400 block text-xs uppercase">{t("charge")}</span>
            <span className="font-semibold">{deal.delivery_charge.toLocaleString()} BDT</span>
          </div>
        )}
        <div className="col-span-2 pt-2 border-t border-dashed border-neutral-200 dark:border-neutral-800 flex justify-between items-center">
          <span className="font-medium text-neutral-700 dark:text-neutral-300">{t("totalHeld")}</span>
          <span className="text-base font-bold text-accent">{deal.total_amount.toLocaleString()} BDT</span>
        </div>
        <div className="flex justify-between items-center col-span-2 text-xs text-neutral-500">
          <span>{t("platformFee")}</span>
          <span>-{deal.fee_amount.toLocaleString()} BDT</span>
        </div>
        <div className="flex justify-between items-center col-span-2 pt-2 border-t border-neutral-200 dark:border-neutral-800 text-sm font-semibold">
          <span className="text-emerald-600 dark:text-emerald-400">{t("sellerPayout")}</span>
          <span className="text-emerald-600 dark:text-emerald-400">{deal.seller_payout.toLocaleString()} BDT</span>
        </div>
      </div>
      <div className="text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900 p-2.5 border border-neutral-200 dark:border-neutral-800">
        <span className="font-medium text-neutral-700 dark:text-neutral-300 block mb-0.5">{t("buyerRefundGuarantee")}</span>
        {deal.return_policy === "buyer_pays"
          ? t("returnRefundPolicyBuyerPays")
          : deal.return_policy === "seller_pays"
          ? t("returnRefundPolicySellerPays")
          : t("returnRefundPolicyStandard")}
      </div>
    </div>
  );
}
