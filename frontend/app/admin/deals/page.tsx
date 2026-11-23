"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, post, Deal, API } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import { useI18n } from "@/lib/i18n";
import { useSocket } from "@/lib/socket";
import { translateDealType } from "@/lib/translateTimeline";

export default function AdminDealsPage() {
  const { t, lang } = useI18n();
  const { on } = useSocket();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [quickFilter, setQuickFilter] = useState<"all" | "held" | "countdown" | "manual" | "failed" | "stuck" | "disputed">("all");
  const [search, setSearch] = useState("");

  // Action Modal State
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [actionType, setActionType] = useState<"release" | "refund" | "split" | "audit" | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [splitSellerAmount, setSplitSellerAmount] = useState(0);
  const [splitBuyerAmount, setSplitBuyerAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [seedingMock, setSeedingMock] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const loadDeals = () => {
    setLoading(true);
    let url = "/admin/deals";
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (quickFilter !== "all") params.set("filter", quickFilter);
    if (search.trim()) params.set("q", search.trim());
    if (params.toString()) url += "?" + params.toString();

    api<Deal[]>(url)
      .then(setDeals)
      .catch(() => setDeals([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDeals();
  }, [statusFilter, typeFilter, quickFilter]);

  // Real-time admin synchronization via Socket.IO
  useEffect(() => {
    const unsub = on("admin:deal_updated", () => {
      loadDeals();
    });
    return unsub;
  }, [on]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadDeals();
  };

  const handleAdminAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDeal || !actionType) return;
    setSubmitting(true);
    try {
      if (actionType === "release") {
        await post(`/admin/deals/${activeDeal.code}/force-release`, { admin_notes: adminNotes });
      } else if (actionType === "refund") {
        await post(`/admin/deals/${activeDeal.code}/force-refund`, { admin_notes: adminNotes });
      } else if (actionType === "split") {
        await post(`/admin/deals/${activeDeal.code}/split-resolution`, {
          seller_amount: splitSellerAmount,
          buyer_amount: splitBuyerAmount,
          admin_notes: adminNotes,
        });
      }
      setActionType(null);
      setActiveDeal(null);
      setAdminNotes("");
      loadDeals();
    } catch (err: any) {
      alert(err.message || "Admin action failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAuditCourier = async (status: "approved" | "rejected") => {
    if (!activeDeal) return;
    setSubmitting(true);
    try {
      await post(`/admin/deals/${activeDeal.code}/audit-courier`, { status });
      setActionType(null);
      setActiveDeal(null);
      loadDeals();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSeedMockDeals = async () => {
    if (!confirm(lang === "bn" ? "অনলাইন ডাটাবেসে ৫০টি ভিন্ন ফেজের মক ডিল সিড করতে চান?" : "Seed 50 mock deals of different phases to database?")) return;
    setSeedingMock(true);
    try {
      await post("/admin/seed-mock-deals");
      loadDeals();
      alert(lang === "bn" ? "৫০টি মক ডিল সফলভাবে সিড করা হয়েছে!" : "50 mock deals successfully seeded!");
    } catch (e: any) {
      alert(e.message || "Failed to seed mock deals");
    } finally {
      setSeedingMock(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("allDeals")}</h1>
          <p className="text-sm text-neutral-500">
            {lang === "bn"
              ? "বাংলাদেশ জুড়ে সমস্ত প্ল্যাটফর্ম এসক্রো চুক্তির মাস্টার রেজিস্ট্রি।"
              : "Master registry of all platform escrow contracts across Bangladesh."}
          </p>
        </div>
        <button
          onClick={handleSeedMockDeals}
          disabled={seedingMock}
          className="px-3 py-1.5 text-xs font-bold border border-accent text-accent hover:bg-accent hover:text-white transition-colors"
        >
          {seedingMock ? (lang === "bn" ? "সিড হচ্ছে..." : "Seeding...") : (lang === "bn" ? "+ ৫০টি মক ডাটা সিড করুন" : "+ Seed 50 Mock Deals")}
        </button>
      </div>

      {/* Quick Filter Chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: "all", label: lang === "bn" ? "সব ডিল" : "All Contracts" },
          { id: "held", label: lang === "bn" ? "💰 এসক্রো হোল্ডকৃত অর্থ" : "💰 Escrow Held Funds" },
          { id: "countdown", label: lang === "bn" ? "⏱️ ২৪ ঘণ্টা কাউন্টডাউন সক্রিয়" : "⏱️ 24h Countdown Active" },
          { id: "manual", label: lang === "bn" ? "⚠️ ম্যানুয়াল কুরিয়ার অডিট" : "⚠️ Manual Courier Audits" },
          { id: "failed", label: lang === "bn" ? "❌ ট্র্যাকিং ব্যর্থতা" : "❌ Failed Tracking Lookups" },
          { id: "stuck", label: lang === "bn" ? "⏳ আটকে থাকা চালান (>৪৮ঘণ্টা)" : "⏳ Stuck Shipments (>48h)" },
          { id: "disputed", label: lang === "bn" ? "🚨 অমীমাংসিত বিরোধ" : "🚨 Open Disputes" },
        ].map((chip) => (
          <button
            key={chip.id}
            onClick={() => setQuickFilter(chip.id as any)}
            className={`px-3 py-1.5 text-xs font-semibold border rounded-none transition-colors ${
              quickFilter === chip.id
                ? "border-accent bg-accent text-white"
                : "border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 bg-transparent text-neutral-700 dark:text-neutral-300"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs py-1.5 px-3 border border-neutral-300 dark:border-neutral-700 bg-transparent w-auto"
          >
            <option value="all">{lang === "bn" ? "সকল স্ট্যাটাস" : "All Statuses"}</option>
            <option value="created">{lang === "bn" ? "ডিল তৈরি" : "Created"}</option>
            <option value="payment_pending">{lang === "bn" ? "পেমেন্ট অপেক্ষমাণ" : "Payment Pending"}</option>
            <option value="held">{lang === "bn" ? "হোল্ডকৃত" : "Held"}</option>
            <option value="shipped">{lang === "bn" ? "শিপড" : "Shipped"}</option>
            <option value="in_transit">{lang === "bn" ? "ইন-ট্রানজিট" : "In Transit"}</option>
            <option value="delivered">{lang === "bn" ? "ডেলিভারি সম্পন্ন" : "Delivered"}</option>
            <option value="disputed">{lang === "bn" ? "বিরোধপূর্ণ" : "Disputed"}</option>
            <option value="released">{lang === "bn" ? "রিলিজ সম্পন্ন" : "Released"}</option>
            <option value="refunded">{lang === "bn" ? "রিফান্ড সম্পন্ন" : "Refunded"}</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-xs py-1.5 px-3 border border-neutral-300 dark:border-neutral-700 bg-transparent w-auto"
          >
            <option value="all">{lang === "bn" ? "সকল ধরন" : "All Types"}</option>
            <option value="product">{lang === "bn" ? "পণ্য" : "Product"}</option>
            <option value="rental">{lang === "bn" ? "বাড়িভাড়া" : "Rental"}</option>
            <option value="service">{lang === "bn" ? "সার্ভিস" : "Service"}</option>
          </select>
        </div>

        <form onSubmit={handleSearch} className="flex gap-1">
          <input
            type="text"
            placeholder={lang === "bn" ? "কোড, মোবাইল, পণ্য দিয়ে খুঁজুন..." : "Search code, phone, product..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-60 text-xs py-1 px-2 border border-neutral-300 dark:border-neutral-700"
          />
          <button type="submit" className="btn text-xs py-1 px-3">
            {lang === "bn" ? "অনুসন্ধান" : "Search"}
          </button>
        </form>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      ) : deals.length === 0 ? (
        <div className="box p-8 text-center text-sm text-neutral-500">
          {lang === "bn" ? "কোনো ডিল খুঁজে পাওয়া যায়নি।" : "No deals match current criteria."}
        </div>
      ) : (
        <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 text-xs uppercase font-semibold text-neutral-500">
              <tr>
                <th className="px-4 py-3">{lang === "bn" ? "কোড / পণ্য" : "Code / Product"}</th>
                <th className="px-4 py-3">{lang === "bn" ? "ধরন" : "Type"}</th>
                <th className="px-4 py-3">{lang === "bn" ? "বিক্রেতা" : "Seller"}</th>
                <th className="px-4 py-3">{lang === "bn" ? "বায়ার ফোন" : "Buyer Phone"}</th>
                <th className="px-4 py-3">{lang === "bn" ? "এসক্রো জমা" : "Escrow Deposit"}</th>
                <th className="px-4 py-3">{lang === "bn" ? "কুরিয়ার" : "Courier"}</th>
                <th className="px-4 py-3">{lang === "bn" ? "স্ট্যাটাস" : "Status"}</th>
                <th className="px-4 py-3 text-right">{lang === "bn" ? "অ্যাডমিন অ্যাকশন" : "Admin Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-xs">
              {deals.map((d) => (
                <tr key={d.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-900/50">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-neutral-900 dark:text-neutral-100">{d.product}</div>
                    <div className="font-mono text-neutral-500">{d.code}</div>
                  </td>
                  <td className="px-4 py-3 uppercase">{translateDealType(d.deal_type, lang)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{d.page_name || d.seller_name || (lang === "bn" ? "বিক্রেতা" : "Seller")}</div>
                    <div className="text-neutral-500 font-mono">ID #{d.seller_id}</div>
                  </td>
                  <td className="px-4 py-3 font-mono">{d.buyer_phone}</td>
                  <td className="px-4 py-3 font-mono font-bold">{d.total_amount.toLocaleString()} {lang === "bn" ? "টাকা" : "BDT"}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-xs flex items-center gap-1.5">
                      {d.courier_name}
                      {d.detection_confidence ? (
                        <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                          ({d.detection_confidence}%)
                        </span>
                      ) : null}
                    </div>
                    {d.is_manual_courier ? (
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-amber-600 font-bold font-mono block">
                          {lang === "bn" ? "ম্যানুয়াল" : "MANUAL"} ({d.manual_audit_status === "approved" ? (lang === "bn" ? "অনুমোদিত" : "approved") : d.manual_audit_status === "rejected" ? (lang === "bn" ? "প্রত্যাখ্যাত" : "rejected") : (lang === "bn" ? "অপেক্ষমাণ" : "pending")})
                        </span>
                        {d.has_consignment_slip && (
                          <button
                            type="button"
                            onClick={() => setPreviewImage(`${API}/deals/${d.code}/consignment-slip`)}
                            className="text-[10px] text-accent underline hover:text-black dark:hover:text-white"
                          >
                            {lang === "bn" ? "রসিদ দেখুন 📄" : "View Slip 📄"}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-neutral-500 font-mono block">
                          {d.tracking_id}
                        </span>
                        {d.current_location && (
                          <span className="text-[10px] text-neutral-400 block truncate max-w-[140px]">
                            📍 {d.current_location}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <button
                      onClick={() => {
                        setActiveDeal(d);
                        setActionType("release");
                        setSplitSellerAmount(d.seller_payout || d.total_amount - d.fee_amount);
                        setSplitBuyerAmount(0);
                      }}
                      className="btn-ghost text-xs py-1 px-2 border border-neutral-300 dark:border-neutral-700"
                    >
                      {lang === "bn" ? "অ্যাডমিন" : "Admin"}
                    </button>
                    <Link href={`/deal/${d.code}`} className="btn-ghost text-xs py-1 px-2">
                      {lang === "bn" ? "ডিল দেখুন" : "View"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Admin Quick Action Modal */}
      {activeDeal && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <form onSubmit={handleAdminAction} className="box w-full max-w-lg p-6 border-2 border-accent space-y-4 bg-white dark:bg-black max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-2">
              <div>
                <h3 className="font-bold text-base">
                  {lang === "bn" ? "প্রশাসনিক ওভাররাইড: #" : "Administrative Override: #"}{activeDeal.code}
                </h3>
                <span className="text-xs text-neutral-500">
                  {activeDeal.product} ({activeDeal.total_amount.toLocaleString()} {lang === "bn" ? "টাকা" : "BDT"})
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveDeal(null);
                  setActionType(null);
                }}
                className="text-neutral-500"
              >
                ✕
              </button>
            </div>

            {/* Action Type Selector */}
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setActionType("release")}
                className={`py-1.5 text-xs font-bold border ${
                  actionType === "release" ? "border-emerald-600 bg-emerald-600 text-white" : "border-neutral-300"
                }`}
              >
                {lang === "bn" ? "বাধ্যতামূলক রিলিজ" : "Force Release"}
              </button>
              <button
                type="button"
                onClick={() => setActionType("refund")}
                className={`py-1.5 text-xs font-bold border ${
                  actionType === "refund" ? "border-rose-600 bg-rose-600 text-white" : "border-neutral-300"
                }`}
              >
                {lang === "bn" ? "বাধ্যতামূলক রিফান্ড" : "Force Refund"}
              </button>
              <button
                type="button"
                onClick={() => setActionType("split")}
                className={`py-1.5 text-xs font-bold border ${
                  actionType === "split" ? "border-purple-600 bg-purple-600 text-white" : "border-neutral-300"
                }`}
              >
                {lang === "bn" ? "আংশিক ভাগ" : "Split Payout"}
              </button>
              <button
                type="button"
                onClick={() => setActionType("audit")}
                className={`py-1.5 text-xs font-bold border ${
                  actionType === "audit" ? "border-amber-600 bg-amber-600 text-white" : "border-neutral-300"
                }`}
              >
                {lang === "bn" ? "স্লিপ অডিট" : "Audit Slip"}
              </button>
            </div>

            {actionType === "split" && (
              <div className="p-3 border border-purple-500/30 bg-purple-500/5 space-y-3">
                <span className="text-xs font-bold uppercase text-purple-700 dark:text-purple-300 block">
                  {lang === "bn"
                    ? `মীমাংসিত তহবিল বণ্টন (মোট: ${activeDeal.total_amount.toLocaleString()} টাকা)`
                    : `Arbitrated Fund Distribution (Total: ${activeDeal.total_amount.toLocaleString()} BDT)`}
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label>{lang === "bn" ? "বিক্রেতার অংশ (টাকা)" : "Seller Share (BDT)"}</label>
                    <input
                      type="number"
                      value={splitSellerAmount}
                      onChange={(e) => setSplitSellerAmount(Number(e.target.value))}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label>{lang === "bn" ? "বায়ার রিফান্ড (টাকা)" : "Buyer Refund (BDT)"}</label>
                    <input
                      type="number"
                      value={splitBuyerAmount}
                      onChange={(e) => setSplitBuyerAmount(Number(e.target.value))}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {actionType === "audit" && (
              <div className="p-3 border border-amber-500/30 bg-amber-500/5 space-y-3">
                <span className="text-xs font-bold uppercase text-amber-700 dark:text-amber-300 block">
                  {lang === "bn" ? "ম্যানুয়াল কুরিয়ার চালান রসিদ পর্যালোচনা" : "Manual Courier Consignment Slip Review"}
                </span>
                <div className="text-xs space-y-1">
                  <div>{lang === "bn" ? "কুরিয়ার:" : "Courier:"} <strong>{activeDeal.courier_name}</strong></div>
                  <div>{lang === "bn" ? "কুরিয়ার ফোন নম্বর:" : "Courier Contact Phone:"} <strong>{activeDeal.courier_phone || "N/A"}</strong></div>
                  <div>{lang === "bn" ? "অডিট স্ট্যাটাস:" : "Audit Status:"} <strong>{activeDeal.manual_audit_status}</strong></div>
                </div>
                {activeDeal.has_consignment_slip && (
                  <button
                    type="button"
                    onClick={() => setPreviewImage(`${API}/deals/${activeDeal.code}/consignment-slip`)}
                    className="btn text-xs py-1 px-3"
                  >
                    {lang === "bn" ? "চালান রসিদের ছবি দেখুন 🔍" : "Open Consignment Slip Image 🔍"}
                  </button>
                )}
                <div className="flex gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => handleAuditCourier("approved")}
                    disabled={submitting}
                    className="btn-success text-xs flex-1"
                  >
                    {lang === "bn" ? "✓ রসিদ অনুমোদন" : "✓ Approve Slip"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAuditCourier("rejected")}
                    disabled={submitting}
                    className="btn-danger text-xs flex-1"
                  >
                    {lang === "bn" ? "✕ রসিদ প্রত্যাখ্যান" : "✕ Reject Slip"}
                  </button>
                </div>
              </div>
            )}

            {actionType !== "audit" && (
              <div>
                <label>
                  {lang === "bn" ? "প্রশাসনিক সিদ্ধান্ত / অডিটের কারণ *" : "Administrative Justification / Audit Reason *"}
                </label>
                <textarea
                  required
                  rows={3}
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder={
                    lang === "bn"
                      ? "স্থায়ী লেজারে লিপিবদ্ধ করার জন্য বাধ্যতামূলক কারণ লিখুন"
                      : "Mandatory audit log justification recorded in permanent ledger"
                  }
                />
              </div>
            )}

            {actionType !== "audit" && (
              <div className="flex gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setActiveDeal(null);
                    setActionType(null);
                  }}
                  className="btn-ghost w-1/3"
                >
                  {lang === "bn" ? "বাতিল" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`btn w-2/3 ${
                    actionType === "release"
                      ? "btn-success"
                      : actionType === "refund"
                      ? "btn-danger"
                      : "btn"
                  }`}
                >
                  {submitting
                    ? (lang === "bn" ? "প্রক্রিয়াধীন..." : "Executing...")
                    : lang === "bn"
                    ? "নিশ্চিত করুন"
                    : `Execute ${actionType.toUpperCase()}`}
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="box max-w-2xl w-full p-4 border-2 border-accent bg-white dark:bg-black space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="font-bold text-sm">
                {lang === "bn" ? "সংযুক্তি প্রদর্শক" : "Attachment Viewer"}
              </span>
              <button onClick={() => setPreviewImage(null)} className="btn-ghost text-xs py-1 px-2.5">
                {lang === "bn" ? "✕ বন্ধ করুন" : "✕ Close"}
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
