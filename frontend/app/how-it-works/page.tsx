"use client";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

export default function HowItWorksPage() {
  const { t } = useI18n();

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 space-y-12">
      <div className="space-y-3 border-b border-neutral-200 dark:border-neutral-800 pb-6">
        <span className="text-xs font-semibold uppercase tracking-wider text-accent">Documentation</span>
        <h1 className="text-3xl font-bold tracking-tight">{t("howTitle")}</h1>
        <p className="text-neutral-600 dark:text-neutral-400">{t("howSub")}</p>
      </div>

      <div className="space-y-12">
        <section className="box p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-accent text-white flex items-center justify-center font-bold">1</span>
            <h2 className="text-xl font-bold">{t("howProductTitle")}</h2>
          </div>
          <p className="text-neutral-600 dark:text-neutral-400 text-sm leading-relaxed">{t("howProductText")}</p>
          <div className="border border-neutral-200 dark:border-neutral-800 p-4 bg-neutral-50 dark:bg-neutral-900 text-xs space-y-2">
            <strong>Timeline Breakdown:</strong>
            <p>1. Seller initiates deal with price and courier name (Steadfast, Pathao, RedX).</p>
            <p>2. Buyer deposits full amount into escrow (bKash/Nagad mock gateway).</p>
            <p>3. Seller dispatches within 48 hours and inputs consignment tracking ID.</p>
            <p>4. Automated courier status checks detect pickup, transit, and delivery events.</p>
            <p>5. On delivery, a 72-hour inspection window opens for buyer verification.</p>
            <p>6. If confirmed or if window passes without dispute, funds are released to seller minus 2% fee.</p>
          </div>
        </section>

        <section className="box p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-accent text-white flex items-center justify-center font-bold">2</span>
            <h2 className="text-xl font-bold">{t("howReturnTitle")}</h2>
          </div>
          <p className="text-neutral-600 dark:text-neutral-400 text-sm leading-relaxed">{t("howReturnText")}</p>
          <div className="border border-neutral-200 dark:border-neutral-800 p-4 bg-neutral-50 dark:bg-neutral-900 text-xs space-y-2">
            <strong>Return Rules:</strong>
            <p>• If buyer refuses parcel at doorstep: seller receives delivery charge + return compensation from escrow; buyer refunded balance.</p>
            <p>• If product is wrong or damaged: buyer files dispute with photos. Admin evaluates claim with multimodal AI assistance.</p>
            <p>• Approved return: buyer ships item back with return tracking ID. Escrow refund occurs upon confirmed delivery back to seller.</p>
          </div>
        </section>

        <section className="box p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-accent text-white flex items-center justify-center font-bold">3</span>
            <h2 className="text-xl font-bold">{t("howRentalTitle")}</h2>
          </div>
          <p className="text-neutral-600 dark:text-neutral-400 text-sm leading-relaxed">{t("howRentalText")}</p>
          <div className="border border-neutral-200 dark:border-neutral-800 p-4 bg-neutral-50 dark:bg-neutral-900 text-xs space-y-2">
            <strong>Dual-Confirmation Handover Protocol:</strong>
            <p>• Tailored for apartment rent advances, freelance project milestones, or in-person exchanges without third-party courier tracking.</p>
            <p>• Money moves ONLY when BOTH parties click 'Confirm Handover'.</p>
            <p>• If one party confirms and the other does not respond, a reminder is triggered. Unresolved cases escalate to the admin queue.</p>
          </div>
        </section>
      </div>

      <div className="text-center pt-6">
        <Link href="/login" className="btn px-6 py-3">{t("getStarted")}</Link>
      </div>
    </div>
  );
}
