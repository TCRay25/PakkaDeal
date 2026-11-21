"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Deal, NotificationItem } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import StatusBadge from "@/components/StatusBadge";

export default function Dashboard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<Deal[]>("/deals").catch(() => []),
      api<NotificationItem[]>("/notifications").catch(() => []),
    ]).then(([d, n]) => {
      setDeals(d);
      setNotifications(n);
      setLoading(false);
    });
  }, []);

  if (!user) return null;

  const trustScore = Math.max(user.seller_trust, user.buyer_trust, 70);
  const activeDeals = deals.filter((d) =>
    ["created", "held", "shipped", "delivered", "return_requested", "disputed"].includes(d.status)
  );
  const totalHeld = deals
    .filter((d) => ["held", "shipped", "delivered", "disputed"].includes(d.status))
    .reduce((acc, d) => acc + (d.deposit || d.total_amount || 0), 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            {t("dashboard")}
          </h1>
          <p className="text-sm text-neutral-500">
            {t("welcomeBack")}, {user.name || user.phone}. {t("dashboardSub")}
          </p>
        </div>
        <Link href="/dashboard/new" className="btn text-sm">
          + {t("createDeal")}
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="box p-4 border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-xs uppercase font-semibold text-neutral-500">{t("activeDeals")}</span>
          <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{activeDeals.length}</div>
          <span className="text-xs text-neutral-400">{t("transactionsInProgress")}</span>
        </div>

        <div className="box p-4 border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-xs uppercase font-semibold text-neutral-500">{t("heldFunds")}</span>
          <div className="text-2xl font-bold text-accent font-mono">{totalHeld.toLocaleString()} BDT</div>
          <span className="text-xs text-neutral-400">{t("lockedInEscrow")}</span>
        </div>

        <div className="box p-4 border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-xs uppercase font-semibold text-neutral-500">{t("trust")}</span>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
            {trustScore} / 100
          </div>
          <span className="text-xs text-neutral-400">{t("verifiedRating")}</span>
        </div>

        <div className="box p-4 border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-xs uppercase font-semibold text-neutral-500">{t("totalDealsRecorded")}</span>
          <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{deals.length}</div>
          <span className="text-xs text-neutral-400">{t("lifetimeDealCount")}</span>
        </div>
      </div>

      {/* Active Deals Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">{t("activeTransactions")}</h2>
          <Link href="/dashboard/deals" className="text-xs text-accent font-semibold hover:underline">
            {t("viewAll")} ({deals.length}) →
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-neutral-500">{t("loading")}</p>
        ) : activeDeals.length === 0 ? (
          <div className="box p-8 text-center space-y-3">
            <p className="text-sm text-neutral-500">
              {t("noActiveDeals")}
            </p>
            <Link href="/dashboard/new" className="btn text-xs inline-block">
              {t("createDeal")}
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 text-xs uppercase font-semibold text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Code / Title</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Counterparty</th>
                  <th className="px-4 py-3">Total Escrow</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {activeDeals.slice(0, 6).map((deal) => {
                  const isCreator = deal.seller_id === user.id;
                  return (
                    <tr key={deal.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-900/50">
                      <td className="px-4 py-3 font-medium">
                        <div className="font-semibold text-neutral-900 dark:text-neutral-100">{deal.product}</div>
                        <div className="text-xs font-mono text-neutral-500">{deal.code}</div>
                      </td>
                      <td className="px-4 py-3 text-xs uppercase text-neutral-600 dark:text-neutral-400">
                        {deal.deal_type}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {isCreator ? (
                          <>
                            <div className="font-medium">{deal.buyer_name}</div>
                            <div className="text-neutral-500 font-mono">{deal.buyer_phone}</div>
                          </>
                        ) : (
                          <>
                            <div className="font-medium">{deal.page_name || deal.seller_name || "Creator"}</div>
                            <div className="text-neutral-500 font-mono">ID #{deal.seller_id}</div>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-neutral-900 dark:text-neutral-100">
                        {deal.total_amount.toLocaleString()} BDT
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={deal.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/deal/${deal.code}`} className="btn-ghost text-xs py-1 px-2.5">
                          {t("open")}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Notifications preview */}
      {notifications.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold tracking-tight">Recent Activity Alerts</h2>
            <Link href="/dashboard/notifications" className="text-xs text-accent font-semibold hover:underline">
              All Notifications →
            </Link>
          </div>
          <div className="space-y-2">
            {notifications.slice(0, 3).map((notif) => (
              <div key={notif.id} className="box p-3 border border-neutral-200 dark:border-neutral-800 text-xs flex justify-between items-center">
                <div>
                  <strong className="block text-neutral-800 dark:text-neutral-200 font-semibold">{notif.title}</strong>
                  <span className="text-neutral-600 dark:text-neutral-400">{notif.message}</span>
                </div>
                {notif.deal_code && (
                  <Link href={`/deal/${notif.deal_code}`} className="btn-ghost text-xs py-0.5 px-2 shrink-0 ml-3">
                    View
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
