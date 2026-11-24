"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Deal, NotificationItem } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import StatusBadge from "@/components/StatusBadge";
import { translateNotification } from "@/lib/translateNotification";
import { translateDealType } from "@/lib/translateTimeline";

export default function Dashboard() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    Promise.all([
      api<Deal[]>("/deals").catch(() => []),
      api<NotificationItem[]>("/notifications").catch(() => []),
    ]).then(([d, n]) => {
      setDeals(d);
      setNotifications(n);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDeleteDeal = async (code: string) => {
    if (!confirm(lang === "bn" ? "আপনি কি নিশ্চিত যে এই আনপেইড ডিলটি ডিলিট করতে চান?" : "Are you sure you want to delete this unpaid deal?")) return;
    try {
      await api(`/deals/${code}`, { method: "DELETE" });
      loadData();
    } catch (e: any) {
      alert(e.message || "Failed to delete deal");
    }
  };

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
          <div className="text-2xl font-bold text-accent font-mono">
            {totalHeld.toLocaleString()} {lang === "bn" ? "টাকা" : "BDT"}
          </div>
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
                  <th className="px-4 py-3">{lang === "bn" ? "কোড / শিরোনাম" : "Code / Title"}</th>
                  <th className="px-4 py-3">{lang === "bn" ? "ধরন" : "Type"}</th>
                  <th className="px-4 py-3">{lang === "bn" ? "অপর পক্ষ" : "Counterparty"}</th>
                  <th className="px-4 py-3">{lang === "bn" ? "টাকার পরিমাণ" : "Amount"}</th>
                  <th className="px-4 py-3">{lang === "bn" ? "স্ট্যাটাস" : "Status"}</th>
                  <th className="px-4 py-3">{lang === "bn" ? "পরবর্তী করণীয়" : "What to do next"}</th>
                  <th className="px-4 py-3 text-right">{lang === "bn" ? "অ্যাকশন" : "Action"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {activeDeals.slice(0, 6).map((deal) => {
                  const isCreator = deal.seller_id === user.id;

                  const getNextAction = (s: string) => {
                    const st = s.toLowerCase();
                    if (st === "created") return isCreator ? (lang === "bn" ? "বায়ারকে লিংক পাঠান" : "Share link with buyer") : (lang === "bn" ? "এসক্রোতে টাকা জমা দিন" : "Pay into escrow");
                    if (st === "payment_pending") return isCreator ? (lang === "bn" ? "বায়ার লিংক দেখেছে, পেমেন্টের অপেক্ষায়" : "Buyer viewed link, awaiting payment") : (lang === "bn" ? "এসক্রো ভল্টে ডিপোজিট করুন" : "Deposit into escrow vault");
                    if (st === "held" || st === "escrow_held") return isCreator ? (lang === "bn" ? "বায়ার পেমেন্ট করেছে! পার্সেল পাঠান" : "Buyer paid! Ship parcel now") : (lang === "bn" ? "এসক্রোতে টাকা জমা, বিক্রেতা শিপ করছে" : "Escrow held, seller shipping");
                    if (st === "shipped" || st === "in_transit") return isCreator ? (lang === "bn" ? "পার্সেল ট্রানজিটে আছে" : "In transit to buyer") : (lang === "bn" ? "কুরিয়ার ট্র্যাক করুন" : "Track shipment arrival");
                    if (st === "delivered") return isCreator ? (lang === "bn" ? "২৪ ঘণ্টার অটো-রিলিজ কাউন্টডাউন চলছে" : "24h auto-release countdown active") : (lang === "bn" ? "পণ্য যাচাই করে রসিদ কনফার্ম করুন" : "Inspect item & confirm receipt");
                    if (st === "return_requested") return isCreator ? (lang === "bn" ? "বায়ার রিটার্ন চেয়েছেন" : "Buyer requested return") : (lang === "bn" ? "রিটার্ন পার্সেল পাঠান" : "Ship return parcel");
                    if (st === "return_shipped") return isCreator ? (lang === "bn" ? "রিটার্ন রসিদ নিশ্চিত করুন" : "Confirm return delivery") : (lang === "bn" ? "রিটার্ন পথে আছে" : "Return in transit");
                    if (st === "disputed") return lang === "bn" ? "বিরোধ পর্যালোচনাধীন" : "Dispute under review";
                    if (st === "released") return lang === "bn" ? "বিক্রেতাকে টাকা পরিশোধিত" : "Funds released";
                    if (st === "refunded") return lang === "bn" ? "রিফান্ড সম্পন্ন" : "Refunded";
                    return lang === "bn" ? "বিবরণ দেখুন" : "View details";
                  };

                  return (
                    <tr key={deal.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-900/50">
                      <td className="px-4 py-3 font-medium">
                        <div className="font-semibold text-neutral-900 dark:text-neutral-100">{deal.product}</div>
                        <div className="text-xs font-mono text-neutral-500">{deal.code}</div>
                      </td>
                      <td className="px-4 py-3 text-xs uppercase text-neutral-600 dark:text-neutral-400">
                        {translateDealType(deal.deal_type, lang)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {isCreator ? (
                          <div>
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 mr-1.5 inline-block mb-1">
                              {lang === "bn" ? "সেলার" : "Seller"}
                            </span>
                            <div className="font-medium text-neutral-900 dark:text-neutral-100">{deal.buyer_name}</div>
                            <div className="text-neutral-500 font-mono text-[11px]">{deal.buyer_phone}</div>
                          </div>
                        ) : (
                          <div>
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 mr-1.5 inline-block mb-1">
                              {lang === "bn" ? "বায়ার" : "Buyer"}
                            </span>
                            <div className="font-medium text-neutral-900 dark:text-neutral-100">{deal.page_name || deal.seller_name || "Seller"}</div>
                            <div className="text-neutral-500 font-mono text-[11px]">{deal.seller_phone || `ID #${deal.seller_id}`}</div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-neutral-900 dark:text-neutral-100">
                        {isCreator ? (
                          <div>
                            <div>
                              {(deal.seller_payout || (deal.price + (deal.delivery_charge || 0))).toLocaleString()} {lang === "bn" ? "টাকা" : "BDT"}
                            </div>
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-sans font-normal block">
                              {lang === "bn" ? "নিট পাওনা" : "Net Payout"}
                            </span>
                          </div>
                        ) : (
                          <div>
                            <div>
                              {deal.total_amount.toLocaleString()} {lang === "bn" ? "টাকা" : "BDT"}
                            </div>
                            <span className="text-[10px] text-neutral-500 font-sans font-normal block">
                              {lang === "bn" ? "এসক্রো চার্জ সহ" : "incl. escrow fee"}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={deal.status} />
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="font-medium text-accent">
                          {getNextAction(deal.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/deal/${deal.code}`} className="btn-ghost text-xs py-1 px-2.5">
                            {t("open")}
                          </Link>
                          {isCreator && (deal.status === "created" || deal.status === "payment_pending") && (
                            <button
                              type="button"
                              onClick={() => handleDeleteDeal(deal.code)}
                              className="text-xs py-1 px-2 border border-rose-500/50 text-rose-600 hover:bg-rose-600 hover:text-white transition-colors"
                              title={lang === "bn" ? "ডিল ডিলিট করুন" : "Delete Unpaid Deal"}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
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
            <h2 className="text-base font-bold tracking-tight">
              {t("recentActivityAlerts")}
            </h2>
            <Link href="/dashboard/notifications" className="text-xs text-accent font-semibold hover:underline">
              {t("allNotifications")} →
            </Link>
          </div>
          <div className="space-y-2">
            {notifications.slice(0, 3).map((notif) => {
              const { title, message } = translateNotification(notif.title, notif.message, lang);
              return (
                <div key={notif.id} className="box p-3 border border-neutral-200 dark:border-neutral-800 text-xs flex justify-between items-center">
                  <div>
                    <strong className="block text-neutral-800 dark:text-neutral-200 font-semibold">{title}</strong>
                    <span className="text-neutral-600 dark:text-neutral-400">{message}</span>
                  </div>
                  {notif.deal_code && (
                    <Link href={`/deal/${notif.deal_code}`} className="btn-ghost text-xs py-0.5 px-2 shrink-0 ml-3">
                      {t("view")}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
