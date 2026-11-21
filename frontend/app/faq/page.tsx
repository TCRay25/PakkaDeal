"use client";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

export default function FaqPage() {
  const { t, lang } = useI18n();

  const faqs = [
    { q: t("faq1Q"), a: t("faq1A") },
    { q: t("faq2Q"), a: t("faq2A") },
    { q: t("faq3Q"), a: t("faq3A") },
    { q: t("faq4Q"), a: t("faq4A") },
    { q: t("faq5Q"), a: t("faq5A") },
    { q: t("faq6Q"), a: t("faq6A") },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 space-y-10">
      <div className="space-y-3 border-b border-neutral-200 dark:border-neutral-800 pb-6">
        <span className="text-xs font-semibold uppercase tracking-wider text-accent">{lang === "bn" ? "সাহায্য কেন্দ্র" : "Help Center"}</span>
        <h1 className="text-3xl font-bold tracking-tight">{t("faqTitle")}</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          {lang === "bn"
            ? "এসক্রো লেনদেন, ট্র্যাকিং ও বিরোধ নিষ্পত্তি সম্পর্কে প্রয়োজনীয় সমস্ত প্রশ্নোত্তর।"
            : "Everything you need to know about escrow transactions and dispute protection."}
        </p>
      </div>

      <div className="space-y-4">
        {faqs.map((faq, idx) => (
          <div key={idx} className="box p-5 space-y-2 border border-neutral-200 dark:border-neutral-800">
            <h3 className="font-semibold text-base text-neutral-900 dark:text-neutral-100">{faq.q}</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">{faq.a}</p>
          </div>
        ))}
      </div>

      <div className="text-center pt-4">
        <Link href="/login" className="btn px-6 py-2.5">{t("getStarted")}</Link>
      </div>
    </div>
  );
}
