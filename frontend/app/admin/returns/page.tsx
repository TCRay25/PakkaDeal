"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, post } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSocket } from "@/lib/socket";

interface ReturnDeal {
  id: number;
  code: string;
  product: string;
  status: string;
  deal_type: string;
  total_amount: number;
  delivery_charge: number;
  return_charge: number;
  return_courier_name: string;
  return_tracking_id: string;
  return_reason: string;
  return_seller_trx_id: string;
  return_seller_paid_at: string;
  return_buyer_trx_id: string;
  return_buyer_paid_at: string;
  seller_name: string;
  seller_phone: string;
  seller_bkash_number: string;
  seller_bkash_type: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_bkash_number: string;
  buyer_bkash_type: string;
  seller_compensation: number;
  buyer_refund: number;
  is_seller_paid: boolean;
  is_buyer_paid: boolean;
}

export default function ReturnsManagementPage() {
  const { t, lang } = useI18n();
  const { on } = useSocket();
  const [deals, setDeals] = useState<ReturnDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [sellerTrxInputs, setSellerTrxInputs] = useState<Record<number, string>>({});
  const [buyerTrxInputs, setBuyerTrxInputs] = useState<Record<number, string>>({});
  const [acting, setActing] = useState<string | null>(null);

  const loadReturns = () => {
    setLoading(true);
    api<ReturnDeal[]>("/admin/returns")
      .then(setDeals)
      .catch(() => setDeals([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadReturns();
  }, []);

  // Real-time synchronization
  useEffect(() => {
    const unsub = on("admin:deal_updated", () => loadReturns());
    return unsub;
  }, [on]);

  const handlePaySeller = async (d: ReturnDeal) => {
    const trx = (sellerTrxInputs[d.id] || "").trim();
    if (!trx) {
      alert(lang === "bn" ? "সেলার ক্ষতিপূরণ TrxID লিখুন" : "Enter seller payout TrxID");
      return;
    }

    const confirmMsg =
      lang === "bn"
        ? `সেলার ${d.seller_name}-এর বিকাশ নম্বরে (${d.seller_bkash_number || d.seller_phone}) ডেলিভারি/রিটার্ন ক্ষতিপূরণ বাবদ ${d.seller_compensation} টাকা পরিশোধ নিশ্চিত করবেন? (TrxID: ${trx})`
        : `Confirm disbursement of ${d.seller_compensation} BDT seller compensation? (TrxID: ${trx})`;

    if (!confirm(confirmMsg)) return;

    setActing(`seller-${d.id}`);
    try {
      await post(`/admin/returns/${d.id}/pay-seller`, { trx_id: trx });
      setSellerTrxInputs((prev) => {
        const copy = { ...prev };
        delete copy[d.id];
        return copy;
      });
      loadReturns();
    } catch (err: any) {
      alert(err.message || "Failed to record seller compensation payout");
    } finally {
      setActing(null);
    }
  };

  const handlePayBuyer = async (d: ReturnDeal) => {
    const trx = (buyerTrxInputs[d.id] || "").trim();
    if (!trx) {
      alert(lang === "bn" ? "বায়ার রিফান্ড TrxID লিখুন" : "Enter buyer refund TrxID");
      return;
    }

    const confirmMsg =
      lang === "bn"
        ? `বায়ার ${d.buyer_name}-এর বিকাশ নম্বরে (${d.buyer_bkash_number || d.buyer_phone}) রিফান্ড বাবদ ${d.buyer_refund} টাকা পরিশোধ নিশ্চিত করবেন? (TrxID: ${trx})`
        : `Confirm disbursement of ${d.buyer_refund} BDT buyer refund? (TrxID: ${trx})`;

    if (!confirm(confirmMsg)) return;

    setActing(`buyer-${d.id}`);
    try {
      await post(`/admin/returns/${d.id}/pay-buyer`, { trx_id: trx });
      setBuyerTrxInputs((prev) => {
        const copy = { ...prev };
        delete copy[d.id];
        return copy;
      });
      loadReturns();
    } catch (err: any) {
      alert(err.message || "Failed to record buyer refund");
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("returnsManagement")}</h1>
        <p className="text-sm text-neutral-500">
          {lang === "bn"
            ? "রিটার্ন সংক্রান্ত ডিলে সেলারের ডেলিভারি ক্ষতিপূরণ ও বায়ারের রিফান্ড আলাদাভাবে পরিশোধ করুন এবং TrxID নথিভুক্ত করুন।"
            : "Manage return cases: disburse seller shipping compensation and buyer net refund on separate ledger lines with TrxID."}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      ) : deals.length === 0 ? (
        <div className="box p-8 text-center text-sm text-neutral-500">
          {lang === "bn"
            ? "কোনো সক্রিয় রিটার্ন বা অপেক্ষমাণ রিফান্ড নেই।"
            : "No active returns or pending return payouts."}
        </div>
      ) : (
        <div className="space-y-6">
          {deals.map((d) => (
            <div
              key={d.id}
              className="box p-6 border-2 border-rose-500/40 bg-white dark:bg-black space-y-5"
            >
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 pb-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase font-extrabold text-neutral-500">
                      {lang === "bn" ? "ডিল:" : "Deal:"}
                    </span>
                    <Link
                      href={`/deal/${d.code}`}
                      className="font-mono text-xs font-bold text-accent hover:underline"
                    >
                      #{d.code}
                    </Link>
                    <span className="px-2 py-0.5 text-[11px] font-bold uppercase bg-rose-50 dark:bg-rose-950/40 text-rose-600 border border-rose-500/30">
                      {d.status}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                    {d.product}
                  </h2>
                </div>

                <div className="flex items-center gap-3 font-mono text-xs">
                  <span>
                    {lang === "bn" ? "মোট এসক্রো জমা:" : "Escrow Deposit:"}{" "}
                    <strong className="text-neutral-900 dark:text-neutral-100">
                      {Number(d.total_amount).toLocaleString()} BDT
                    </strong>
                  </span>
                </div>
              </div>

              {/* Courier Return Tracking info */}
              <div className="p-3 bg-neutral-50 dark:bg-neutral-900 border text-xs space-y-1">
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <span className="text-neutral-500 font-semibold uppercase">{lang === "bn" ? "রিটার্ন কুরিয়ার:" : "Return Courier:"}</span>{" "}
                    <span className="font-bold">{d.return_courier_name || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500 font-semibold uppercase">{lang === "bn" ? "রিটার্ন ট্র্যাকিং ID:" : "Return Tracking ID:"}</span>{" "}
                    <span className="font-mono font-bold">{d.return_tracking_id || "N/A"}</span>
                  </div>
                  {d.return_reason && (
                    <div className="text-rose-600 dark:text-rose-400">
                      <span className="font-semibold uppercase">{lang === "bn" ? "রিটার্নের কারণ:" : "Reason:"}</span>{" "}
                      <span>{d.return_reason}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Two Action Rows: 1. Seller Shipping Compensation, 2. Buyer Refund */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Seller Compensation Row */}
                <div className="p-4 border-2 border-emerald-500/40 bg-emerald-50/10 space-y-3">
                  <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                    <span className="text-xs uppercase font-extrabold text-emerald-700 dark:text-emerald-400">
                      1. {t("sellerCompensation")}
                    </span>
                    <span className="font-mono font-bold text-base text-emerald-600">
                      {Number(d.seller_compensation).toLocaleString()} BDT
                    </span>
                  </div>

                  <div className="text-xs space-y-1">
                    <div>
                      <span className="text-neutral-500">{lang === "bn" ? "সেলার:" : "Seller:"}</span>{" "}
                      <span className="font-bold">{d.seller_name}</span> ({d.seller_phone})
                    </div>
                    <div>
                      <span className="text-neutral-500">{lang === "bn" ? "সেলার বিকাশ:" : "Seller bKash:"}</span>{" "}
                      <span className="font-mono font-bold">{d.seller_bkash_number || d.seller_phone}</span>{" "}
                      <span className="text-[10px] uppercase text-neutral-400">({d.seller_bkash_type || "Personal"})</span>
                    </div>
                  </div>

                  {d.is_seller_paid ? (
                    <div className="p-2.5 bg-emerald-600/10 border border-emerald-600/30 text-xs text-emerald-700 dark:text-emerald-300">
                      <span className="font-bold block">✓ {lang === "bn" ? "ক্ষতিপূরণ পরিশোধ সম্পন্ন" : "Compensation Paid"}</span>
                      <span className="font-mono text-[11px]">TrxID: {d.return_seller_trx_id}</span>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1 border-t border-emerald-500/20">
                      <input
                        type="text"
                        value={sellerTrxInputs[d.id] || ""}
                        onChange={(e) =>
                          setSellerTrxInputs((prev) => ({ ...prev, [d.id]: e.target.value.toUpperCase() }))
                        }
                        placeholder={t("enterPayoutTrxId")}
                        className="font-mono text-xs uppercase w-full"
                      />
                      <button
                        type="button"
                        onClick={() => handlePaySeller(d)}
                        disabled={acting === `seller-${d.id}` || !sellerTrxInputs[d.id]?.trim()}
                        className="btn-success text-xs py-1.5 px-3 w-full font-bold"
                      >
                        {acting === `seller-${d.id}` ? t("loading") : `✓ ${lang === "bn" ? "সেলার ক্ষতিপূরণ পরিশোধ মার্ক করুন" : "Disburse Seller Compensation"}`}
                      </button>
                    </div>
                  )}
                </div>

                {/* 2. Buyer Refund Row */}
                <div className="p-4 border-2 border-accent/40 bg-accent/5 space-y-3">
                  <div className="flex items-center justify-between border-b border-accent/20 pb-2">
                    <span className="text-xs uppercase font-extrabold text-accent">
                      2. {t("buyerRefund")}
                    </span>
                    <span className="font-mono font-bold text-base text-accent">
                      {Number(d.buyer_refund).toLocaleString()} BDT
                    </span>
                  </div>

                  <div className="text-xs space-y-1">
                    <div>
                      <span className="text-neutral-500">{lang === "bn" ? "বায়ার:" : "Buyer:"}</span>{" "}
                      <span className="font-bold">{d.buyer_name || (lang === "bn" ? "ক্রেতা" : "Buyer")}</span> ({d.buyer_phone})
                    </div>
                    <div>
                      <span className="text-neutral-500">{lang === "bn" ? "বায়ার বিকাশ:" : "Buyer bKash:"}</span>{" "}
                      <span className="font-mono font-bold">{d.buyer_bkash_number || d.buyer_phone}</span>{" "}
                      <span className="text-[10px] uppercase text-neutral-400">({d.buyer_bkash_type || "Personal"})</span>
                    </div>
                  </div>

                  {d.is_buyer_paid ? (
                    <div className="p-2.5 bg-accent/10 border border-accent/30 text-xs text-accent">
                      <span className="font-bold block">✓ {lang === "bn" ? "বায়ার রিফান্ড পরিশোধ সম্পন্ন" : "Refund Paid"}</span>
                      <span className="font-mono text-[11px]">TrxID: {d.return_buyer_trx_id}</span>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1 border-t border-accent/20">
                      <input
                        type="text"
                        value={buyerTrxInputs[d.id] || ""}
                        onChange={(e) =>
                          setBuyerTrxInputs((prev) => ({ ...prev, [d.id]: e.target.value.toUpperCase() }))
                        }
                        placeholder={t("enterPayoutTrxId")}
                        className="font-mono text-xs uppercase w-full"
                      />
                      <button
                        type="button"
                        onClick={() => handlePayBuyer(d)}
                        disabled={acting === `buyer-${d.id}` || !buyerTrxInputs[d.id]?.trim()}
                        className="btn text-xs py-1.5 px-3 w-full font-bold"
                      >
                        {acting === `buyer-${d.id}` ? t("loading") : `✓ ${lang === "bn" ? "বায়ার রিফান্ড পরিশোধ মার্ক করুন" : "Disburse Buyer Refund"}`}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
