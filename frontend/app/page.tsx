"use client";
import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import Logo from "@/components/Logo";

export default function Home() {
  const { t } = useI18n();
  const [calcAmount, setCalcAmount] = useState<number>(5000);
  const fee = Math.max(10, Math.round(calcAmount * 0.02));
  const sellerReceives = Math.max(0, calcAmount - fee);

  return (
    <div className="w-full">
      {/* Hero Section */}
      <section className="border-b border-neutral-200 dark:border-neutral-800 py-16 lg:py-24 bg-white dark:bg-black">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-block border border-accent/40 bg-accent/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent">
                {t("tagline")}
              </div>
              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 leading-tight">
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

            {/* Visual Escrow Vault Diagram */}
            <div className="lg:col-span-5">
              <div className="box border-2 border-neutral-300 dark:border-neutral-700 p-6 space-y-4 bg-neutral-50 dark:bg-neutral-950">
                <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Live Escrow Protocol</span>
                  <span className="px-2 py-0.5 text-xs bg-emerald-600/10 text-emerald-600 border border-emerald-600/30 font-semibold">Active</span>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="p-3 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black flex items-center justify-between">
                    <div>
                      <div className="text-xs text-neutral-400 uppercase">Step 1</div>
                      <div className="font-semibold text-neutral-900 dark:text-neutral-100">Buyer Deposits Funds</div>
                    </div>
                    <span className="text-xs font-mono text-accent">bKash / Nagad</span>
                  </div>

                  <div className="text-center text-xs font-mono text-neutral-400">↓ Held Securely in Escrow Vault ↓</div>

                  <div className="p-3 border-2 border-accent bg-accent/5 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-accent uppercase font-bold">Step 2: Transit & Verification</div>
                      <div className="font-semibold text-neutral-900 dark:text-neutral-100">Courier Tracking / Handover</div>
                    </div>
                    <span className="text-xs font-mono text-accent">3-Day Window</span>
                  </div>

                  <div className="text-center text-xs font-mono text-neutral-400">↓ Buyer Verifies & Confirms Receipt ↓</div>

                  <div className="p-3 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black flex items-center justify-between">
                    <div>
                      <div className="text-xs text-neutral-400 uppercase">Step 3</div>
                      <div className="font-semibold text-emerald-600 dark:text-emerald-400">Seller Payout Released (98%)</div>
                    </div>
                    <span className="text-xs font-mono text-neutral-500">2% PakkaDeal Fee</span>
                  </div>
                </div>

                <div className="pt-2 text-xs text-neutral-500 border-t border-neutral-200 dark:border-neutral-800 flex justify-between">
                  <span>No Fake Orders</span>
                  <span>No Advance Scams</span>
                  <span>100% Deterministic</span>
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
                1
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
                2
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
                3
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
            <span className="text-xs font-semibold uppercase tracking-wider text-accent block mb-2">Why It Works</span>
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
              <span className="text-xs font-semibold uppercase tracking-wider text-accent block">Calculator</span>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                {t("feesTitle")}
              </h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                {t("feesText")}
              </p>
            </div>

            <div className="lg:col-span-6">
              <div className="box border border-neutral-300 dark:border-neutral-700 p-6 space-y-4">
                <div>
                  <label htmlFor="deal-amount-input">Enter Deal Amount (BDT)</label>
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
                    <span className="text-xs text-neutral-500 uppercase block">Platform Fee (2%)</span>
                    <span className="font-mono font-bold text-neutral-800 dark:text-neutral-200">
                      {fee.toLocaleString()} BDT
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 uppercase block">Seller Payout</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-lg">
                      {sellerReceives.toLocaleString()} BDT
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
    </div>
  );
}
