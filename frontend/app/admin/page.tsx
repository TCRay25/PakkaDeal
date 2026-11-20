"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, AdminOverview } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function AdminOverviewPage() {
  const { t } = useI18n();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<AdminOverview>("/admin/overview")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm text-neutral-500">{t("loading")}</p>;
  }

  if (!data) {
    return <p className="text-sm text-red-500">Failed to load admin overview data.</p>;
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">System Overview</h1>
        <p className="text-sm text-neutral-500">
          Central monitoring dashboard for live escrow funds, transaction volume, revenue, and pending disputes.
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="box p-5 border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-xs uppercase font-bold text-neutral-500">{t("heldFunds")}</span>
          <div className="text-3xl font-extrabold font-mono text-accent">
            {Number(data.held_amount).toLocaleString()} BDT
          </div>
          <span className="text-xs text-neutral-400">{data.held_count} active escrow deals</span>
        </div>

        <div className="box p-5 border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-xs uppercase font-bold text-neutral-500">{t("feeEarned")}</span>
          <div className="text-3xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
            {Number(data.fee_earned).toLocaleString()} BDT
          </div>
          <span className="text-xs text-neutral-400">Platform 2% service charges collected</span>
        </div>

        <div className="box p-5 border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-xs uppercase font-bold text-neutral-500">{t("openDisputes")}</span>
          <div className="text-3xl font-extrabold font-mono text-purple-600 dark:text-purple-400">
            {data.open_disputes}
          </div>
          <Link href="/admin/disputes" className="text-xs text-purple-600 dark:text-purple-400 font-semibold hover:underline block">
            Inspect Dispute Queue →
          </Link>
        </div>

        <div className="box p-5 border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-xs uppercase font-bold text-neutral-500">{t("released")}</span>
          <div className="text-2xl font-bold font-mono text-neutral-800 dark:text-neutral-200">
            {Number(data.released_amount).toLocaleString()} BDT
          </div>
          <span className="text-xs text-neutral-400">{data.released_count} completed payouts</span>
        </div>

        <div className="box p-5 border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-xs uppercase font-bold text-neutral-500">{t("refunded")}</span>
          <div className="text-2xl font-bold font-mono text-rose-600">
            {Number(data.refunded_amount).toLocaleString()} BDT
          </div>
          <span className="text-xs text-neutral-400">{data.refunded_count} buyer refunds</span>
        </div>

        <div className="box p-5 border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-xs uppercase font-bold text-neutral-500">{t("totalUsers")}</span>
          <div className="text-2xl font-bold font-mono text-neutral-900 dark:text-neutral-100">
            {data.total_users}
          </div>
          <span className="text-xs text-neutral-400">Total accounts with buyer/seller profiles</span>
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
                  <th className="p-2.5">Date</th>
                  <th className="p-2.5">Deal Count</th>
                  <th className="p-2.5">Total Escrow Volume</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {data.daily.map((d) => (
                  <tr key={d.day}>
                    <td className="p-2.5 font-mono">{d.day}</td>
                    <td className="p-2.5 font-mono font-semibold">{d.deals} deals</td>
                    <td className="p-2.5 font-mono font-bold text-accent">{Number(d.total_volume).toLocaleString()} BDT</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-neutral-500">No volume recorded in the last 30 days.</p>
        )}
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/admin/deals" className="box p-4 border hover:border-accent space-y-1 block">
          <span className="font-bold text-sm block">All Deals Directory →</span>
          <span className="text-xs text-neutral-500">Inspect, search, and monitor every active transaction.</span>
        </Link>
        <Link href="/admin/disputes" className="box p-4 border hover:border-accent space-y-1 block">
          <span className="font-bold text-sm block">Open Dispute Queue →</span>
          <span className="text-xs text-neutral-500">Review buyer evidence, unboxing photos, and AI recommendations.</span>
        </Link>
        <Link href="/admin/settings" className="box p-4 border hover:border-accent space-y-1 block">
          <span className="font-bold text-sm block">Platform Rules & Fees →</span>
          <span className="text-xs text-neutral-500">Configure fee percentage, confirmation window, and deadlines.</span>
        </Link>
      </div>
    </div>
  );
}
