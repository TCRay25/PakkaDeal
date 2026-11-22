"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, post } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSocket } from "@/lib/socket";

interface PendingPayment {
  id: number;
  code: string;
  product: string;
  status: string;
  deal_type: string;
  total_amount: number;
  payment_amount: number;
  payment_trx_id: string;
  payment_sender_phone: string;
  payment_method: string;
  payment_status: string;
  payment_submitted_at: string;
  amount_mismatch: boolean;
  buyer_name: string;
  buyer_phone: string;
  seller_name: string;
  seller_phone: string;
  created_at: string;
}

export default function PendingPaymentsPage() {
  const { t, lang } = useI18n();
  const { on } = useSocket();
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [acting, setActing] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const loadPayments = () => {
    setLoading(true);
    const url = search.trim()
      ? `/admin/payments/pending?q=${encodeURIComponent(search.trim())}`
      : "/admin/payments/pending";

    api<PendingPayment[]>(url)
      .then(setPayments)
      .catch(() => setPayments([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPayments();
  }, []);

  // Real-time synchronization
  useEffect(() => {
    const unsub = on("admin:deal_updated", () => loadPayments());
    return unsub;
  }, [on]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadPayments();
  };

  const handleConfirm = async (p: PendingPayment) => {
    const confirmMsg =
      lang === "bn"
        ? `আপনি কি নিশ্চিত যে TrxID: ${p.payment_trx_id} এবং ${p.payment_amount || p.total_amount} টাকার পেমেন্টটি নিশ্চিত করতে চান? এটি ডিলটিকে 'held' অবস্থায় নিয়ে যাবে।`
        : `Confirm payment with TrxID: ${p.payment_trx_id} for ${p.payment_amount || p.total_amount} BDT? This locks funds in escrow.`;

    if (!confirm(confirmMsg)) return;

    setActing(p.id);
    try {
      await post(`/admin/payments/${p.id}/confirm`);
      loadPayments();
    } catch (err: any) {
      alert(err.message || "Failed to confirm payment");
    } finally {
      setActing(null);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingId) return;
    if (!rejectReason.trim()) {
      alert(lang === "bn" ? "প্রত্যাখ্যানের কারণ লিখুন" : "Please provide a rejection reason");
      return;
    }

    setActing(rejectingId);
    try {
      await post(`/admin/payments/${rejectingId}/reject`, { reason: rejectReason.trim() });
      setRejectingId(null);
      setRejectReason("");
      loadPayments();
    } catch (err: any) {
      alert(err.message || "Failed to reject payment");
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("pendingPayments")}</h1>
        <p className="text-sm text-neutral-500">
          {lang === "bn"
            ? "বায়ারদের সাবমিট করা বিকাশ/নগদ TrxID, প্রেরক নম্বর ও টাকা যাচাই করে এসক্রোতে কনফার্ম করুন।"
            : "Verify buyer-submitted bKash/Nagad TrxID, sender number, and amount to confirm funds into escrow."}
        </p>
      </div>

      {/* Top TrxID Search Form */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2 max-w-xl">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchTrxPlaceholder")}
          className="font-mono text-sm flex-1"
        />
        <button type="submit" className="btn text-xs px-4">
          {lang === "bn" ? "খুঁজুন" : "Search"}
        </button>
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setTimeout(loadPayments, 10);
            }}
            className="btn-ghost text-xs px-3"
          >
            {lang === "bn" ? "মুছুন" : "Clear"}
          </button>
        )}
      </form>

      {/* Table / Cards List */}
      {loading ? (
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      ) : payments.length === 0 ? (
        <div className="box p-8 text-center text-sm text-neutral-500">
          {lang === "bn"
            ? "কোনো অপেক্ষমাণ পেমেন্ট ভেরিফিকেশন পাওয়া যায়নি।"
            : "No pending payment submissions found."}
        </div>
      ) : (
        <div className="space-y-4">
          {payments.map((p) => {
            const isMismatch = p.amount_mismatch || (p.payment_amount > 0 && p.payment_amount !== p.total_amount);
            return (
              <div
                key={p.id}
                className={`box p-5 border-2 space-y-4 transition-all ${
                  isMismatch
                    ? "border-rose-600 bg-rose-50/20 dark:bg-rose-950/20"
                    : "border-neutral-200 dark:border-neutral-800 hover:border-accent"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 pb-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase font-extrabold text-neutral-500">
                        {lang === "bn" ? "ডিল রেফারেন্স:" : "Deal Ref:"}
                      </span>
                      <Link
                        href={`/deal/${p.code}`}
                        className="font-mono text-xs font-bold text-accent hover:underline"
                      >
                        #{p.code}
                      </Link>
                      <span className="text-[11px] px-2 py-0.5 border border-neutral-300 dark:border-neutral-700 font-mono">
                        {p.payment_method || "bKash"}
                      </span>
                    </div>
                    <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                      {p.product}
                    </h2>
                  </div>

                  {isMismatch && (
                    <div className="px-3 py-1 bg-rose-600 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
                      <span>⚠️</span>
                      <span>{t("amountMismatchWarning")}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-neutral-500 font-semibold block uppercase">
                      {lang === "bn" ? "সাবমিট করা TrxID" : "Submitted TrxID"}
                    </span>
                    <span className="font-mono text-sm font-extrabold text-neutral-900 dark:text-neutral-100 block mt-0.5">
                      {p.payment_trx_id || "N/A"}
                    </span>
                    <span className="text-[11px] text-neutral-400">
                      {p.payment_submitted_at ? new Date(p.payment_submitted_at).toLocaleString() : ""}
                    </span>
                  </div>

                  <div>
                    <span className="text-neutral-500 font-semibold block uppercase">
                      {lang === "bn" ? "প্রেরক ও বায়ার" : "Payer / Buyer"}
                    </span>
                    <span className="font-mono text-sm font-bold text-neutral-900 dark:text-neutral-100 block mt-0.5">
                      {p.payment_sender_phone || p.buyer_phone}
                    </span>
                    <span className="text-neutral-500">
                      {p.buyer_name || (lang === "bn" ? "ক্রেতা" : "Buyer")} ({p.buyer_phone})
                    </span>
                  </div>

                  <div>
                    <span className="text-neutral-500 font-semibold block uppercase">
                      {lang === "bn" ? "জমাকৃত টাকা বনাম ডিল মূল্য" : "Submitted vs Deal Amount"}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={`font-mono text-sm font-extrabold ${
                          isMismatch ? "text-rose-600" : "text-emerald-600"
                        }`}
                      >
                        {Number(p.payment_amount || p.total_amount).toLocaleString()} BDT
                      </span>
                      <span className="text-neutral-400">/</span>
                      <span className="font-mono text-xs text-neutral-500">
                        {Number(p.total_amount).toLocaleString()} BDT
                      </span>
                    </div>
                    {isMismatch && (
                      <span className="text-rose-600 font-bold block mt-0.5">
                        {lang === "bn"
                          ? `পার্থক্য: ${(p.payment_amount - p.total_amount).toLocaleString()} টাকা`
                          : `Diff: ${(p.payment_amount - p.total_amount).toLocaleString()} BDT`}
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="text-neutral-500 font-semibold block uppercase">
                      {lang === "bn" ? "সেলার" : "Seller"}
                    </span>
                    <span className="text-neutral-900 dark:text-neutral-100 font-semibold block mt-0.5">
                      {p.seller_name || "Seller"}
                    </span>
                    <span className="font-mono text-neutral-500">{p.seller_phone}</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-200 dark:border-neutral-800">
                  <button
                    onClick={() => {
                      setRejectingId(p.id);
                      setRejectReason("");
                    }}
                    disabled={acting === p.id}
                    className="btn-danger text-xs py-1.5 px-3"
                  >
                    {t("rejectPayment")}
                  </button>
                  <button
                    onClick={() => handleConfirm(p)}
                    disabled={acting === p.id}
                    className="btn-success text-xs py-1.5 px-4 font-bold"
                  >
                    {acting === p.id ? t("loading") : `✓ ${t("confirmPayment")}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject Modal */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleRejectSubmit}
            className="box w-full max-w-md p-6 border-2 border-rose-600 space-y-4 bg-white dark:bg-black"
          >
            <div className="flex justify-between items-center border-b border-neutral-200 dark:border-neutral-800 pb-2">
              <h3 className="font-bold text-base text-rose-600">{t("rejectPayment")}</h3>
              <button
                type="button"
                onClick={() => setRejectingId(null)}
                className="text-neutral-500 hover:text-black dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <div>
              <label htmlFor="rejection-reason-input" className="text-xs font-bold">
                {t("rejectionReasonPrompt")}
              </label>
              <textarea
                id="rejection-reason-input"
                required
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={
                  lang === "bn"
                    ? "যেমন: ব্যাংক স্টেটমেন্টে টাকা জমা হয়নি বা ভুল TrxID"
                    : "e.g. TrxID not found in merchant statement, or wrong amount"
                }
                className="text-sm mt-1 w-full"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setRejectingId(null)}
                className="btn-ghost text-xs px-3"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                disabled={acting === rejectingId}
                className="btn-danger text-xs px-4"
              >
                {acting === rejectingId ? t("loading") : t("rejectPayment")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
