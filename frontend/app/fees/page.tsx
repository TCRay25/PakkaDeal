"use client";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { useSettings, toBengaliDigits } from "@/lib/settings";

export default function FeesPage() {
  const { t, lang } = useI18n();
  const { feePercent, feeMin, formatFeePercent, formatFeeMin } = useSettings();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 space-y-10">
      <div className="space-y-3 border-b border-neutral-200 dark:border-neutral-800 pb-6">
        <span className="text-xs font-semibold uppercase tracking-wider text-accent">{lang === "bn" ? "ফি ও সার্ভিস চার্জ" : "Pricing"}</span>
        <h1 className="text-3xl font-bold tracking-tight">
          {lang === "bn"
            ? `সহজ ও স্বচ্ছ ${formatFeePercent(lang)} সার্ভিস ফি`
            : `Transparent ${formatFeePercent("en")} Escrow Service Fee`}
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          {lang === "bn"
            ? `পাক্কাডিল ক্রেতার সম্পূর্ণ আর্থিক নিরাপত্তার জন্য চেকাউটের সময় মাত্র ${formatFeePercent(lang)} সার্ভিস ফি (সর্বনিম্ন ${formatFeeMin(lang)}) যুক্ত করে। বিক্রেতার বিক্রয়মূল্য থেকে কোনো টাকা কাটা হয় না।`
            : `PakkaDeal adds a transparent ${formatFeePercent("en")} escrow protection fee (minimum ${formatFeeMin("en")}) at buyer checkout. Sellers receive 100% of their listed price without deductions upon successful completion.`}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="box p-6 space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-accent">{lang === "bn" ? "স্ট্যান্ডার্ড এসক্রো" : "Standard Escrow"}</span>
          <div className="text-4xl font-extrabold text-neutral-900 dark:text-neutral-100">{formatFeePercent(lang)}</div>
          <p className="text-xs text-neutral-500">
            {lang === "bn"
              ? `সর্বনিম্ন ফি: প্রতি লেনদেনে ${formatFeeMin(lang)}`
              : `Minimum fee: ${formatFeeMin("en")} per transaction`}
          </p>
          <ul className="text-sm space-y-2 text-neutral-600 dark:text-neutral-400 pt-3 border-t border-neutral-200 dark:border-neutral-800">
            <li>{lang === "bn" ? "✓ বিক্রেতাদের পাওনা থেকে কোনো প্ল্যাটফর্ম ফি কর্তন হয় না" : "✓ Platform fee is paid by buyer into escrow (seller receives agreed price)"}</li>
            <li>{lang === "bn" ? "✓ ক্রেতার ১০০% সুরক্ষার জন্য চেকআউটের সময় নামমাত্র ফি যুক্ত হয়" : "✓ Nominal fee added at buyer checkout for 100% fraud protection"}</li>
            <li>{lang === "bn" ? "✓ স্বয়ংক্রিয় কুরিয়ার ট্র্যাকিং সুবিধা অন্তর্ভুক্ত" : "✓ Automated courier tracking included"}</li>
            <li>{lang === "bn" ? "✓ সম্পূর্ণ বিরোধ ও মধ্যস্থতা সেবা সুবিধা" : "✓ Full dispute mediation support"}</li>
          </ul>
        </div>

        <div className="box p-6 space-y-3 bg-neutral-50 dark:bg-neutral-950">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">{lang === "bn" ? "রিটার্ন ও বাতিলকরণ" : "Return & Cancellation"}</span>
          <div className="text-4xl font-extrabold text-neutral-900 dark:text-neutral-100">0% {lang === "bn" ? "অতিরিক্ত চার্জ" : "Added"}</div>
          <p className="text-xs text-neutral-500">{lang === "bn" ? "প্রক্রিয়াকৃত রিফান্ডে স্ট্যান্ডার্ড প্ল্যাটফর্ম ফি প্রযোজ্য" : "Standard platform fee retained on processed refunds"}</p>
          <ul className="text-sm space-y-2 text-neutral-600 dark:text-neutral-400 pt-3 border-t border-neutral-200 dark:border-neutral-800">
            <li>{lang === "bn" ? "✓ প্রত্যাখ্যাত পার্সেলের ক্ষেত্রে বিক্রেতার জন্য ডেলিভারি ক্ষতিপূরণ" : "✓ Delivery charge compensation to seller for refused parcels"}</li>
            <li>{lang === "bn" ? "✓ ক্রেতাকে দ্রুত স্বয়ংক্রিয় রিফান্ড প্রদান" : "✓ Fast automated refund to buyer"}</li>
            <li>{lang === "bn" ? "✓ স্বচ্ছ আর্থিক লেজার রেকর্ড" : "✓ Transparent ledger records"}</li>
          </ul>
        </div>
      </div>

      <div className="box p-5 space-y-2 text-xs text-neutral-500 bg-neutral-50 dark:bg-neutral-900">
        <strong className="block text-neutral-800 dark:text-neutral-200">{lang === "bn" ? "নিয়ন্ত্রণ ও নিরাপত্তা বিবৃতি:" : "Compliance Statement:"}</strong>
        <p>{t("regulatoryNotice")}</p>
      </div>

      <div className="text-center pt-4">
        <Link href="/login" className="btn px-6 py-2.5">{t("getStarted")}</Link>
      </div>
    </div>
  );
}
