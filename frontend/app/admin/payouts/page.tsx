"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, post } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSocket } from "@/lib/socket";

interface PendingPayout {
  id: number;
  code: string;
  product: string;
  status: string;
  deal_type: string;
  total_amount: number;
  fee_amount: number;
  seller_payout: number;
  seller_id: number;
  seller_name: string;
  seller_phone: string;
  seller_page_name: string;
  seller_bkash_number: string;
  seller_bkash_type: string;
  seller_bkash_verified: number;
  payout_status: string;
  auto_release_at: string;
  updated_at: string;
}

export default function PendingPayoutsPage() {
  const { t, lang } = useI18n();
  const { on } = useSocket();
  const [payouts, setPayouts] = useState<PendingPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [trxInputs, setTrxInputs] = useState<Record<number, string>>({});
  const [acting, setActing] = useState<number | null>(null);

  const loadPayouts = () => {
    setLoading(true);
    api<PendingPayout[]>("/admin/payouts/pending")
      .then(setPayouts)
      .catch(() => setPayouts([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPayouts();
  }, []);

  // Real-time synchronization
  useEffect(() => {
    const unsub = on("admin:deal_updated", () => loadPayouts());
    return unsub;
  }, [on]);

  const handleTrxChange = (id: number, val: string) => {
    setTrxInputs((prev) => ({ ...prev, [id]: val }));
  };

  const handlePay = async (p: PendingPayout) => {
    const trxId = (trxInputs[p.id] || "").trim();
    if (!trxId) {
      alert(lang === "bn" ? "পেআউট TrxID লিখুন" : "Please enter the payout TrxID");
      return;
    }

    if (!p.seller_bkash_verified) {
      alert(t("sellerBkashNotVerified"));
      return;
    }

    const confirmMsg =
      lang === "bn"
        ? `আপনি কি নিশ্চিত যে সেলার ${p.seller_name}-এর বিকাশ নম্বরে (${p.seller_bkash_number || p.seller_phone}) নিট ${p.seller_payout} টাকা পরিশোধ করেছেন? (TrxID: ${trxId})`
        : `Confirm disbursement of ${p.seller_payout} BDT to seller bKash ${p.seller_bkash_number || p.seller_phone}? (TrxID: ${trxId})`;

    if (!confirm(confirmMsg)) return;

    setActing(p.id);
    try {
      await post(`/admin/payouts/${p.id}/pay`, { payout_trx_id: trxId });
      setTrxInputs((prev) => {
        const copy = { ...prev };
        delete copy[p.id];
        return copy;
      });
      loadPayouts();
    } catch (err: any) {
      alert(err.message || "Failed to record payout");
    } finally {
      setActing(null);
    }
  };

  const filtered = payouts.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.code.toLowerCase().includes(q) ||
      p.product.toLowerCase().includes(q) ||
      (p.seller_name || "").toLowerCase().includes(q) ||
      (p.seller_phone || "").toLowerCase().includes(q) ||
      (p.seller_bkash_number || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("pendingPayouts")}</h1>
        <p className="text-sm text-neutral-500">
          {lang === "bn"
            ? "বায়ার ডেলিভারি নিশ্চিত করা বা স্বয়ংক্রিয় রিলিজের পর সেলারদের পাওনা বিকাশ একাউন্টে পরিশোধ করে TrxID রেকর্ড করুন।"
            : "Disburse net payouts to sellers via bKash after delivery confirmation or auto-release timer expiry."}
        </p>
      </div>

      {/* Search Filter */}
      <div className="max-w-md">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={lang === "bn" ? "ডিল কোড, পণ্য, সেলারের নাম বা বিকাশ দিয়ে খুঁজুন..." : "Search by deal code, product, seller..."}
          className="font-mono text-sm w-full"
        />
      </div>

      {/* List */}
      {loading ? (
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      ) : filtered.length === 0 ? (
        <div className="box p-8 text-center text-sm text-neutral-500">
          {lang === "bn"
            ? "কোনো অপেক্ষমাণ সেলার পেআউট নেই।"
            : "No pending seller payouts."}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((p) => {
            const isVerified = p.seller_bkash_verified === 1;
            const currentTrx = trxInputs[p.id] || "";

            return (
              <div
                key={p.id}
                className="box p-5 border-2 border-neutral-200 dark:border-neutral-800 hover:border-emerald-500 transition-all space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 pb-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase font-extrabold text-neutral-500">
                        {lang === "bn" ? "ডিল:" : "Deal:"}
                      </span>
                      <Link
                        href={`/deal/${p.code}`}
                        className="font-mono text-xs font-bold text-accent hover:underline"
                      >
                        #{p.code}
                      </Link>
                      <span className="px-2 py-0.5 text-[11px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-500/30">
                        {lang === "bn" ? "রিলিজ সম্পন্ন" : "Released"}
                      </span>
                    </div>
                    <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                      {p.product}
                    </h2>
                  </div>

                  {/* Financial Breakdown Badges */}
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <div className="text-right">
                      <span className="text-neutral-400 block text-[10px] uppercase font-sans">
                        {lang === "bn" ? "মোট মূল্য" : "Total"}
                      </span>
                      <span>{Number(p.total_amount).toLocaleString()} BDT</span>
                    </div>
                    <div className="text-right text-rose-500">
                      <span className="text-neutral-400 block text-[10px] uppercase font-sans">
                        {lang === "bn" ? "সার্ভিস ফি" : "Fee"}
                      </span>
                      <span>-{Number(p.fee_amount).toLocaleString()} BDT</span>
                    </div>
                    <div className="text-right px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-600/30">
                      <span className="text-emerald-700 dark:text-emerald-400 block text-[10px] uppercase font-bold font-sans">
                        {lang === "bn" ? "নিট পাওনা" : "Net Payout"}
                      </span>
                      <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                        {Number(p.seller_payout).toLocaleString()} BDT
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                  {/* Seller Info */}
                  <div>
                    <span className="text-neutral-500 font-semibold block uppercase">
                      {lang === "bn" ? "প্রাপক সেলার" : "Recipient Seller"}
                    </span>
                    <span className="font-bold text-neutral-900 dark:text-neutral-100 block mt-0.5">
                      {p.seller_name || "Seller"}
                    </span>
                    <span className="font-mono text-neutral-500">{p.seller_phone}</span>
                  </div>

                  {/* Seller bKash */}
                  <div>
                    <span className="text-neutral-500 font-semibold block uppercase">
                      {lang === "bn" ? "বিকাশ অ্যাকাউন্ট ও ধরন" : "bKash Account & Type"}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-sm font-extrabold text-neutral-900 dark:text-neutral-100">
                        {p.seller_bkash_number || p.seller_phone}
                      </span>
                      <span className="px-1.5 py-0.5 border text-[10px] font-bold uppercase text-neutral-600 dark:text-neutral-400">
                        {p.seller_bkash_type || "Personal"}
                      </span>
                    </div>
                    <div className="mt-1">
                      {isVerified ? (
                        <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                          ✓ {t("bkashVerifiedBadge")}
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-amber-600 flex items-center gap-1">
                          ⚠️ {t("bkashPendingBadge")} (
                          <Link href="/admin/users" className="underline hover:text-black dark:hover:text-white">
                            {lang === "bn" ? "ভেরিফাই করুন" : "Verify in Users"}
                          </Link>
                          )
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Payout Submission */}
                  <div>
                    <label htmlFor={`payout-trx-${p.id}`} className="text-neutral-500 font-semibold block uppercase">
                      {t("enterPayoutTrxId")} *
                    </label>
                    <div className="flex gap-2 mt-1">
                      <input
                        id={`payout-trx-${p.id}`}
                        type="text"
                        value={currentTrx}
                        onChange={(e) => handleTrxChange(p.id, e.target.value.toUpperCase())}
                        placeholder="e.g. BL991823KC"
                        className="font-mono text-xs uppercase flex-1"
                        disabled={!isVerified}
                      />
                      <button
                        type="button"
                        onClick={() => handlePay(p)}
                        disabled={acting === p.id || !currentTrx.trim() || !isVerified}
                        className="btn-success text-xs px-3 font-bold whitespace-nowrap"
                      >
                        {acting === p.id ? t("loading") : `✓ ${t("markAsPaid")}`}
                      </button>
                    </div>
                    {!isVerified && (
                      <span className="text-[11px] text-amber-600 block mt-1 font-semibold">
                        {t("sellerBkashNotVerified")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
