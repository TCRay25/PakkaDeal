"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Deal } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import StatusBadge from "@/components/StatusBadge";

export default function DealsListPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const loadDeals = () => {
    setLoading(true);
    let url = "/deals";
    const params = new URLSearchParams();
    if (activeTab !== "all") params.set("status", activeTab);
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
  }, [activeTab, typeFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadDeals();
  };

  if (!user) return null;
  const isSeller = user.role === "seller";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("deals")}</h1>
          <p className="text-sm text-neutral-500">Track and manage all your escrow transactions.</p>
        </div>
        <Link href="/dashboard/new" className="btn text-sm">
          + {t("createDeal")}
        </Link>
      </div>

      {/* Tabs and Filters */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
        <div className="flex flex-wrap gap-1 border-b lg:border-b-0 border-neutral-200 dark:border-neutral-800 pb-2 lg:pb-0">
          {[
            { id: "all", label: "All Deals" },
            { id: "created", label: "Awaiting Payment" },
            { id: "held", label: "Funds Held" },
            { id: "shipped", label: "In Transit" },
            { id: "delivered", label: "Delivered" },
            { id: "disputed", label: "Disputed" },
            { id: "released", label: "Completed" },
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
            <option value="all">All Categories</option>
            <option value="product">Product (Courier)</option>
            <option value="rental">Rental Booking</option>
            <option value="service">Service Handover</option>
          </select>

          <form onSubmit={handleSearch} className="flex gap-1">
            <input
              type="text"
              placeholder="Search by code, product..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 text-xs py-1 px-2 border border-neutral-300 dark:border-neutral-700"
            />
            <button type="submit" className="btn text-xs py-1 px-3">
              Search
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
                <th className="px-4 py-3">Code / Product</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Counterparty</th>
                <th className="px-4 py-3">Total Held</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {deals.map((deal) => (
                <tr key={deal.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-900/50">
                  <td className="px-4 py-3 font-medium">
                    <div className="font-semibold text-neutral-900 dark:text-neutral-100">{deal.product}</div>
                    <div className="text-xs font-mono text-neutral-500">{deal.code}</div>
                  </td>
                  <td className="px-4 py-3 text-xs uppercase text-neutral-600 dark:text-neutral-400">
                    {deal.deal_type}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {isSeller ? (
                      <>
                        <div className="font-medium">{deal.buyer_name}</div>
                        <div className="text-neutral-500 font-mono">{deal.buyer_phone}</div>
                      </>
                    ) : (
                      <>
                        <div className="font-medium">{deal.page_name || deal.seller_name || "Seller"}</div>
                        <div className="text-neutral-500 font-mono">ID #{deal.seller_id}</div>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold">
                    {deal.total_amount.toLocaleString()} BDT
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={deal.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500 whitespace-nowrap">
                    {new Date(deal.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/deal/${deal.code}`} className="btn-ghost text-xs py-1 px-3">
                      {t("open")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
