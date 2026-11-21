"use client";
import { useEffect, useState } from "react";
import { api, LedgerItem } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

type WalletData = {
  total_earnings: number;
  total_escrow_deposited: number;
  total_refunds_received: number;
  transactions: LedgerItem[];
};

export default function WalletPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ wallet: WalletData }>("/profiles/me")
      .then((res) => setData(res.wallet))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (!user) return null;

  return (
    <div className="space-y-8">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("walletTitle")}</h1>
        <p className="text-sm text-neutral-500">
          {t("historySub")} ({user.phone}).
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="box p-5 border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-xs uppercase font-bold text-neutral-500">{t("totalEarnings")}</span>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {Number(data?.total_earnings || 0).toLocaleString()} BDT
          </div>
          <span className="text-xs text-neutral-400">{t("releasedSellerPayouts")}</span>
        </div>

        <div className="box p-5 border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-xs uppercase font-bold text-neutral-500">{t("totalEscrowDeposited")}</span>
          <div className="text-2xl font-bold font-mono text-accent">
            {Number(data?.total_escrow_deposited || 0).toLocaleString()} BDT
          </div>
          <span className="text-xs text-neutral-400">{t("fundsDepositedEscrow")}</span>
        </div>

        <div className="box p-5 border border-neutral-200 dark:border-neutral-800 space-y-1">
          <span className="text-xs uppercase font-bold text-neutral-500">{t("totalRefundsReceived")}</span>
          <div className="text-2xl font-bold font-mono text-neutral-900 dark:text-neutral-100">
            {Number(data?.total_refunds_received || 0).toLocaleString()} BDT
          </div>
          <span className="text-xs text-neutral-400">{t("returnedRefunds")}</span>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold tracking-tight">{t("personalHistory")}</h2>

        {loading ? (
          <p className="text-sm text-neutral-500">{t("loading")}</p>
        ) : !data?.transactions || data.transactions.length === 0 ? (
          <div className="box p-6 text-center text-sm text-neutral-500">
            {t("noLedgerMovements")}
          </div>
        ) : (
          <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 text-xs uppercase font-semibold text-neutral-500">
                <tr>
                  <th className="px-4 py-3">{t("type")}</th>
                  <th className="px-4 py-3">{t("amount")}</th>
                  <th className="px-4 py-3">{t("deal")}</th>
                  <th className="px-4 py-3">{t("notes")}</th>
                  <th className="px-4 py-3">{t("date")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {data.transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-900/50">
                    <td className="px-4 py-3">
                      <span className={`text-xs font-mono font-semibold uppercase px-2 py-0.5 border ${
                        tx.transaction_type === "payout_seller"
                          ? "border-emerald-600 text-emerald-600 bg-emerald-600/5"
                          : tx.transaction_type === "hold"
                          ? "border-blue-500 text-blue-500 bg-blue-500/5"
                          : tx.transaction_type === "refund_buyer"
                          ? "border-amber-500 text-amber-500 bg-amber-500/5"
                          : "border-neutral-300 text-neutral-600"
                      }`}>
                        {tx.transaction_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold">
                      {tx.amount.toLocaleString()} BDT
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {tx.deal_code ? (
                        <a href={`/deal/${tx.deal_code}`} className="text-accent hover:underline font-mono">
                          {tx.deal_code}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600 dark:text-neutral-400">
                      {tx.notes}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500 whitespace-nowrap">
                      {new Date(tx.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
