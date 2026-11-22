"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Deal } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import StatusBadge from "@/components/StatusBadge";
import { translateDealType } from "@/lib/translateTimeline";

export default function DealsListPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const loadDeals = () => {
    setLoading(true);
    let url = "/deals";
    const params = new URLSearchParams();
    if (activeTab !== "all") params.set("status", activeTab);
    if (roleFilter !== "all") params.set("role", roleFilter);
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (search.trim()) params.set("q", search.trim());
    if (params.toString()) url += "?" + params.toString();

    api<Deal[]>(url)
      .then(setDeals)
      .catch(() => setDeals([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDeals();
  }, [activeTab, roleFilter, typeFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadDeals();
  };

  const handleDeleteDeal = async (code: string) => {
    if (!confirm(lang === "bn" ? "আপনি কি নিশ্চিত যে এই আনপেইড ডিলটি ডিলিট করতে চান?" : "Are you sure you want to delete this unpaid deal?")) return;
    try {
      await api(`/deals/${code}`, { method: "DELETE" });
      loadDeals();
    } catch (e: any) {
      alert(e.message || "Failed to delete deal");
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("deals")}</h1>
          <p className="text-sm text-neutral-500">
            {lang === "bn"
              ? "আপনার সমস্ত এসক্রো লেনদেন পর্যবেক্ষণ ও পরিচালনা করুন।"
              : "Track and manage all your escrow transactions."}
          </p>
        </div>
        <Link href="/dashboard/new" className="btn text-sm">
          + {t("createDeal")}
        </Link>
      </div>

      {/* Role Filter Tabs (All / My Sales / My Purchases) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 pb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold uppercase text-neutral-500 mr-1">
            {lang === "bn" ? "ভূমিকা:" : "Role:"}
          </span>
          {[
            { id: "all", label: lang === "bn" ? "সকল ডিল (All)" : "All Transactions" },
            { id: "seller", label: lang === "bn" ? "আমার বিক্রয় (Seller)" : "My Sales (Seller)" },
            { id: "buyer", label: lang === "bn" ? "আমার অর্ডার (Buyer)" : "My Purchases (Buyer)" },
          ].map((r) => (
            <button
              key={r.id}
              onClick={() => setRoleFilter(r.id)}
              className={`px-3 py-1 text-xs font-bold border transition-colors ${
                roleFilter === r.id
                  ? "border-accent bg-accent text-white"
                  : "border-neutral-300 dark:border-neutral-700 hover:border-neutral-500 text-neutral-600 dark:text-neutral-400"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-neutral-500 font-mono">
          {deals.length} {lang === "bn" ? "টি লেনদেন" : "Deals"}
        </span>
      </div>

      {/* Status Tabs and Filters */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
        <div className="flex flex-wrap gap-1 border-b lg:border-b-0 border-neutral-200 dark:border-neutral-800 pb-2 lg:pb-0">
          {[
            { id: "all", label: t("allDealsTab") },
            { id: "created", label: t("awaitingPaymentTab") },
            { id: "held", label: t("fundsHeldTab") },
            { id: "shipped", label: t("inTransitTab") },
            { id: "delivered", label: t("deliveredTab") },
            { id: "disputed", label: t("disputedTab") },
            { id: "released", label: t("completedTab") },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold border ${
                activeTab === tab.id
                  ? "border-accent bg-accent text-white"
                  : "border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-600 dark:text-neutral-400 hover:border-neutral-500"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-auto text-xs py-1.5 px-3 border border-neutral-300 dark:border-neutral-700 bg-transparent"
          >
            <option value="all">{t("allCategories")}</option>
            <option value="product">{t("productCourier")}</option>
            <option value="rental">{t("rentalAdvance")}</option>
            <option value="service">{t("serviceHandover")}</option>
          </select>

          <form onSubmit={handleSearch} className="flex gap-1">
            <input
              type="text"
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 text-xs py-1 px-2 border border-neutral-300 dark:border-neutral-700"
            />
            <button type="submit" className="btn text-xs py-1 px-3">
              {lang === "bn" ? "অনুসন্ধান" : "Search"}
            </button>
          </form>
        </div>
      </div>

      {/* Deals Table */}
      {loading ? (
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      ) : deals.length === 0 ? (
        <div className="box p-8 text-center space-y-2">
          <p className="text-sm text-neutral-500">{t("noDeals")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 text-xs uppercase font-semibold text-neutral-500">
              <tr>
                <th className="px-4 py-3">{t("deal")}</th>
                <th className="px-4 py-3">{t("type")}</th>
                <th className="px-4 py-3">{t("counterparty")}</th>
                <th className="px-4 py-3">{lang === "bn" ? "টাকার পরিমাণ" : "Amount"}</th>
                <th className="px-4 py-3">{t("status")}</th>
                <th className="px-4 py-3">{lang === "bn" ? "পরবর্তী করণীয়" : "What to do next"}</th>
                <th className="px-4 py-3">{t("date")}</th>
                <th className="px-4 py-3 text-right">{lang === "bn" ? "অ্যাকশন" : "Action"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {deals.map((deal) => {
                const isCreator = deal.seller_id === user.id;

                const getNextAction = (s: string) => {
                  const st = s.toLowerCase();
                  if (st === "created") return isCreator ? (lang === "bn" ? "বায়ারকে লিংক পাঠান" : "Share link with buyer") : (lang === "bn" ? "এসক্রোতে টাকা জমা দিন" : "Deposit into escrow");
                  if (st === "payment_pending") return isCreator ? (lang === "bn" ? "বায়ার লিংক দেখেছে, পেমেন্টের অপেক্ষায়" : "Buyer viewed link, awaiting payment") : (lang === "bn" ? "এসক্রো ভল্টে পে করুন" : "Deposit into escrow vault");
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
                    <td className="px-4 py-3 font-mono font-semibold">
                      {isCreator ? (
                        <div>
                          <div className="text-neutral-900 dark:text-neutral-100">
                            {(deal.seller_payout || (deal.price + (deal.delivery_charge || 0))).toLocaleString()} {lang === "bn" ? "টাকা" : "BDT"}
                          </div>
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-sans font-normal block">
                            {lang === "bn" ? "১০০% পাওনা (০% ফি)" : "100% Payout (0% fee)"}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <div className="text-neutral-900 dark:text-neutral-100">
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
                    <td className="px-4 py-3 text-xs font-medium text-accent">
                      {getNextAction(deal.status)}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500 whitespace-nowrap">
                      {new Date(deal.created_at).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB")}
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
    </div>
  );
}
