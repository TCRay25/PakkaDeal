"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, LedgerItem } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { translateLedgerType, translateLedgerNote } from "@/lib/translateTimeline";

export default function AdminLedgerPage() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<LedgerItem[]>("/admin/ledger")
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("ledgerTitle")}</h1>
        <p className="text-sm text-neutral-500">
          {lang === "bn"
            ? "প্রতিটি তহবিল হোল্ড, বিক্রেতার পে-আউট, ক্রেতার রিফান্ড এবং প্ল্যাটফর্ম ফি এর অপরিবর্তনীয় অডিট লগ।"
            : "Append-only deterministic accounting log of every fund hold, seller payout, buyer refund, and service fee."}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      ) : items.length === 0 ? (
        <div className="box p-8 text-center text-sm text-neutral-500">
          {lang === "bn" ? "কোনো লেজার লেনদেন পাওয়া যায়নি।" : "No ledger transactions found."}
        </div>
      ) : (
        <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 text-xs uppercase font-semibold text-neutral-500">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">{lang === "bn" ? "লেনদেনের ধরন" : "Transaction Type"}</th>
                <th className="px-4 py-3">{lang === "bn" ? "পরিমাণ" : "Amount"}</th>
                <th className="px-4 py-3">{lang === "bn" ? "মোবাইল নম্বর" : "Party Phone"}</th>
                <th className="px-4 py-3">{lang === "bn" ? "ডিল রেফারেন্স" : "Deal Reference"}</th>
                <th className="px-4 py-3">{lang === "bn" ? "বিবরণ ও মেমো" : "Notes & Memo"}</th>
                <th className="px-4 py-3">{lang === "bn" ? "তারিখ ও সময়" : "Timestamp"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-xs">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-900/50">
                  <td className="px-4 py-3 font-mono text-neutral-400">#{item.id}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 border text-xs font-mono font-bold uppercase ${
                      item.transaction_type === "payout_seller"
                        ? "border-emerald-600 text-emerald-600 bg-emerald-600/5"
                        : item.transaction_type === "hold"
                        ? "border-blue-500 text-blue-500 bg-blue-500/5"
                        : item.transaction_type === "platform_fee"
                        ? "border-purple-600 text-purple-600 bg-purple-600/5"
                        : "border-amber-500 text-amber-500 bg-amber-500/5"
                    }`}>
                      {translateLedgerType(item.transaction_type, lang)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-neutral-900 dark:text-neutral-100">
                    {item.amount.toLocaleString()} {lang === "bn" ? "টাকা" : "BDT"}
                  </td>
                  <td className="px-4 py-3 font-mono text-neutral-600 dark:text-neutral-400">
                    {item.party_phone || (lang === "bn" ? "সিস্টেম সেন্ট্রাল" : "System Central")}
                  </td>
                  <td className="px-4 py-3">
                    {item.deal_code ? (
                      <Link href={`/deal/${item.deal_code}`} className="font-mono text-accent hover:underline">
                        {item.deal_code}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400 max-w-xs truncate">
                    {translateLedgerNote(item.notes, lang)}
                  </td>
                  <td className="px-4 py-3 text-neutral-500 whitespace-nowrap">
                    {new Date(item.created_at).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB")}
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
