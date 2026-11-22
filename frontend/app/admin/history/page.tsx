"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface HistoryItem {
  id: number;
  deal_id: number;
  deal_code: string;
  deal_product: string;
  deal_type: string;
  transaction_type: string;
  amount: number;
  party_phone: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_bkash_number: string;
  recipient_bkash_type: string;
  trx_id: string;
  notes: string;
  created_at: string;
}

export default function AdminHistoryPage() {
  const { t, lang } = useI18n();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [copiedTrx, setCopiedTrx] = useState<string | null>(null);

  const loadHistory = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (search.trim()) params.set("q", search.trim());

    api<HistoryItem[]>(`/admin/history?${params.toString()}`)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadHistory();
  }, [typeFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadHistory();
  };

  const copyTrx = (trx: string) => {
    if (!trx) return;
    navigator.clipboard.writeText(trx);
    setCopiedTrx(trx);
    setTimeout(() => setCopiedTrx(null), 2000);
  };

  const formatType = (type: string) => {
    switch (type) {
      case "payout_seller":
        return {
          label: lang === "bn" ? "সেলার পেআউট" : "Seller Payout",
          badge: "border-emerald-600 text-emerald-600 bg-emerald-500/10",
        };
      case "refund_buyer":
        return {
          label: lang === "bn" ? "বায়ার রিফান্ড" : "Buyer Refund",
          badge: "border-rose-600 text-rose-600 bg-rose-500/10",
        };
      case "seller_return_compensation":
        return {
          label: lang === "bn" ? "রিটার্ন সেলার ক্ষতিপূরণ" : "Return Seller Compensation",
          badge: "border-purple-600 text-purple-600 bg-purple-500/10",
        };
      case "buyer_return_refund":
        return {
          label: lang === "bn" ? "রিটার্ন বায়ার রিফান্ড" : "Return Buyer Refund",
          badge: "border-accent text-accent bg-accent/10",
        };
      default:
        return {
          label: type,
          badge: "border-neutral-500 text-neutral-500",
        };
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("paidOutHistory")}</h1>
        <p className="text-sm text-neutral-500">
          {lang === "bn"
            ? "প্ল্যাটফর্ম থেকে সম্পন্ন সকল সেলার পেআউট, বায়ার রিফান্ড ও রিটার্ন ক্ষতিপূরণ লেনদেনের তালিকা।"
            : "Complete audit history of all disbursed seller payouts, buyer refunds, and return shipping compensations."}
        </p>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1 border-b sm:border-b-0 pb-2 sm:pb-0">
          {[
            { id: "all", label: lang === "bn" ? "সকল লেনদেন" : "All" },
            { id: "payout_seller", label: lang === "bn" ? "সেলার পেআউট" : "Seller Payouts" },
            { id: "refund_buyer", label: lang === "bn" ? "বায়ার রিফান্ড" : "Buyer Refunds" },
            { id: "return", label: lang === "bn" ? "রিটার্ন সমন্বয়" : "Return Settlements" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTypeFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors border ${
                typeFilter === tab.id
                  ? "border-accent bg-accent text-white"
                  : "border-transparent text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchTrxPlaceholder")}
            className="font-mono text-xs w-64"
          />
          <button type="submit" className="btn text-xs px-3">
            {lang === "bn" ? "খুঁজুন" : "Search"}
          </button>
        </form>
      </div>

      {/* History Table */}
      {loading ? (
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      ) : history.length === 0 ? (
        <div className="box p-8 text-center text-sm text-neutral-500">
          {lang === "bn" ? "কোনো পরিশোধিত লেনদেন রেকর্ড পাওয়া যায়নি।" : "No paid out records found."}
        </div>
      ) : (
        <div className="box border border-neutral-200 dark:border-neutral-800 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-500 uppercase font-semibold border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th className="p-3">{lang === "bn" ? "সময়" : "Date & Time"}</th>
                <th className="p-3">{lang === "bn" ? "ডিল" : "Deal"}</th>
                <th className="p-3">{lang === "bn" ? "ধরন" : "Type"}</th>
                <th className="p-3">{lang === "bn" ? "প্রাপক ও বিকাশ" : "Recipient & bKash"}</th>
                <th className="p-3">{lang === "bn" ? "পরিমাণ" : "Amount"}</th>
                <th className="p-3">{lang === "bn" ? "পরিশোধিত TrxID" : "Payout TrxID"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {history.map((h) => {
                const typeInfo = formatType(h.transaction_type);
                return (
                  <tr key={h.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-900/50">
                    <td className="p-3 whitespace-nowrap text-neutral-500">
                      {new Date(h.created_at).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/deal/${h.deal_code}`}
                        className="font-mono font-bold text-accent hover:underline block"
                      >
                        #{h.deal_code}
                      </Link>
                      <span className="text-neutral-500 line-clamp-1 max-w-[180px]">{h.deal_product}</span>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 border text-[11px] font-bold ${typeInfo.badge}`}>
                        {typeInfo.label}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                        {h.recipient_name || h.party_phone}
                      </div>
                      <div className="font-mono text-neutral-500 text-[11px]">
                        {h.recipient_bkash_number || h.party_phone}
                        {h.recipient_bkash_type && ` (${h.recipient_bkash_type})`}
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap font-mono font-extrabold text-sm text-neutral-900 dark:text-neutral-100">
                      {Number(h.amount).toLocaleString()} BDT
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="font-bold text-neutral-800 dark:text-neutral-200">
                          {h.trx_id || "N/A"}
                        </span>
                        {h.trx_id && (
                          <button
                            onClick={() => copyTrx(h.trx_id)}
                            className="text-[10px] px-1.5 py-0.5 border text-neutral-500 hover:text-black dark:hover:text-white"
                          >
                            {copiedTrx === h.trx_id ? "✓" : "Copy"}
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
