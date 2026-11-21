"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, post, AdminOverview } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

export default function AdminOverviewPage() {
  const { t, lang } = useI18n();
  const { user, isAdmin, ready, login } = useAuth();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const loadData = () => {
    setLoading(true);
    setErr("");
    api<AdminOverview>("/admin/overview")
      .then(setData)
      .catch((e: any) => {
        setErr(e.message || "Failed to load admin overview data.");
        setData(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (ready && isAdmin) {
      loadData();
    } else if (ready && !isAdmin) {
      setLoading(false);
    }
  }, [ready, isAdmin]);

  const quickLoginAdmin = async () => {
    try {
      setLoading(true);
      const res = await post("/auth/verify", { phone: "01700000000", otp: "123456" });
      await login(res.token);
      loadData();
    } catch (x: any) {
      setErr(x.message || "Failed to log in as admin");
      setLoading(false);
    }
  };

  if (!ready || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="mx-auto max-w-md py-12 px-4 space-y-4">
        <div className="box p-6 border-2 border-red-500 bg-red-500/5 space-y-3">
          <h2 className="text-base font-bold text-red-600">
            {lang === "bn" ? "অ্যাডমিন অ্যাক্সেস প্রয়োজন" : "Admin Access Required"}
          </h2>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
            {user
              ? (lang === "bn"
                  ? `আপনি ${user.phone} নম্বর দিয়ে লগইন করেছেন, যার অ্যাডমিন সুবিধা নেই।`
                  : `You are logged in with ${user.phone}, which does not have administrator privileges.`)
              : (lang === "bn"
                  ? "অনুগ্রহ করে অনুমোদিত অ্যাডমিনিস্ট্রেটর মোবাইল নম্বর দিয়ে প্রবেশ করুন।"
                  : "Please sign in with an authorized administrator mobile number.")}
          </p>
          <div className="pt-2">
            <button onClick={quickLoginAdmin} className="btn text-xs py-2 px-4 w-full">
              {lang === "bn" ? "ডেমো অ্যাডমিন হিসেবে লগইন (01700000000)" : "Sign In as Demo Admin (01700000000)"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="mx-auto max-w-md py-12 px-4 space-y-4">
        <div className="box p-6 border-2 border-amber-500 bg-amber-500/5 space-y-3">
          <h2 className="text-base font-bold text-amber-600">
            {lang === "bn" ? "ওভারভিউ সংযোগ ত্রুটি" : "Overview Connection Error"}
          </h2>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">{err || "Failed to load admin overview data."}</p>
          <p className="text-xs text-neutral-500">
            {lang === "bn"
              ? "নিশ্চিত করুন যে ব্যাকএন্ড সার্ভার পোর্ট ৮০০০-এ চালু রয়েছে।"
              : "Please make sure the backend server is running on port 8000."}
          </p>
          <button onClick={loadData} className="btn-ghost text-xs py-1.5 px-3">
            {lang === "bn" ? "পুনরায় চেষ্টা করুন" : "Retry Connection"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("adminOverviewTitle")}</h1>
        <p className="text-sm text-neutral-500">
          {t("adminOverviewSub")}
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="box p-5 border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-xs uppercase font-bold text-neutral-500">{t("heldFunds")}</span>
          <div className="text-3xl font-extrabold font-mono text-accent">
            {Number(data?.held_amount || 0).toLocaleString()} {lang === "bn" ? "টাকা" : "BDT"}
          </div>
          <span className="text-xs text-neutral-400">
            {data?.held_count || 0} {t("activeEscrowDeals")}
          </span>
        </div>

        <div className="box p-5 border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-xs uppercase font-bold text-neutral-500">{t("feeEarned")}</span>
          <div className="text-3xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
            {Number(data?.fee_earned || 0).toLocaleString()} {lang === "bn" ? "টাকা" : "BDT"}
          </div>
          <span className="text-xs text-neutral-400">{t("platformChargesCollected")}</span>
        </div>

        <div className="box p-5 border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-xs uppercase font-bold text-neutral-500">{t("openDisputes")}</span>
          <div className="text-3xl font-extrabold font-mono text-purple-600 dark:text-purple-400">
            {data?.open_disputes || 0}
          </div>
          <Link href="/admin/disputes" className="text-xs text-purple-600 dark:text-purple-400 font-semibold hover:underline block">
            {t("inspectDisputeQueue")}
          </Link>
        </div>

        <div className="box p-5 border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-xs uppercase font-bold text-neutral-500">{t("released")}</span>
          <div className="text-2xl font-bold font-mono text-neutral-800 dark:text-neutral-200">
            {Number(data?.released_amount || 0).toLocaleString()} {lang === "bn" ? "টাকা" : "BDT"}
          </div>
          <span className="text-xs text-neutral-400">
            {data?.released_count || 0} {t("completedPayouts")}
          </span>
        </div>

        <div className="box p-5 border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-xs uppercase font-bold text-neutral-500">{t("refunded")}</span>
          <div className="text-2xl font-bold font-mono text-rose-600">
            {Number(data?.refunded_amount || 0).toLocaleString()} {lang === "bn" ? "টাকা" : "BDT"}
          </div>
          <span className="text-xs text-neutral-400">
            {data?.refunded_count || 0} {t("buyerRefundsCount")}
          </span>
        </div>

        <div className="box p-5 border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-xs uppercase font-bold text-neutral-500">{t("totalUsers")}</span>
          <div className="text-2xl font-bold font-mono text-neutral-900 dark:text-neutral-100">
            {data?.total_users || 0}
          </div>
          <span className="text-xs text-neutral-400">{t("verifiedAccount")}</span>
        </div>
      </div>

      {/* 30-Day Deal Trends */}
      <div className="box p-6 border border-neutral-200 dark:border-neutral-800 space-y-4">
        <h2 className="text-base font-bold tracking-tight">{t("last30Days")}</h2>
        {data.daily && data.daily.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-500 font-semibold uppercase">
                <tr>
                  <th className="p-2.5">{lang === "bn" ? "তারিখ" : "Date"}</th>
                  <th className="p-2.5">{lang === "bn" ? "ডিলের সংখ্যা" : "Deal Count"}</th>
                  <th className="p-2.5">{lang === "bn" ? "মোট এসক্রো ভলিউম" : "Total Escrow Volume"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {data.daily.map((d) => (
                  <tr key={d.day}>
                    <td className="p-2.5 font-mono">{d.day}</td>
                    <td className="p-2.5 font-mono font-semibold">
                      {d.deals} {lang === "bn" ? "টি ডিল" : d.deals === 1 ? "deal" : "deals"}
                    </td>
                    <td className="p-2.5 font-mono font-bold text-accent">
                      {Number(d.total_volume).toLocaleString()} {lang === "bn" ? "টাকা" : "BDT"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-neutral-500">
            {lang === "bn" ? "গত ৩০ দিনে কোনো ডিল সম্পন্ন হয়নি।" : "No volume recorded in the last 30 days."}
          </p>
        )}
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/admin/deals" className="box p-4 border hover:border-accent space-y-1 block">
          <span className="font-bold text-sm block">
            {lang === "bn" ? "সমস্ত ডিল ডিরেক্টরি →" : "All Deals Directory →"}
          </span>
          <span className="text-xs text-neutral-500">
            {lang === "bn"
              ? "চলমান প্রতিটি এসক্রো লেনদেন অনুসন্ধান ও পর্যবেক্ষণ করুন।"
              : "Inspect, search, and monitor every active transaction."}
          </span>
        </Link>
        <Link href="/admin/disputes" className="box p-4 border hover:border-accent space-y-1 block">
          <span className="font-bold text-sm block">
            {lang === "bn" ? "উন্মুক্ত বিরোধের তালিকা →" : "Open Dispute Queue →"}
          </span>
          <span className="text-xs text-neutral-500">
            {lang === "bn"
              ? "বায়ারের প্রমাণ, আনবক্সিং প্রমাণ ও এআই বিশ্লেষণ পর্যালোচনা করুন।"
              : "Review buyer evidence, unboxing photos, and AI recommendations."}
          </span>
        </Link>
        <Link href="/admin/settings" className="box p-4 border hover:border-accent space-y-1 block">
          <span className="font-bold text-sm block">
            {lang === "bn" ? "প্ল্যাটফর্ম নীতিমালা ও ফি →" : "Platform Rules & Fees →"}
          </span>
          <span className="text-xs text-neutral-500">
            {lang === "bn"
              ? "সার্ভিস ফি শতকরা হার, যাচাইকরণ সময় ও ডেডলাইন কনফিগার করুন।"
              : "Configure fee percentage, confirmation window, and deadlines."}
          </span>
        </Link>
      </div>
    </div>
  );
}
