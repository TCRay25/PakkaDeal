"use client";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

export default function FeesPage() {
  const { t } = useI18n();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 space-y-10">
      <div className="space-y-3 border-b border-neutral-200 dark:border-neutral-800 pb-6">
        <span className="text-xs font-semibold uppercase tracking-wider text-accent">Pricing</span>
        <h1 className="text-3xl font-bold tracking-tight">{t("feesTitle")}</h1>
        <p className="text-neutral-600 dark:text-neutral-400">{t("feesText")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="box p-6 space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-accent">Standard Escrow</span>
          <div className="text-4xl font-extrabold text-neutral-900 dark:text-neutral-100">2%</div>
          <p className="text-xs text-neutral-500">Minimum fee: 10 BDT per transaction</p>
          <ul className="text-sm space-y-2 text-neutral-600 dark:text-neutral-400 pt-3 border-t border-neutral-200 dark:border-neutral-800">
            <li>✓ Deducted only on successful completion</li>
            <li>✓ Free for buyers (no added fee on deposit)</li>
            <li>✓ Automated courier tracking included</li>
            <li>✓ Full dispute mediation support</li>
          </ul>
        </div>

        <div className="box p-6 space-y-3 bg-neutral-50 dark:bg-neutral-950">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Return & Cancellation</span>
          <div className="text-4xl font-extrabold text-neutral-900 dark:text-neutral-100">0% Added</div>
          <p className="text-xs text-neutral-500">Standard platform fee retained on processed refunds</p>
          <ul className="text-sm space-y-2 text-neutral-600 dark:text-neutral-400 pt-3 border-t border-neutral-200 dark:border-neutral-800">
            <li>✓ Delivery charge compensation to seller for refused parcels</li>
            <li>✓ Fast automated refund to buyer</li>
            <li>✓ Transparent ledger records</li>
          </ul>
        </div>
      </div>

      <div className="box p-5 space-y-2 text-xs text-neutral-500 bg-neutral-50 dark:bg-neutral-900">
        <strong className="block text-neutral-800 dark:text-neutral-200">Compliance Statement:</strong>
        <p>{t("regulatoryNotice")}</p>
      </div>

      <div className="text-center pt-4">
        <Link href="/login" className="btn px-6 py-2.5">{t("getStarted")}</Link>
      </div>
    </div>
  );
}
