"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Deal } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import { useI18n } from "@/lib/i18n";

export default function AdminDealsPage() {
  const { t } = useI18n();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const loadDeals = () => {
    setLoading(true);
    let url = "/admin/deals";
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
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
  }, [statusFilter, typeFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadDeals();
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("allDeals")}</h1>
        <p className="text-sm text-neutral-500">
          Master registry of all platform escrow contracts across Bangladesh.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs py-1.5 px-3 border border-neutral-300 dark:border-neutral-700 bg-transparent w-auto"
          >
            <option value="all">All Statuses</option>
            <option value="created">Created</option>
            <option value="held">Held</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="disputed">Disputed</option>
            <option value="released">Released</option>
            <option value="refunded">Refunded</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-xs py-1.5 px-3 border border-neutral-300 dark:border-neutral-700 bg-transparent w-auto"
          >
            <option value="all">All Types</option>
            <option value="product">Product</option>
            <option value="rental">Rental</option>
            <option value="service">Service</option>
          </select>
        </div>

        <form onSubmit={handleSearch} className="flex gap-1">
          <input
            type="text"
            placeholder="Search code, phone, product..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-60 text-xs py-1 px-2 border border-neutral-300 dark:border-neutral-700"
          />
          <button type="submit" className="btn text-xs py-1 px-3">
            Search
          </button>
        </form>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      ) : deals.length === 0 ? (
        <div className="box p-8 text-center text-sm text-neutral-500">
          No deals match current criteria.
        </div>
      ) : (
        <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 text-xs uppercase font-semibold text-neutral-500">
              <tr>
                <th className="px-4 py-3">Code / Product</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Seller</th>
                <th className="px-4 py-3">Buyer Phone</th>
                <th className="px-4 py-3">Escrow Deposit</th>
                <th className="px-4 py-3">Risk</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-xs">
              {deals.map((d) => (
                <tr key={d.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-900/50">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-neutral-900 dark:text-neutral-100">{d.product}</div>
                    <div className="font-mono text-neutral-500">{d.code}</div>
                  </td>
                  <td className="px-4 py-3 uppercase">{d.deal_type}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{d.page_name || d.seller_name || "Seller"}</div>
                    <div className="text-neutral-500 font-mono">ID #{d.seller_id}</div>
                  </td>
                  <td className="px-4 py-3 font-mono">{d.buyer_phone}</td>
                  <td className="px-4 py-3 font-mono font-bold">{d.total_amount.toLocaleString()} BDT</td>
                  <td className="px-4 py-3 font-mono">
                    <span className={`px-1.5 py-0.5 border ${
                      d.risk_score > 35 ? "border-rose-500 text-rose-500" : "border-emerald-600 text-emerald-600"
                    }`}>
                      {d.risk_score}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/deal/${d.code}`} className="btn-ghost text-xs py-1 px-2.5">
                      View Deal
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
