"use client";
import { useEffect, useState, use } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { toBengaliDigits } from "@/lib/settings";
import Logo from "@/components/Logo";

type SellerData = {
  seller: {
    id: number;
    name: string;
    page_name: string;
    page_url: string;
    seller_trust: number;
    created_at: string;
  };
  stats: {
    completed: number;
    refused: number;
    disputes: number;
    active_deals: number;
  };
};

export default function PublicSellerPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const { t, lang } = useI18n();
  const [data, setData] = useState<SellerData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<SellerData>(`/profiles/seller/${id}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-md py-16 text-center space-y-4">
        <h1 className="text-xl font-bold">{lang === "bn" ? "সেলার প্রোফাইল পাওয়া যায়নি" : "Seller Profile Not Found"}</h1>
        <p className="text-sm text-neutral-500">
          {lang === "bn" ? "এই সেলার প্রোফাইলটি নেই অথবা এটি উন্মুক্ত নয়।" : "The seller profile does not exist or is not public."}
        </p>
        <Link href="/" className="btn text-xs">
          {lang === "bn" ? "হোমে ফিরে যান" : "Return Home"}
        </Link>
      </div>
    );
  }

  const { seller, stats } = data;
  const completionRate = stats.completed + stats.refused > 0
    ? Math.round((stats.completed / (stats.completed + stats.refused)) * 100)
    : 100;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 space-y-8">
      {/* Profile Header Box */}
      <div className="box p-8 border-2 border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-emerald-500 inline-block" />
              <span className="text-xs uppercase font-bold text-neutral-500 tracking-wider">
                {t("verifiedAccount")}
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {seller.page_name || seller.name || `Merchant #${seller.id}`}
            </h1>
            {seller.page_url && (
              <a
                href={seller.page_url.startsWith("http") ? seller.page_url : `https://${seller.page_url}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-mono text-accent hover:underline inline-block"
              >
                {seller.page_url} ↗
              </a>
            )}
          </div>

          <div className="box p-4 border border-accent bg-accent/5 text-center min-w-[140px] space-y-1">
            <span className="text-xs uppercase font-bold text-accent block">{t("trust")}</span>
            <div className="text-3xl font-extrabold font-mono text-accent">
              {lang === "bn" ? toBengaliDigits(seller.seller_trust) : seller.seller_trust}
            </div>
            <span className="text-xs text-neutral-500">/ {lang === "bn" ? "১০০" : "100"}</span>
          </div>
        </div>

        {/* Verified Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div className="p-3 border border-neutral-200 dark:border-neutral-800">
            <span className="text-xs uppercase text-neutral-500 block">{t("completedDeals")}</span>
            <span className="text-xl font-bold font-mono text-emerald-600">
              {lang === "bn" ? toBengaliDigits(stats.completed) : stats.completed}
            </span>
          </div>
          <div className="p-3 border border-neutral-200 dark:border-neutral-800">
            <span className="text-xs uppercase text-neutral-500 block">{t("doorstepRefusals")}</span>
            <span className="text-xl font-bold font-mono text-neutral-600 dark:text-neutral-400">
              {lang === "bn" ? toBengaliDigits(stats.refused) : stats.refused}
            </span>
          </div>
          <div className="p-3 border border-neutral-200 dark:border-neutral-800">
            <span className="text-xs uppercase text-neutral-500 block">{t("disputes")}</span>
            <span className="text-xl font-bold font-mono text-neutral-600 dark:text-neutral-400">
              {lang === "bn" ? toBengaliDigits(stats.disputes) : stats.disputes}
            </span>
          </div>
          <div className="p-3 border border-neutral-200 dark:border-neutral-800">
            <span className="text-xs uppercase text-neutral-500 block">{t("risk")}</span>
            <span className="text-xl font-bold font-mono text-accent">
              {lang === "bn" ? toBengaliDigits(completionRate) : completionRate}%
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between text-xs text-neutral-500 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <span>{t("memberSince")}: {new Date(seller.created_at).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB")}</span>
          <span>{t("appName")} {lang === "bn" ? "এসক্রো ভেরিফাইড" : "Escrow Verified"}</span>
        </div>
      </div>

      {/* Buyer Protection Assurance */}
      <div className="box p-6 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100">
          {lang === "bn"
            ? "পাক্কাডিল এসক্রোর মাধ্যমে এই মার্চেন্ট থেকে কেনাকাটার নিশ্চয়তা"
            : "Buying from this Merchant via PakkaDeal Escrow"}
        </h3>
        <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
          {lang === "bn"
            ? "এই মার্চেন্ট যখন আপনাকে একটি এসক্রো ডিল লিংক প্রদান করবেন, তখন আপনার টাকা সরাসরি পাক্কাডিলের কেন্দ্রীয় সুরক্ষিত এসক্রো ভল্টে জমা হবে। আপনি পার্সেলটি হাতে পেয়ে যাচাই ও সন্তুষ্টি নিশ্চিত না করা পর্যন্ত মার্চেন্ট কোনো পেমেন্ট পাবেন না। সক্রিয় পাক্কাডিল এসক্রো লিংক ছাড়া কখনোই কোনো মার্চেন্টকে সরাসরি অগ্রিম বিকাশ/নগদে টাকা পাঠাবেন না।"
            : "When this merchant issues you an escrow deal link, your money is deposited directly into PakkaDeal's central escrow vault. The merchant does not receive payout until you physically receive the package and inspect it. Never pay merchants advance bKash without an active PakkaDeal escrow link."}
        </p>
      </div>
    </div>
  );
}
