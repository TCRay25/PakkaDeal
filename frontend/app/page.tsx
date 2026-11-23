"use client";
import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import Logo from "@/components/Logo";
import AnimatedHeroLogo from "@/components/AnimatedHeroLogo";
import Footer from "@/components/Footer";

export default function Home() {
  const { t, lang } = useI18n();
  const { calculateFee, formatFeePercent, formatFeeMin } = useSettings();
  const [calcAmount, setCalcAmount] = useState<number>(5000);
  const fee = calculateFee(calcAmount);

  return (
    <div className="w-full">
      {/* Hero Section - Full Viewport First Page */}
      <section className="border-b border-neutral-200 dark:border-neutral-800 min-h-[calc(100vh-65px)] min-h-[calc(100dvh-65px)] flex flex-col justify-between py-8 lg:py-12 bg-white dark:bg-black">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full my-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-block border border-accent/40 bg-accent/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent">
                {t("tagline")}
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 leading-tight">
                {t("heroTitle")}
              </h1>
              <p className="text-base sm:text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl leading-relaxed">
                {t("heroText")}
              </p>
              <div className="flex flex-wrap gap-4 pt-2">
                <Link href="/login" className="btn px-6 py-3 text-base">
                  {t("getStarted")}
                </Link>
                <Link href="/how-it-works" className="btn-ghost px-6 py-3 text-base">
                  {t("howTitle")}
                </Link>
              </div>
            </div>

            {/* Visual Animated Logo & Escrow Vault Showcase */}
            <div className="lg:col-span-5 flex flex-col items-center justify-center space-y-5">
              {/* Animated Logo: Sits directly on the page background without any box or border */}
              <div className="w-full flex items-center justify-center">
                <AnimatedHeroLogo />
              </div>

              {/* Only the 3 Protocol Steps below are in clean boxes */}
              <div className="w-full space-y-2 text-xs">
                <div className="box p-2.5 sm:p-3 flex items-center justify-between border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-sm">
                  <div>
                    <span className="text-[10px] text-neutral-400 uppercase font-mono block">{t("phase1")}</span>
                    <span className="font-semibold text-neutral-900 dark:text-neutral-100">{t("phase1Title")}</span>
                  </div>
                  <span className="font-mono text-accent font-semibold">{t("phase1Sub")}</span>
                </div>

                <div className="p-2.5 sm:p-3 border-2 border-accent bg-accent/5 flex items-center justify-between shadow-sm">
                  <div>
                    <span className="text-[10px] text-accent uppercase font-mono font-bold block">{t("phase2")}</span>
                    <span className="font-semibold text-neutral-900 dark:text-neutral-100">{t("phase2Title")}</span>
                  </div>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{t("phase2Sub")}</span>
                </div>

                <div className="box p-2.5 sm:p-3 flex items-center justify-between border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-sm">
                  <div>
                    <span className="text-[10px] text-neutral-400 uppercase font-mono block">{t("phase3")}</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{t("phase3Title")}</span>
                  </div>
                  <span className="font-mono text-neutral-500 font-semibold">{t("phase3Sub")}</span>
                </div>

                <div className="pt-1.5 text-[11px] text-neutral-500 flex justify-between px-1">
                  <span>{t("noFakeOrders")}</span>
                  <span>{t("noFakeSellers")}</span>
                  <span>{t("deterministic")}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Dedicated Escrow Flows */}
      <section className="py-16 border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {t("howTitle")}
            </h2>
            <p className="text-neutral-600 dark:text-neutral-400">
              {t("howSub")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="box border border-neutral-200 dark:border-neutral-800 p-6 space-y-4">
              <div className="w-8 h-8 bg-neutral-900 text-white dark:bg-white dark:text-black flex items-center justify-center font-bold text-sm">
                {lang === "bn" ? "১" : "1"}
              </div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                {t("howProductTitle")}
              </h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                {t("howProductText")}
              </p>
            </div>

            <div className="box border border-neutral-200 dark:border-neutral-800 p-6 space-y-4">
              <div className="w-8 h-8 bg-neutral-900 text-white dark:bg-white dark:text-black flex items-center justify-center font-bold text-sm">
                {lang === "bn" ? "২" : "2"}
              </div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                {t("howReturnTitle")}
              </h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                {t("howReturnText")}
              </p>
            </div>

            <div className="box border border-neutral-200 dark:border-neutral-800 p-6 space-y-4">
              <div className="w-8 h-8 bg-neutral-900 text-white dark:bg-white dark:text-black flex items-center justify-center font-bold text-sm">
                {lang === "bn" ? "৩" : "3"}
              </div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                {t("howRentalTitle")}
              </h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                {t("howRentalText")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Escrow Stops Fraud */}
      <section className="py-16 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="max-w-2xl">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent block mb-2">{t("whyItWorks")}</span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {t("whyTitle")}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="box p-6 space-y-3 bg-white dark:bg-black">
              <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">{t("why1Title")}</h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">{t("why1Text")}</p>
            </div>
            <div className="box p-6 space-y-3 bg-white dark:bg-black">
              <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">{t("why2Title")}</h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">{t("why2Text")}</p>
            </div>
            <div className="box p-6 space-y-3 bg-white dark:bg-black">
              <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">{t("why3Title")}</h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">{t("why3Text")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Transparent Fee Calculator */}
      <section className="py-16 border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-6 space-y-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-accent block">{t("calculator")}</span>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                {lang === "bn"
                  ? `সহজ ও স্বচ্ছ ${formatFeePercent(lang)} সার্ভিস ফি`
                  : `Transparent ${formatFeePercent("en")} Escrow Service Fee`}
              </h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                {lang === "bn"
                  ? `পাক্কাডিল ক্রেতার সম্পূর্ণ আর্থিক নিরাপত্তার জন্য অর্ডারের সময় মাত্র ${formatFeePercent(lang)} সার্ভিস ফি (সর্বনিম্ন ${formatFeeMin(lang)}) যুক্ত করে। বিক্রেতার মূল্য থেকে কোনো টাকা কাটা হয় না।`
                  : `PakkaDeal adds a transparent ${formatFeePercent("en")} escrow protection fee (minimum ${formatFeeMin("en")}) at buyer checkout. Sellers receive 100% of their listed price without deductions upon successful completion.`}
              </p>
            </div>

            <div className="lg:col-span-6">
              <div className="box border border-neutral-300 dark:border-neutral-700 p-6 space-y-4">
                <div>
                  <label htmlFor="deal-amount-input">{t("enterAmount")}</label>
                  <input
                    id="deal-amount-input"
                    type="number"
                    min={100}
                    step={100}
                    value={calcAmount}
                    onChange={(e) => setCalcAmount(Number(e.target.value) || 0)}
                    className="font-mono text-lg font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-neutral-200 dark:border-neutral-800 text-sm">
                  <div>
                    <span className="text-xs text-neutral-500 uppercase block">
                      {lang === "bn" ? `এসক্রো সার্ভিস ফি (${formatFeePercent(lang)})` : `Escrow Fee (${formatFeePercent("en")})`}
                    </span>
                    <span className="font-mono font-bold text-neutral-800 dark:text-neutral-200">
                      +{fee.toLocaleString()} BDT
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 uppercase block">
                      {lang === "bn" ? "বিক্রেতার নিট পাওনা (১০০%)" : "Seller Payout (100%)"}
                    </span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-lg">
                      {calcAmount.toLocaleString()} BDT
                    </span>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-dashed border-neutral-200 dark:border-neutral-800 flex justify-between items-center text-xs">
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                      {lang === "bn" ? "ক্রেতার মোট এসক্রো জমা:" : "Total Buyer Escrow Deposit:"}
                    </span>
                    <span className="font-mono font-extrabold text-accent text-sm">
                      {(calcAmount + fee).toLocaleString()} BDT
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100">
              {t("faqTitle")}
            </h2>
          </div>

          <div className="space-y-4">
            <div className="box p-5 space-y-2">
              <h3 className="font-semibold text-base">{t("faq1Q")}</h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{t("faq1A")}</p>
            </div>
            <div className="box p-5 space-y-2">
              <h3 className="font-semibold text-base">{t("faq2Q")}</h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{t("faq2A")}</p>
            </div>
            <div className="box p-5 space-y-2">
              <h3 className="font-semibold text-base">{t("faq3Q")}</h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{t("faq3A")}</p>
            </div>
          </div>

          <div className="text-center pt-6">
            <Link href="/login" className="btn px-8 py-3 text-base">
              {t("getStarted")}
            </Link>
          </div>
        </div>
      </section>

      {/* Footer rendered only on landing page */}
      <Footer />
    </div>
  );
}
