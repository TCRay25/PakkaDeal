"use client";
import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, post, DealDetailResponse, API } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useSocket } from "@/lib/socket";
import StatusBadge from "@/components/StatusBadge";
import Timeline from "@/components/Timeline";
import MoneyBreakdown from "@/components/MoneyBreakdown";
import TrackingTimeline from "@/components/TrackingTimeline";

function useCountdown(targetIsoDate?: string | null, isPaused: boolean = false) {
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number; seconds: number; expired: boolean } | null>(null);

  useEffect(() => {
    if (!targetIsoDate || isPaused) {
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const diff = new Date(targetIsoDate).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, expired: true });
        return;
      }
      const totalSec = Math.floor(diff / 1000);
      const hours = Math.floor(totalSec / 3600);
      const minutes = Math.floor((totalSec % 3600) / 60);
      const seconds = totalSec % 60;
      setTimeLeft({ hours, minutes, seconds, expired: false });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [targetIsoDate, isPaused]);

  return timeLeft;
}

export default function DealPage({ params }: { params: Promise<{ code: string }> }) {
  const resolvedParams = use(params);
  const code = resolvedParams.code;
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { joinDeal, leaveDeal, on, isConnected } = useSocket();
  const router = useRouter();

  const [data, setData] = useState<DealDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // Modal states
  const [showPayModal, setShowPayModal] = useState(false);
  const [showShipModal, setShowShipModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Form states - Shipping & Courier Detection
  const [courierName, setCourierName] = useState("Steadfast");
  const [customCourierName, setCustomCourierName] = useState("");
  const [courierPhone, setCourierPhone] = useState("");
  const [trackingId, setTrackingId] = useState("");
  const [consignmentSlip, setConsignmentSlip] = useState<File | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectionResult, setDetectionResult] = useState<{
    detectedCourier: string | null;
    courierCode: string;
    detectionConfidence: number;
    isAmbiguous: boolean;
    candidates: any[];
  } | null>(null);
  const [manualCourierMode, setManualCourierMode] = useState(false);

  useEffect(() => {
    const trimmed = trackingId.trim();
    if (trimmed.length < 3) {
      setDetectionResult(null);
      setDetecting(false);
      return;
    }

    setDetecting(true);
    const timer = setTimeout(() => {
      post("/shipments/detect", { trackingId: trimmed })
        .then((res) => {
          setDetectionResult(res);
          if (res?.detectedCourier && res.detectionConfidence >= 70 && !res.isAmbiguous) {
            setCourierName(res.detectedCourier);
            setManualCourierMode(false);
          } else {
            setManualCourierMode(true);
          }
        })
        .catch(() => {
          setDetectionResult(null);
          setManualCourierMode(true);
        })
        .finally(() => setDetecting(false));
    }, 350);

    return () => clearTimeout(timer);
  }, [trackingId]);

  // Form states - Confirm Receipt
  const [unboxingPhoto, setUnboxingPhoto] = useState<File | null>(null);

  // Form states - Return & Dispute
  const [returnCourierName, setReturnCourierName] = useState("Pathao");
  const [returnTrackingId, setReturnTrackingId] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeEvidence, setDisputeEvidence] = useState("");
  const [disputePhoto, setDisputePhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Escrow Payment Gateway Form states
  const [payMethod, setPayMethod] = useState<"bKash" | "Nagad" | "Rocket" | "Bank">("bKash");
  const [senderPhone, setSenderPhone] = useState("");
  const [trxId, setTrxId] = useState("");
  const [copiedNumber, setCopiedNumber] = useState(false);

  const load = () => {
    setLoading(true);
    api<DealDetailResponse>(`/deals/${code}`)
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [code]);

  // Real-time deal lifecycle synchronization via Socket.IO
  useEffect(() => {
    if (!code) return;
    joinDeal(code);

    const refreshDeal = (payload?: any) => {
      if (!payload?.code || payload.code.toUpperCase() === code.toUpperCase()) {
        api<DealDetailResponse>(`/deals/${code}`)
          .then(setData)
          .catch(() => {});
      }
    };

    const unsubs = [
      on("deal:status_changed", refreshDeal),
      on("deal:event", refreshDeal),
      on("deal:updated", refreshDeal),
      on("dispute:opened", refreshDeal),
      on("dispute:decided", refreshDeal),
    ];

    return () => {
      leaveDeal(code);
      unsubs.forEach((u) => u());
    };
  }, [code, joinDeal, leaveDeal, on]);

  const deal = data?.deal;
  const isDelivered = deal?.status === "delivered";
  const countdown = useCountdown(deal?.auto_release_at || deal?.confirm_by, !!deal?.auto_release_paused);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      </div>
    );
  }

  if (err || !data || !deal) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center space-y-4">
        <h1 className="text-xl font-bold text-red-600">{t("notFound")}</h1>
        <p className="text-sm text-neutral-500">{err || "Deal not accessible."}</p>
        <Link href="/" className="btn text-xs">Return Home</Link>
      </div>
    );
  }

  const { seller, buyer, events, ledger, dispute, me } = data;

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setMsg(t("copied"));
    setTimeout(() => setMsg(""), 2000);
  };

  // Actions
  const handlePay = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (me?.is_seller) {
      alert(
        lang === "bn"
          ? "বিক্রেতা হিসেবে আপনি নিজের তৈরি করা ডিলে পেমেন্ট করতে পারবেন না। পেমেন্ট শুধুমাত্র বায়ার (ক্রেতা) সম্পন্ন করবেন।"
          : "Sellers cannot pay for their own deal. Only the buyer can pay into escrow."
      );
      return;
    }
    const effectiveSender = senderPhone.trim() || user?.phone || deal.buyer_phone;
    if (!effectiveSender) {
      alert(t("enterSenderPhoneAlert"));
      return;
    }
    if (!trxId.trim()) {
      alert(t("enterTrxIdAlert"));
      return;
    }
    setSubmitting(true);
    try {
      const res: any = await post(`/deals/${deal.code}/pay`, {
        payment_method: payMethod,
        sender_number: effectiveSender,
        trx_id: trxId.trim(),
      });
      if (res?.token) {
        localStorage.setItem("token", res.token);
      }
      setShowPayModal(false);
      load();
    } catch (x: any) {
      alert(x.message || "Failed to process escrow deposit");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDeal = async () => {
    if (
      !confirm(
        lang === "bn"
          ? "আপনি কি নিশ্চিত যে এই আনপেইড ডিলটি ডিলিট করতে চান? একবার ডিলিট করলে এটি সম্পূর্ণ মুছে যাবে।"
          : "Are you sure you want to delete this unpaid deal? This action cannot be undone."
      )
    ) {
      return;
    }
    setSubmitting(true);
    try {
      await api(`/deals/${deal.code}`, { method: "DELETE" });
      router.push("/dashboard/deals");
    } catch (x: any) {
      alert(x.message || "Failed to delete deal");
      setSubmitting(false);
    }
  };

  const handleShip = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalCourierName = courierName === "Other" ? (customCourierName.trim() || "Other Courier") : courierName;
    const lower = finalCourierName.toLowerCase();
    const isManual =
      lower === "other" ||
      lower === "other courier" ||
      lower.includes("sundarban") ||
      lower.includes("sa paribahan") ||
      lower.includes("s.a. paribahan");

    if (isManual && !courierPhone.trim()) {
      alert("Please enter the courier contact phone number");
      return;
    }
    if (isManual && !consignmentSlip) {
      alert("Please upload the consignment slip photo for manual courier audit");
      return;
    }
    if (!isManual && trackingId.trim().length < 3) {
      alert("Please enter a valid courier tracking ID");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("courier_name", finalCourierName);
      formData.append("tracking_id", trackingId.trim() || `MANUAL-${Date.now().toString(36).toUpperCase()}`);
      formData.append("courier_phone", courierPhone.trim());
      formData.append("is_manual_courier", isManual ? "1" : "0");
      if (consignmentSlip) formData.append("consignment_slip", consignmentSlip);

      await post(`/deals/${deal.code}/ship`, formData);
      setShowShipModal(false);
      load();
    } catch (x: any) {
      alert(x.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReceipt = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!confirm(t("confirmReleaseWarning"))) return;
    setSubmitting(true);
    try {
      if (unboxingPhoto) {
        const formData = new FormData();
        formData.append("unboxing_photo", unboxingPhoto);
        await post(`/deals/${deal.code}/confirm`, formData);
      } else {
        await post(`/deals/${deal.code}/confirm`);
      }
      setShowConfirmModal(false);
      load();
    } catch (x: any) {
      alert(x.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSimulateCourier = async (status: string) => {
    try {
      await post(`/deals/${deal.code}/simulate-courier`, { status });
      load();
    } catch (x: any) {
      alert(x.message);
    }
  };

  const handleRequestReturn = async () => {
    const reason = prompt(t("returnReasonPrompt"));
    if (!reason) return;
    try {
      await post(`/deals/${deal.code}/request-return`, { reason });
      load();
    } catch (x: any) {
      alert(x.message);
    }
  };

  const handleShipReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (returnTrackingId.trim().length < 3) {
      alert("Please enter return courier tracking ID");
      return;
    }
    setSubmitting(true);
    try {
      await post(`/deals/${deal.code}/ship-return`, {
        return_courier_name: returnCourierName,
        return_tracking_id: returnTrackingId.trim(),
      });
      setShowReturnModal(false);
      load();
    } catch (x: any) {
      alert(x.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSellerConfirmReturn = async () => {
    if (!confirm("Confirm that you have received the return parcel? Buyer will be refunded.")) return;
    setSubmitting(true);
    try {
      await post(`/deals/${deal.code}/confirm-return`);
      load();
    } catch (x: any) {
      alert(x.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("reason", disputeReason);
      formData.append("evidence_text", disputeEvidence);
      if (disputePhoto) formData.append("photo", disputePhoto);

      await post(`/deals/${deal.code}/dispute`, formData);
      setShowDisputeModal(false);
      load();
    } catch (x: any) {
      alert(x.message);
    } finally {
      setSubmitting(false);
    }
  };

  const isFundsHeld = ["held", "shipped", "in_transit", "delivered", "disputed"].includes(deal.status);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Top Banner */}
      <div className="box p-6 border-2 border-neutral-300 dark:border-neutral-700 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-bold text-accent">{deal.code}</span>
              <span className="text-xs uppercase px-2 py-0.5 border border-neutral-300 dark:border-neutral-700 text-neutral-500 font-semibold">
                {deal.deal_type}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {deal.product}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <StatusBadge status={deal.status} />
            <button onClick={copyLink} className="btn-ghost text-xs">
              {msg || t("copyLink")}
            </button>
          </div>
        </div>

        {deal.details && (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {deal.details}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Column */}
        <div className="lg:col-span-8 space-y-6">
          {/* Action Center Card */}
          <div className="box p-6 border-2 border-accent/40 bg-accent/5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
                Current Escrow Phase: {deal.status.replace(/_/g, " ").toUpperCase()}
              </h2>
              <span className="text-xs font-mono font-bold text-accent">
                Vault: {deal.total_amount.toLocaleString()} BDT
              </span>
            </div>

            {/* SELLER & BUYER ESCROW VAULT HELD CONFIRMATION CARD */}
            {isFundsHeld && (
              <div className="p-4 border-2 border-emerald-500/50 bg-emerald-500/10 dark:bg-emerald-950/20 space-y-3">
                <div className="flex items-center justify-between border-b border-emerald-500/30 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-none shadow animate-pulse" />
                    <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                      Payment Received by PakkaDeal – Escrow Held
                    </span>
                  </div>
                  <span className="font-mono text-sm font-extrabold text-neutral-900 dark:text-neutral-100">
                    {deal.total_amount.toLocaleString()} BDT
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-neutral-500 block text-[11px]">{t("gateway")}:</span>
                    <span className="font-semibold">{deal.payment_method || "bKash"} Escrow</span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[11px]">{t("senderPhone")}:</span>
                    <span className="font-mono">{deal.payment_sender || deal.buyer_phone}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[11px]">{t("trxId")}:</span>
                    <span className="font-mono font-bold text-accent">{deal.payment_trx_id || "TRX-VERIFIED"}</span>
                  </div>
                </div>

                {/* Seller Reassurance Notice */}
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed border-t border-emerald-500/20 pt-2">
                  {lang === "bn"
                    ? "✓ টাকা সরাসরি পাক্কাডিল অফিসিয়াল এসক্রো ভল্টে জমা রয়েছে। ক্রেতার ব্যক্তিগত কথার ওপর নির্ভর করার প্রয়োজন নেই—পাক্কাডিল স্ট্যাটাস নিশ্চিত করছে টাকা জমা আছে। বিক্রেতা এখন নিশ্চিন্তে পার্সেল পাঠাতে পারেন।"
                    : "✓ Payment received and secured in PakkaDeal official escrow vault. Never rely on verbal or SMS confirmation from the buyer—PakkaDeal status guarantees funds are locked. The seller can safely ship the item now."}
                </p>
              </div>
            )}

            {/* 24-HOUR AUTO-RELEASE COUNTDOWN TIMER (WHEN DELIVERED) */}
            {isDelivered && (
              <div className="p-4 border-2 border-amber-500/60 bg-amber-500/10 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-extrabold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-amber-500 rounded-none animate-ping" />
                    {lang === "bn" ? "২৪ ঘণ্টা অটো-রিলিজ কাউন্টডাউন" : "24-Hour Auto-Release Countdown"}
                  </span>
                  <span className="text-xs font-mono font-bold text-amber-700 dark:text-amber-300">
                    {deal.auto_release_paused ? "PAUSED" : "ACTIVE"}
                  </span>
                </div>

                {deal.auto_release_paused ? (
                  <div className="p-2 border border-purple-500/30 bg-purple-500/10 text-xs text-purple-700 dark:text-purple-300">
                    {lang === "bn"
                      ? "অটো-রিলিজ টাইমার স্থগিত রয়েছে কারণ বিরোধ বা রিটার্ন প্রক্রিয়াধীন আছে।"
                      : "Auto-release countdown is paused due to active dispute or return request."}
                  </div>
                ) : countdown ? (
                  <div className="flex items-center gap-4 py-2">
                    <div className="font-mono text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-neutral-100 tracking-wider">
                      {String(countdown.hours).padStart(2, "0")}h : {String(countdown.minutes).padStart(2, "0")}m : {String(countdown.seconds).padStart(2, "0")}s
                    </div>
                    <span className="text-xs text-neutral-600 dark:text-neutral-400">
                      {lang === "bn"
                        ? "সময় শেষ হলে টাকা স্বয়ংক্রিয়ভাবে বিক্রেতাকে রিলিজ করা হবে।"
                        : "remaining before funds auto-release to seller."}
                    </span>
                  </div>
                ) : null}

                <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                  {lang === "bn"
                    ? "ক্রেতা পণ্য যাচাই করে 'Confirm Receipt' ক্লিক করুন। কোন সমস্যা থাকলে বিরোধ উত্থাপন করুন।"
                    : "Buyer should inspect the parcel and confirm receipt. If any damage or issue, open a dispute before the timer expires."}
                </p>
              </div>
            )}

            {/* State: created or payment_pending */}
            {(deal.status === "created" || deal.status === "payment_pending") && (
              <div className="space-y-4">
                {me.is_seller ? (
                  /* SELLER VIEW: Waiting for Buyer to Pay, Share Link, Cannot Pay Own Deal */
                  <div className="p-6 border-2 border-amber-500/60 bg-amber-500/5 dark:bg-amber-950/20 space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-500/30 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 bg-amber-500 rounded-none animate-pulse" />
                          <h3 className="text-sm font-extrabold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                            {lang === "bn" ? "🕒 বায়ারের পেমেন্টের জন্য অপেক্ষমাণ" : "🕒 Awaiting Buyer Payment into Escrow"}
                          </h3>
                        </div>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                          {lang === "bn"
                            ? "আপনি এই ডিলের বিক্রেতা (Seller)। ক্রেতার এসক্রো ভল্টে টাকা জমার জন্য অপেক্ষা করা হচ্ছে।"
                            : "You created this deal as the Seller. Waiting for the buyer to deposit funds into escrow."}
                        </p>
                      </div>

                      <div className="text-left sm:text-right">
                        <span className="text-[11px] text-neutral-500 block uppercase font-semibold">
                          {lang === "bn" ? "প্রদেয় অর্থ" : "Vault Amount"}
                        </span>
                        <span className="text-xl font-mono font-extrabold text-neutral-900 dark:text-neutral-100">
                          {deal.total_amount.toLocaleString()} BDT
                        </span>
                      </div>
                    </div>

                    {/* Counterparty Buyer Information */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-xs">
                      <div>
                        <span className="text-neutral-500 block text-[11px] font-medium">{t("buyer")}:</span>
                        <span className="font-bold text-neutral-900 dark:text-neutral-100 text-sm">{deal.buyer_name}</span>
                      </div>
                      <div>
                        <span className="text-neutral-500 block text-[11px] font-medium">{t("buyerPhone")}:</span>
                        <span className="font-mono font-bold text-accent text-sm">{deal.buyer_phone}</span>
                      </div>
                    </div>

                    {/* Share Deal Link with Buyer */}
                    <div className="p-4 bg-white dark:bg-neutral-900 border-2 border-accent/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-accent flex items-center gap-1.5">
                          🔗 {lang === "bn" ? "বায়ারকে পাঠানোর ডিল লিংক" : "Shareable Deal Link for Buyer"}
                        </span>
                        <span className="text-[11px] text-neutral-500">
                          {lang === "bn" ? "বায়ার এই লিংক খুলে পেমেন্ট করবেন" : "Buyer opens this link to deposit"}
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          readOnly
                          value={typeof window !== "undefined" ? window.location.href : ""}
                          className="font-mono text-xs py-2 px-3 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 flex-1 select-all"
                          onClick={(e) => (e.target as HTMLInputElement).select()}
                        />
                        <button
                          type="button"
                          onClick={copyLink}
                          className="btn text-xs py-2 px-4 shrink-0 font-bold"
                        >
                          📋 {msg || (lang === "bn" ? "লিংক কপি করুন" : "Copy Link")}
                        </button>
                        <a
                          href={`https://wa.me/88${deal.buyer_phone.replace(/\D/g, "").slice(-11)}?text=${encodeURIComponent(
                            lang === "bn"
                              ? `আসসালামু আলাইকুম ${deal.buyer_name}, পাক্কাডিল এসক্রোতে আপনার "${deal.product}" অর্ডারের ডিল তৈরি হয়েছে। মোট পরিমাণ: ${deal.total_amount} BDT। অর্ডারটি নিশ্চিত করতে এসক্রোতে পেমেন্ট সম্পন্ন করুন: ${typeof window !== "undefined" ? window.location.href : ""}`
                              : `Hello ${deal.buyer_name}, your escrow deal for "${deal.product}" is ready on PakkaDeal. Total: ${deal.total_amount} BDT. Please deposit into escrow to proceed: ${typeof window !== "undefined" ? window.location.href : ""}`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5 shrink-0"
                        >
                          💬 WhatsApp
                        </a>
                      </div>

                      <p className="text-[11px] text-neutral-600 dark:text-neutral-400 leading-relaxed">
                        {lang === "bn"
                          ? "📌 বায়ার এই লিংকে প্রবেশ করে বিকাশ, নগদ বা ব্যাংকের মাধ্যমে পাক্কাডিল অফিসিয়াল মার্চেন্টে টাকা ডিপোজিট করবেন। বায়ারের টাকা এসক্রো ভল্টে জমা হওয়ামাত্র আপনাকে নোটিফিকেশন পাঠানো হবে এবং আপনি পার্সেল পাঠানোর অপশন পাবেন।"
                          : "📌 Send this link to the buyer. Once the buyer completes the escrow deposit, you will receive an instant notification to ship the package."}
                      </p>
                    </div>

                    {/* Escrow Rule: Seller cannot pay for their own deal */}
                    <div className="p-3 bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
                      <div className="font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                        <span>🛡️</span>
                        <span>
                          {lang === "bn" ? "এসক্রো পলিসি: বিক্রেতা নিজে পেমেন্ট করতে পারবেন না" : "Escrow Policy: Seller Cannot Pay For Own Deal"}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        {lang === "bn"
                          ? "যেহেতু আপনি এই ডিলের বিক্রেতা, তাই আপনি নিজে এতে টাকা জমা দিতে পারবেন না। এসক্রো নিয়মে শুধুমাত্র ক্রেতা (বায়ার) টাকা পরিশোধ করবেন এবং পণ্য ডেলিভারি সম্পন্ন হলে আপনি সার্ভিস চার্জ বাদে পুরো টাকা বুঝে পাবেন।"
                          : "Because you are the seller, you cannot fund your own deal. The buyer must make the escrow payment, which will be released to you upon successful delivery."}
                      </p>
                    </div>

                    {/* Seller Delete Option */}
                    <div className="flex items-center justify-between pt-2 border-t border-amber-500/20">
                      <span className="text-xs text-neutral-500">
                        {lang === "bn"
                          ? "বায়ার টাকা জমা দেওয়ার আগে যেকোনো সময় ডিলটি মুছে ফেলতে পারেন।"
                          : "You can delete this deal anytime before the buyer deposits payment."}
                      </span>
                      <button
                        type="button"
                        onClick={handleDeleteDeal}
                        disabled={submitting}
                        className="text-xs py-1.5 px-3 border border-rose-500/50 text-rose-600 hover:bg-rose-600 hover:text-white transition-colors font-medium flex items-center gap-1.5"
                      >
                        🗑️ {lang === "bn" ? "ডিল ডিলিট করুন" : "Delete Deal"}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* BUYER / GUEST VIEW: Prominent Escrow Payment Action Card */
                  <div className="p-5 border-2 border-accent bg-accent/5 dark:bg-accent/10 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <span className="text-xs uppercase font-extrabold text-accent tracking-wider block">
                          🔒 {lang === "bn" ? "পাক্কাডিল অফিসিয়াল এসক্রো ডিপোজিট" : "PakkaDeal Official Escrow Deposit"}
                        </span>
                        <div className="text-2xl font-extrabold text-neutral-900 dark:text-neutral-100 font-mono">
                          {deal.total_amount.toLocaleString()} BDT
                        </div>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400">
                          {lang === "bn"
                            ? "টাকা সরাসরি পাক্কাডিল এসক্রো ভল্টে নিরাপদে জমা থাকবে। আপনি পণ্য হাতে পেয়ে যাচাই না করা পর্যন্ত বিক্রেতা কোনো টাকা পাবেন না।"
                            : "Funds remain safely locked in PakkaDeal escrow vault until you inspect and verify the product."}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSenderPhone(user?.phone || deal.buyer_phone);
                          setShowPayModal(true);
                        }}
                        className="btn text-sm py-3 px-6 font-bold shadow-md flex items-center justify-center gap-2 shrink-0"
                      >
                        💳 {lang === "bn" ? "বিকাশ / নগদ / ব্যাংকে পে করুন" : "Pay into Escrow (bKash/Nagad/Bank)"}
                      </button>
                    </div>

                    {!user && (
                      <p className="text-[11px] text-neutral-500 italic">
                        {lang === "bn"
                          ? "* আপনি অতিথি হিসেবে পেমেন্ট করতে পারেন। পেমেন্ট সম্পন্ন হলে স্বয়ংক্রিয়ভাবে আপনার অ্যাকাউন্টে লগইন হয়ে যাবে।"
                          : "* You can pay as a guest. Your account will automatically authenticate once payment is confirmed."}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* State: held */}
            {deal.status === "held" && (
              <div className="space-y-4">
                <p className="text-sm text-neutral-700 dark:text-neutral-300">
                  {deal.deal_type === "product"
                    ? "Buyer deposited full amount into escrow vault. Seller must dispatch package within agreed timeframe."
                    : "Rental / Service deposit is locked in escrow. Complete handover and both parties confirm."}
                </p>

                <div className="flex flex-wrap gap-2">
                  {deal.deal_type === "product" ? (
                    me.is_seller && (
                      <button onClick={() => setShowShipModal(true)} className="btn text-sm">
                        {t("addShip")}
                      </button>
                    )
                  ) : (
                    <button onClick={handleConfirmReceipt} disabled={submitting} className="btn-success text-sm">
                      {t("confirmHandover")}
                    </button>
                  )}

                  <button
                    onClick={() => setShowDisputeModal(true)}
                    className="btn-danger text-xs"
                  >
                    {t("reportProblem")}
                  </button>
                </div>
              </div>
            )}

            {/* State: shipped or in_transit */}
            {(deal.status === "shipped" || deal.status === "in_transit") && (
              <div className="space-y-4">
                <TrackingTimeline
                  tracking={data.tracking}
                  deal={deal}
                  onViewSlip={() => setPreviewImage(`${API}/deals/${deal.code}/consignment-slip`)}
                />

                {/* Demo courier simulation buttons */}
                <div className="pt-2 border-t border-neutral-300 dark:border-neutral-700 space-y-2">
                  <span className="text-xs uppercase font-bold text-neutral-500 block">
                    Demo Courier Controls (Steadfast/Pathao/RedX Simulation)
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleSimulateCourier("in_transit")}
                      className="btn-ghost text-xs"
                    >
                      Simulate Hub Transit
                    </button>
                    <button
                      onClick={() => handleSimulateCourier("delivered")}
                      className="btn-success text-xs"
                    >
                      Simulate Delivered
                    </button>
                    <button
                      onClick={() => handleSimulateCourier("refused")}
                      className="btn-danger text-xs"
                    >
                      Simulate Doorstep Refusal
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* State: delivered */}
            {deal.status === "delivered" && (
              <div className="space-y-4">
                <TrackingTimeline
                  tracking={data.tracking}
                  deal={deal}
                  onViewSlip={() => setPreviewImage(`${API}/deals/${deal.code}/consignment-slip`)}
                />
                <div className="flex flex-wrap gap-3">
                  {me.is_buyer && (
                    <>
                      <button onClick={() => setShowConfirmModal(true)} disabled={submitting} className="btn-success text-sm py-2 px-4">
                        {t("confirmReceipt")}
                      </button>
                      {deal.return_policy !== "no_returns" && (
                        <button onClick={handleRequestReturn} className="btn-ghost text-xs">
                          {t("requestReturn")}
                        </button>
                      )}
                    </>
                  )}
                  <button onClick={() => setShowDisputeModal(true)} className="btn-danger text-xs">
                    {t("reportProblem")}
                  </button>
                </div>
              </div>
            )}

            {/* State: return_requested */}
            {deal.status === "return_requested" && (
              <div className="space-y-3">
                <div className="p-3 border border-orange-500/40 bg-orange-500/10 text-xs text-orange-800 dark:text-orange-200">
                  Buyer requested return. Buyer must dispatch the parcel back to the seller and enter return tracking.
                </div>
                {me.is_buyer && (
                  <button onClick={() => setShowReturnModal(true)} className="btn text-xs">
                    {t("shipReturn")}
                  </button>
                )}
                <button onClick={() => setShowDisputeModal(true)} className="btn-danger text-xs">
                  {t("reportProblem")}
                </button>
              </div>
            )}

            {/* State: return_shipped */}
            {deal.status === "return_shipped" && (
              <div className="space-y-3">
                <div className="p-3 border border-orange-500/40 bg-orange-500/10 text-xs text-orange-800 dark:text-orange-200 space-y-1">
                  <div className="font-semibold">Return in transit: {deal.return_courier_name} ({deal.return_tracking_id})</div>
                  <div>Awaiting seller confirmation of parcel arrival.</div>
                </div>

                {me.is_seller && (
                  <button onClick={handleSellerConfirmReturn} disabled={submitting} className="btn-success text-xs">
                    ✓ Confirm Return Received & Issue Refund
                  </button>
                )}

                <button onClick={() => handleSimulateCourier("delivered")} className="btn-ghost text-xs">
                  Simulate Return Delivery (Courier Webhook)
                </button>
              </div>
            )}

            {/* State: disputed */}
            {deal.status === "disputed" && (
              <div className="space-y-3">
                <div className="p-3 border border-purple-500/40 bg-purple-500/10 text-xs text-purple-800 dark:text-purple-200">
                  <strong>{t("disputeUnderReview")}:</strong> {t("disputeUnderReviewText")}
                </div>
                {me.is_admin && (
                  <Link href="/admin/disputes" className="btn text-xs">
                    Open Admin Queue to Decide →
                  </Link>
                )}
              </div>
            )}

            {/* State: released */}
            {deal.status === "released" && (
              <div className="p-3 border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-800 dark:text-emerald-200 space-y-1">
                <strong>{t("dealCompleted")}:</strong> {t("dealCompletedText")} ({deal.seller_payout.toLocaleString()} BDT)
                {deal.has_unboxing_photo && (
                  <button
                    onClick={() => setPreviewImage(`${API}/deals/${deal.code}/unboxing-photo`)}
                    className="text-xs text-accent font-semibold hover:underline block pt-1"
                  >
                    📸 View Buyer Unboxing Proof →
                  </button>
                )}
              </div>
            )}

            {/* State: refunded */}
            {deal.status === "refunded" && (
              <div className="p-3 border border-rose-500/30 bg-rose-500/10 text-xs text-rose-800 dark:text-rose-200">
                <strong>{t("escrowRefunded")}:</strong> {deal.outcome || t("escrowRefundedText")}
              </div>
            )}
          </div>

          {/* Dispute details if present */}
          {dispute && (
            <div className="box p-5 border border-purple-500/30 space-y-3 bg-purple-50/50 dark:bg-purple-950/20">
              <div className="flex items-center justify-between border-b border-purple-200 dark:border-purple-800 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                  Dispute Case Details
                </span>
                <span className="text-xs px-2 py-0.5 border border-purple-500 font-semibold">{dispute.status}</span>
              </div>
              <div className="text-sm">
                <strong>Reason:</strong> {dispute.reason}
              </div>
              {dispute.evidence_text && (
                <div className="text-xs text-neutral-600 dark:text-neutral-400">
                  <strong>Evidence:</strong> {dispute.evidence_text}
                </div>
              )}
              {dispute.ai_summary && (
                <div className="p-3 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black text-xs space-y-1">
                  <span className="text-xs font-bold uppercase text-accent block">AI Multimodal Assessment:</span>
                  <p>{dispute.ai_summary}</p>
                  <p className="font-semibold text-neutral-700 dark:text-neutral-300">
                    Recommendation: {dispute.ai_recommendation.toUpperCase()}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Audit Timeline with Stepper and Next Step */}
          <div className="box p-6 space-y-4">
            <h2 className="text-base font-bold tracking-tight text-neutral-900 dark:text-neutral-100 border-b border-neutral-200 dark:border-neutral-800 pb-2">
              {t("timeline")}
            </h2>
            <Timeline events={events} currentStatus={deal.status} />
          </div>

          {/* Immutable Ledger Entries for this Deal */}
          {ledger && ledger.length > 0 && (
            <div className="box p-6 space-y-4">
              <h2 className="text-base font-bold tracking-tight text-neutral-900 dark:text-neutral-100 border-b border-neutral-200 dark:border-neutral-800 pb-2">
                Escrow Ledger Audit
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-500 font-semibold uppercase">
                    <tr>
                      <th className="p-2">Type</th>
                      <th className="p-2">Amount</th>
                      <th className="p-2">Party</th>
                      <th className="p-2">Notes</th>
                      <th className="p-2">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {ledger.map((l) => (
                      <tr key={l.id}>
                        <td className="p-2 font-mono font-semibold uppercase">{l.transaction_type}</td>
                        <td className="p-2 font-mono">{l.amount.toLocaleString()} BDT</td>
                        <td className="p-2 font-mono text-neutral-500">{l.party_phone || "System"}</td>
                        <td className="p-2 text-neutral-600 dark:text-neutral-400">{l.notes}</td>
                        <td className="p-2 text-neutral-400 whitespace-nowrap">{new Date(l.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Column */}
        <div className="lg:col-span-4 space-y-6">
          <MoneyBreakdown deal={deal} />

          {/* Counterparties Card */}
          <div className="box p-5 border border-neutral-200 dark:border-neutral-800 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-neutral-800 pb-2">
              {t("counterparties")}
            </h3>

            {/* Seller */}
            <div className="space-y-1 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-xs uppercase font-semibold text-neutral-500">{t("seller")}</span>
                <span className="text-xs font-bold text-accent font-mono">{seller.seller_trust}/100</span>
              </div>
              <div className="font-semibold">{seller.page_name || seller.name || t("seller")}</div>
              <Link href={`/seller/${seller.id}`} className="text-xs text-accent hover:underline block">
                {t("viewShopProfile")}
              </Link>
            </div>

            {/* Buyer */}
            <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-1 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-xs uppercase font-semibold text-neutral-500">{t("buyer")}</span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {buyer.trust_score}/100
                </span>
              </div>
              <div className="font-semibold">{buyer.name || t("buyer")}</div>
              <div className="text-xs font-mono text-neutral-500">{buyer.phone}</div>
              <div className="text-xs text-neutral-400">
                {t("deliveredCount")}: {buyer.delivered} | {t("refusedCount")}: {buyer.refused}
              </div>
            </div>

            {/* Address */}
            <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
              <span className="font-semibold text-neutral-900 dark:text-neutral-100 block">{t("deliveryHandover")}:</span>
              <p>{deal.address}, {deal.area}</p>
            </div>
          </div>

          {/* Risk Card (For Seller) */}
          {me.is_seller && (
            <div className="box p-4 border border-neutral-200 dark:border-neutral-800 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs uppercase font-bold text-neutral-500">{t("orderRiskAssessment")}</span>
                <span className={`text-xs font-bold font-mono px-2 py-0.5 border ${
                  deal.risk_score > 35 ? "border-rose-500 text-rose-500" : "border-emerald-600 text-emerald-600"
                }`}>
                  {deal.risk_score} / 100
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                {t("indicators")}: {deal.risk_reasons || "Standard verified profile parameters."}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Pay into Escrow */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form onSubmit={handlePay} className="box w-full max-w-lg p-6 border-2 border-accent space-y-4 bg-white dark:bg-black max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-neutral-200 dark:border-neutral-800 pb-2">
              <div>
                <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
                  {t("officialEscrowDeposit")}
                </h3>
                <span className="text-[11px] text-accent font-semibold block">
                  {t("amountToLock")}: {deal.total_amount.toLocaleString()} BDT
                </span>
              </div>
              <button type="button" onClick={() => setShowPayModal(false)} className="text-neutral-500 hover:text-black dark:hover:text-white">✕</button>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-neutral-500">{t("selectGateway")}</label>
              <div className="grid grid-cols-4 gap-2">
                {(["bKash", "Nagad", "Rocket", "Bank"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setPayMethod(m);
                      setCopiedNumber(false);
                    }}
                    className={`py-2 px-1 text-xs font-bold border transition-colors ${
                      payMethod === m
                        ? "border-accent bg-accent text-white"
                        : "border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 text-neutral-700 dark:text-neutral-300"
                    }`}
                  >
                    {m === "bKash" ? (lang === "bn" ? "বিকাশ" : "bKash") : m === "Nagad" ? (lang === "bn" ? "নগদ" : "Nagad") : m === "Rocket" ? (lang === "bn" ? "রকেট" : "Rocket") : (lang === "bn" ? "ব্যাংক" : "Bank")}
                  </button>
                ))}
              </div>
            </div>

            {/* Official Escrow Merchant Display */}
            <div className="p-3.5 bg-accent/5 border border-accent/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-extrabold text-accent">
                  {t("officialMerchantNumber")} ({payMethod}):
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const num =
                      payMethod === "bKash"
                        ? data.escrow_accounts?.bkash || "01711-000000"
                        : payMethod === "Nagad"
                        ? data.escrow_accounts?.nagad || "01911-000000"
                        : payMethod === "Rocket"
                        ? data.escrow_accounts?.rocket || "01811-000000"
                        : data.escrow_accounts?.bankAccount || "PakkaDeal Escrow Services Ltd (A/C: 150239482001)";
                    navigator.clipboard.writeText(num);
                    setCopiedNumber(true);
                    setTimeout(() => setCopiedNumber(false), 2500);
                  }}
                  className="px-2 py-0.5 text-xs font-semibold bg-white dark:bg-black border border-accent text-accent hover:bg-accent hover:text-white"
                >
                  {copiedNumber ? (lang === "bn" ? "✓ কপি হয়েছে" : "✓ Copied!") : t("copyMerchantNumber")}
                </button>
              </div>

              <div className="font-mono text-base font-extrabold text-neutral-900 dark:text-neutral-100">
                {payMethod === "bKash" && (data.escrow_accounts?.bkash || "01711-000000")}
                {payMethod === "Nagad" && (data.escrow_accounts?.nagad || "01911-000000")}
                {payMethod === "Rocket" && (data.escrow_accounts?.rocket || "01811-000000")}
                {payMethod === "Bank" && (
                  <div>
                    <div>{data.escrow_accounts?.bankName || "City Bank Ltd (Gulshan Branch)"}</div>
                    <div className="text-xs text-neutral-500">{data.escrow_accounts?.bankAccount || "PakkaDeal Escrow Services Ltd (A/C: 150239482001)"}</div>
                  </div>
                )}
              </div>

              <p className="text-[11px] text-neutral-600 dark:text-neutral-400 leading-relaxed border-t border-accent/20 pt-1.5">
                {lang === "bn"
                  ? (data.escrow_accounts?.instructions || "বিকাশ বা নগদ অ্যাপের 'Make Payment' অপশন থেকে পাক্কাডিল অফিসিয়াল এসক্রো মার্চেন্ট নাম্বারে সম্পূর্ণ টাকা পেমেন্ট করুন। এরপর প্রাপ্ত Transaction ID (TrxID) এবং আপনার প্রেরক নম্বর নিচে বসিয়ে কনফার্ম করুন। টাকা সরাসরি পাক্কা ডিল এসক্রো ভল্টে সুরক্ষিত থাকবে।")
                  : "Use the 'Make Payment' option in the bKash or Nagad app to deposit the full amount to the official PakkaDeal escrow merchant number. Then enter your sender mobile number and Transaction ID (TrxID) below to lock funds in escrow."}
              </p>
            </div>

            {/* Inputs: Sender Number & TrxID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="pay-sender-phone">{t("senderPhone")}</label>
                <input
                  id="pay-sender-phone"
                  required
                  value={senderPhone || user?.phone || deal.buyer_phone}
                  onChange={(e) => setSenderPhone(e.target.value)}
                  placeholder="e.g. 017XXXXXXXX"
                  className="font-mono text-sm"
                />
                <span className="text-[11px] text-neutral-500 mt-0.5 block">{t("senderPhoneHelp")}</span>
              </div>

              <div>
                <div className="flex justify-between items-center">
                  <label htmlFor="pay-trx-id">{t("trxId")}</label>
                  <button
                    type="button"
                    onClick={() => {
                      setTrxId("TX-" + Date.now().toString(36).toUpperCase());
                      if (!senderPhone) setSenderPhone(deal.buyer_phone);
                    }}
                    className="text-[10px] text-accent underline hover:text-black dark:hover:text-white"
                  >
                    ⚡ {lang === "bn" ? "ডেমো TrxID" : "Demo TrxID"}
                  </button>
                </div>
                <input
                  id="pay-trx-id"
                  required
                  value={trxId}
                  onChange={(e) => setTrxId(e.target.value.toUpperCase())}
                  placeholder="e.g. BLA9238DK3"
                  className="font-mono text-sm uppercase"
                />
                <span className="text-[11px] text-neutral-500 mt-0.5 block">{t("trxIdHelp")}</span>
              </div>
            </div>

            <div className="p-2.5 bg-neutral-100 dark:bg-neutral-900 text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
              <strong className="block text-neutral-900 dark:text-neutral-100">🔒 {t("escrowGuaranteeTitle")}:</strong>
              <p>
                {t("escrowGuaranteeText")}
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setShowPayModal(false)} className="btn-ghost w-1/3">
                {t("cancel")}
              </button>
              <button type="submit" disabled={submitting} className="btn w-2/3">
                {submitting ? t("processing") : `${t("confirmAndLock")} (${deal.total_amount.toLocaleString()} BDT)`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Dispatch Shipment with Smart Courier Detection */}
      {showShipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form onSubmit={handleShip} className="box w-full max-w-lg p-6 border-2 border-accent space-y-4 bg-white dark:bg-black max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-neutral-200 dark:border-neutral-800 pb-2">
              <div>
                <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">{t("addShip")}</h3>
                <span className="text-[11px] text-neutral-500 block">{t("courierTrackingHelp")}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowShipModal(false);
                  setTrackingId("");
                  setDetectionResult(null);
                  setManualCourierMode(false);
                }}
                className="text-neutral-500 hover:text-black dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Tracking ID Input: Primary Field */}
            <div className="space-y-1.5">
              <label htmlFor="ship-tracking-input" className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                {t("courierTrackingId")} *
              </label>
              <div className="relative">
                <input
                  id="ship-tracking-input"
                  required
                  autoFocus
                  value={trackingId}
                  onChange={(e) => setTrackingId(e.target.value.toUpperCase())}
                  placeholder="e.g. SF12345678, PT1029384, REDX..., CN-12345"
                  className="font-mono text-sm tracking-wider uppercase font-semibold pr-10"
                />
                {detecting && (
                  <div className="absolute right-3 top-2.5 text-xs text-neutral-400 animate-pulse">
                    ...
                  </div>
                )}
              </div>
              <span className="text-[11px] text-neutral-500 block">
                {detecting ? t("courierDetecting") : t("courierTrackingHelp")}
              </span>
            </div>

            {/* Auto-Detection Banner (When courier identified) */}
            {detectionResult?.detectedCourier && !manualCourierMode && (
              <div className="p-3.5 border border-emerald-500/40 bg-emerald-500/10 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-700 dark:text-emerald-300 block">
                    ✓ {t("courierDetected")}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                      {detectionResult.detectedCourier}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-emerald-600 text-white font-mono font-bold">
                      {detectionResult.detectionConfidence}% {lang === "bn" ? "নিশ্চিত" : "Match"}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setManualCourierMode(true)}
                  className="text-xs font-semibold underline text-neutral-600 dark:text-neutral-300 hover:text-black dark:hover:text-white"
                >
                  {t("changeCourier")}
                </button>
              </div>
            )}

            {/* Ambiguous Detection or Manual Selection Mode */}
            {(manualCourierMode || (!detectionResult?.detectedCourier && trackingId.length >= 3)) && (
              <div className="space-y-3 p-3.5 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50">
                <div className="flex items-center justify-between">
                  <label htmlFor="ship-courier-select" className="text-xs font-bold uppercase text-neutral-700 dark:text-neutral-300">
                    {t("courierName")} *
                  </label>
                  {detectionResult?.detectedCourier && (
                    <button
                      type="button"
                      onClick={() => {
                        setCourierName(detectionResult.detectedCourier || "Steadfast");
                        setManualCourierMode(false);
                      }}
                      className="text-[11px] text-accent underline"
                    >
                      ← {lang === "bn" ? "শনাক্তকৃত কুরিয়ার ব্যবহার করুন" : "Use Detected Courier"}
                    </button>
                  )}
                </div>

                {detectionResult?.isAmbiguous && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    ⚠️ {t("courierAmbiguous")}
                  </p>
                )}

                <select
                  id="ship-courier-select"
                  value={courierName}
                  onChange={(e) => setCourierName(e.target.value)}
                  className="font-semibold text-sm"
                >
                  <option value="Steadfast">Steadfast Courier (API Verified)</option>
                  <option value="Pathao">Pathao Courier (API Verified)</option>
                  <option value="RedX">RedX Logistics (API Verified)</option>
                  <option value="Paperfly">Paperfly (API Verified)</option>
                  <option value="eCourier">eCourier (API Verified)</option>
                  <option value="Sundarban Courier">Sundarban Courier (Manual / Offline)</option>
                  <option value="SA Paribahan">SA Paribahan (Manual / Offline)</option>
                  <option value="Other">Other / Local Courier (Manual Audit)</option>
                </select>
              </div>
            )}

            {/* Manual Courier Requirements (Sundarban, SA Paribahan, Other) */}
            {(courierName === "Other" ||
              courierName === "Sundarban Courier" ||
              courierName === "SA Paribahan") && (
              <div className="space-y-3 p-3.5 border border-amber-500/40 bg-amber-500/10 text-xs space-y-3">
                <div className="space-y-1">
                  <span className="font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 block">
                    ⚠️ {lang === "bn" ? "অফলাইন কুরিয়ার ভেরিফিকেশন" : "Manual Courier Audit Requirements"}
                  </span>
                  <p className="text-amber-900 dark:text-amber-200 leading-relaxed text-[11px]">
                    {t("manualCourierWarning")}
                  </p>
                </div>

                {courierName === "Other" && (
                  <div>
                    <label htmlFor="custom-courier-name">Courier / Agency Name *</label>
                    <input
                      id="custom-courier-name"
                      required
                      value={customCourierName}
                      onChange={(e) => setCustomCourierName(e.target.value)}
                      placeholder="e.g. Janani Express / Karatoa Courier"
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="courier-phone-input">
                    {lang === "bn" ? "কুরিয়ার যোগাযোগের মোবাইল নম্বর *" : "Courier Contact Phone Number *"}
                  </label>
                  <input
                    id="courier-phone-input"
                    required
                    value={courierPhone}
                    onChange={(e) => setCourierPhone(e.target.value)}
                    placeholder="e.g. 017XXXXXXXX"
                    className="font-mono text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="consignment-slip-file">
                    {lang === "bn" ? "কনসাইনমেন্ট রসিদের ছবি (বাধ্যতামূলক) *" : "Consignment Slip Photo (Required) *"}
                  </label>
                  <input
                    id="consignment-slip-file"
                    type="file"
                    required
                    accept="image/*"
                    onChange={(e) => setConsignmentSlip(e.target.files?.[0] || null)}
                    className="text-xs"
                  />
                  <span className="text-[11px] text-neutral-500 mt-1 block">
                    {lang === "bn"
                      ? "কুরিয়ারের আসল বুকিং রসিদের ছবি আপলোড করুন।"
                      : "Upload physical booking receipt slip. Required for admin safety audit."}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => {
                  setShowShipModal(false);
                  setTrackingId("");
                  setDetectionResult(null);
                  setManualCourierMode(false);
                }}
                className="btn-ghost w-1/3"
              >
                {t("cancel")}
              </button>
              <button type="submit" disabled={submitting || trackingId.trim().length < 3} className="btn w-2/3">
                {submitting
                  ? t("saving")
                  : detectionResult?.detectedCourier && !manualCourierMode
                  ? `${t("confirmCourier")} (${detectionResult.detectedCourier}) →`
                  : t("confirmShipment")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Buyer Confirm Receipt with Optional Unboxing Proof */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form onSubmit={handleConfirmReceipt} className="box w-full max-w-md p-6 border-2 border-emerald-600 space-y-4 bg-white dark:bg-black">
            <div className="flex justify-between items-center border-b border-neutral-200 dark:border-neutral-800 pb-2">
              <h3 className="font-bold text-base text-emerald-600">{t("confirmReceipt")}</h3>
              <button type="button" onClick={() => setShowConfirmModal(false)} className="text-neutral-500">✕</button>
            </div>

            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              {t("confirmReleaseWarning")}
            </p>

            <div>
              <label htmlFor="unboxing-photo-input">Upload Unboxing Photo / Receipt Proof (Optional)</label>
              <input
                id="unboxing-photo-input"
                type="file"
                accept="image/*"
                onChange={(e) => setUnboxingPhoto(e.target.files?.[0] || null)}
                className="text-xs"
              />
              <span className="text-[11px] text-neutral-500 mt-1 block">
                Uploading unboxing proof adds extra security record to your transaction.
              </span>
            </div>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowConfirmModal(false)} className="btn-ghost w-1/3">{t("cancel")}</button>
              <button type="submit" disabled={submitting} className="btn-success w-2/3">
                {submitting ? t("processing") : "Confirm & Release Money"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Report Problem / Dispute */}
      {showDisputeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form onSubmit={handleDispute} className="box w-full max-w-lg p-6 border-2 border-red-600 space-y-4 bg-white dark:bg-black max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-neutral-200 dark:border-neutral-800 pb-2">
              <h3 className="font-bold text-base text-red-600">{t("reportProblem")}</h3>
              <button type="button" onClick={() => setShowDisputeModal(false)} className="text-neutral-500">✕</button>
            </div>
            <div>
              <label htmlFor="dispute-reason-input">{t("reason")}</label>
              <textarea
                id="dispute-reason-input"
                required
                rows={3}
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="e.g. Screen is cracked and box was opened, or received wrong size"
              />
            </div>
            <div>
              <label htmlFor="dispute-photo-input">{t("photo")}</label>
              <input
                id="dispute-photo-input"
                type="file"
                accept="image/*"
                onChange={(e) => setDisputePhoto(e.target.files?.[0] || null)}
                className="text-xs"
              />
              <span className="text-xs text-neutral-500 mt-1 block">
                {t("why3Text")}
              </span>
            </div>
            <div>
              <label htmlFor="dispute-evidence-input">{t("evidenceText")}</label>
              <input
                id="dispute-evidence-input"
                value={disputeEvidence}
                onChange={(e) => setDisputeEvidence(e.target.value)}
                placeholder="Any courier receipt or serial number"
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowDisputeModal(false)} className="btn-ghost w-1/3">{t("cancel")}</button>
              <button type="submit" disabled={submitting} className="btn-danger w-2/3">
                {submitting ? t("processing") : t("submit")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Ship Return */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form onSubmit={handleShipReturn} className="box w-full max-w-md p-6 border-2 border-accent space-y-4 bg-white dark:bg-black">
            <div className="flex justify-between items-center border-b border-neutral-200 dark:border-neutral-800 pb-2">
              <h3 className="font-bold text-base">{t("shipReturn")}</h3>
              <button type="button" onClick={() => setShowReturnModal(false)} className="text-neutral-500">✕</button>
            </div>
            <div>
              <label htmlFor="return-courier-select">Return Courier</label>
              <select
                id="return-courier-select"
                value={returnCourierName}
                onChange={(e) => setReturnCourierName(e.target.value)}
              >
                <option value="Pathao">Pathao Courier</option>
                <option value="Steadfast">Steadfast Courier</option>
                <option value="RedX">RedX Logistics</option>
                <option value="Paperfly">Paperfly</option>
                <option value="Other">Other Local Courier</option>
              </select>
            </div>
            <div>
              <label htmlFor="return-tracking-input">{t("returnTrackingId")}</label>
              <input
                id="return-tracking-input"
                required
                value={returnTrackingId}
                onChange={(e) => setReturnTrackingId(e.target.value)}
                placeholder="e.g. PT-448821"
                className="font-mono text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowReturnModal(false)} className="btn-ghost w-1/3">{t("cancel")}</button>
              <button type="submit" disabled={submitting} className="btn w-2/3">
                {submitting ? t("saving") : t("confirmReturnShipment")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="box max-w-2xl w-full p-4 border-2 border-accent bg-white dark:bg-black space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="font-bold text-sm">Attachment Viewer</span>
              <button onClick={() => setPreviewImage(null)} className="btn-ghost text-xs py-1 px-2.5">
                ✕ Close
              </button>
            </div>
            <div className="flex items-center justify-center max-h-[75vh] overflow-hidden">
              <img src={previewImage} alt="Attachment" className="max-h-[70vh] object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
