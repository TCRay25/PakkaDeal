"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, post, Dispute, API } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSocket } from "@/lib/socket";

export default function AdminDisputesPage() {
  const { t, lang } = useI18n();
  const { on } = useSocket();

  const [activeTab, setActiveTab] = useState<"mismatches" | "standard">("mismatches");
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [mismatches, setMismatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [splitInputs, setSplitInputs] = useState<Record<string, { seller: number; buyer: number }>>({});
  const [acting, setActing] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api<Dispute[]>("/disputes").catch(() => []),
      api<any[]>("/admin/disputes/mismatches").catch(() => []),
    ])
      .then(([disp, mism]) => {
        setDisputes(disp || []);
        setMismatches(mism || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const unsubs = [
      on("admin:dispute_opened", () => loadData()),
      on("admin:dispute_decided", () => loadData()),
    ];
    return () => unsubs.forEach((u) => u());
  }, [on]);

  const handleDecision = async (id: number, decision: "upheld" | "rejected") => {
    const confirmMsg =
      lang === "bn"
        ? `আপনি কি নিশ্চিত যে এই বিরোধটি ${decision === "upheld" ? "অনুমোদন" : "খারিজ"} করতে চান?`
        : `Are you sure you want to mark this dispute as ${decision.toUpperCase()}?`;
    if (!confirm(confirmMsg)) return;
    setActing(String(id));
    try {
      await post(`/disputes/${id}/decide`, {
        decision,
        admin_notes: adminNotes[String(id)] || "",
      });
      loadData();
    } catch (x: any) {
      alert(x.message || "Failed to submit decision");
    } finally {
      setActing(null);
    }
  };

  const handleMismatchResolve = async (
    code: string,
    decision: "uphold" | "reject" | "split"
  ) => {
    const confirmMsg =
      lang === "bn"
        ? `আপনি কি নিশ্চিত যে এই ক্লেইমটি ${decision.toUpperCase()} করতে চান?`
        : `Are you sure you want to resolve this claim as ${decision.toUpperCase()}?`;
    if (!confirm(confirmMsg)) return;

    setActing(code);
    try {
      const body: any = {
        decision,
        notes: adminNotes[code] || "",
      };
      if (decision === "split") {
        const splitVal = splitInputs[code] || { seller: 0, buyer: 0 };
        body.seller_amount = splitVal.seller;
        body.buyer_amount = splitVal.buyer;
      }
      await post(`/admin/deals/${code}/resolve-mismatch`, body);
      loadData();
    } catch (x: any) {
      alert(x.message || "Failed to resolve mismatch");
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("disputesQueue")}</h1>
        <p className="text-sm text-neutral-500">
          {lang === "bn"
            ? "আনবক্সিং প্রমাণ, পার্সেল লেবেল এবং এআই সহায়তা নিয়ে উভয় পক্ষের দাবি নিরপেক্ষভাবে নিষ্পত্তি করুন।"
            : "Review counterparty claims, inspect side-by-side physical evidence, and execute final settlements."}
        </p>

        {/* Tab switcher */}
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={() => setActiveTab("mismatches")}
            className={`px-4 py-2 text-xs font-bold border transition ${
              activeTab === "mismatches"
                ? "border-accent bg-accent text-white"
                : "border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-700 dark:text-neutral-300"
            }`}
          >
            🛡️ {lang === "bn" ? "ভুল বা অমিল পণ্যের ক্লেইম (এআই ও ৪-পক্ষীয় প্রমাণ)" : "Item Mismatch Claims (AI & Evidence)"}
            {mismatches.filter((m) => m.mismatch_status === "admin_review" || m.mismatch_status === "pending_seller_response").length > 0 && (
              <span className="ml-2 bg-rose-600 text-white text-[10px] px-1.5 py-0.2 rounded-full">
                {mismatches.filter((m) => m.mismatch_status === "admin_review" || m.mismatch_status === "pending_seller_response").length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("standard")}
            className={`px-4 py-2 text-xs font-bold border transition ${
              activeTab === "standard"
                ? "border-accent bg-accent text-white"
                : "border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-700 dark:text-neutral-300"
            }`}
          >
            📋 {lang === "bn" ? "স্ট্যান্ডার্ড বিরোধ তালিকা" : "Standard Disputes"}
            {disputes.filter((d) => d.status === "open").length > 0 && (
              <span className="ml-2 bg-purple-600 text-white text-[10px] px-1.5 py-0.2 rounded-full">
                {disputes.filter((d) => d.status === "open").length}
              </span>
            )}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      ) : activeTab === "mismatches" ? (
        /* ========================================================================= */
        /* TAB 1: ITEM MISMATCH CLAIMS WITH 4-WAY SIDE-BY-SIDE EVIDENCE             */
        /* ========================================================================= */
        mismatches.length === 0 ? (
          <div className="box p-8 text-center text-sm text-neutral-500">
            {lang === "bn"
              ? "কোনো অমিল বা ভুল পণ্যের ক্লেইম অপেক্ষমাণ নেই।"
              : "No delivered item mismatch claims pending in the queue."}
          </div>
        ) : (
          <div className="space-y-8">
            {mismatches.map((m) => {
              const evidence = m.evidence || [];
              const listingPhotos = evidence.filter((e: any) => e.kind === "listing");
              const preDispatch = evidence.find((e: any) => e.kind === "pre_dispatch");
              const parcelLabel = evidence.find((e: any) => e.kind === "parcel_label");
              const unboxingItem = evidence.find((e: any) => e.kind === "unboxing_item");
              const rebuttalPhoto = evidence.find((e: any) => e.kind === "seller_rebuttal");

              const decRecord = m.decision_record || {};
              const ai = decRecord.ai_result || {};
              const isActionable =
                m.mismatch_status === "admin_review" ||
                m.mismatch_status === "pending_seller_response";

              return (
                <div
                  key={m.id}
                  className={`box p-6 border-2 space-y-6 ${
                    isActionable
                      ? "border-accent bg-accent/5"
                      : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black opacity-90"
                  }`}
                >
                  {/* Top Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 pb-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs uppercase font-bold text-neutral-500">
                          {lang === "bn" ? "ডিল #" : "Deal #"}
                        </span>
                        <Link
                          href={`/deal/${m.code}`}
                          className="font-mono text-sm font-bold text-accent hover:underline"
                        >
                          {m.code}
                        </Link>
                        <span className="text-[11px] font-mono px-2 py-0.5 border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 uppercase font-semibold">
                          {m.payment_mode}
                        </span>
                      </div>
                      <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                        {m.product}
                      </h2>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right text-xs">
                        <span className="text-neutral-500 block">
                          {lang === "bn" ? "ডিপোজিট:" : "Deposit:"}{" "}
                          <strong className="font-mono font-bold text-neutral-800 dark:text-neutral-200">
                            {Number(m.held_amount || m.total_amount).toLocaleString()} BDT
                          </strong>
                        </span>
                        {m.payment_mode === "delivery_only" && (
                          <span className="text-neutral-500 block">
                            COD:{" "}
                            <strong className="font-mono text-neutral-800 dark:text-neutral-200">
                              {Number(m.cod_amount || m.price).toLocaleString()} BDT
                            </strong>
                          </span>
                        )}
                      </div>

                      <span
                        className={`text-xs uppercase font-bold px-2.5 py-1 border ${
                          m.mismatch_status === "upheld"
                            ? "border-emerald-600 bg-emerald-500/10 text-emerald-600"
                            : m.mismatch_status === "rejected"
                            ? "border-rose-600 bg-rose-500/10 text-rose-600"
                            : m.mismatch_status === "admin_review"
                            ? "border-amber-600 bg-amber-500/10 text-amber-600"
                            : "border-purple-600 bg-purple-500/10 text-purple-600"
                        }`}
                      >
                        {m.mismatch_status.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>

                  {/* Parties & Stated Reason */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs p-3 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                    <div>
                      <span className="text-neutral-500 uppercase block font-semibold">{t("buyer")}</span>
                      <span className="font-bold text-neutral-900 dark:text-neutral-100">{m.buyer_name}</span>
                      <span className="font-mono text-neutral-500 block">{m.buyer_phone}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 uppercase block font-semibold">{t("seller")}</span>
                      <span className="font-bold text-neutral-900 dark:text-neutral-100">{m.page_name || m.seller_name}</span>
                      <span className="font-mono text-neutral-500 block">{m.seller_phone}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 uppercase block font-semibold">
                        {lang === "bn" ? "ক্রেতার দাবির কারণ:" : "Buyer Claim Reason:"}
                      </span>
                      <span className="text-neutral-800 dark:text-neutral-200 font-medium">
                        &quot;{m.claim_reason || "Item does not match listing"}&quot;
                      </span>
                    </div>
                  </div>

                  {/* 4-WAY SIDE-BY-SIDE PHYSICAL EVIDENCE GRID */}
                  <div className="space-y-2">
                    <span className="text-xs uppercase font-bold tracking-wider text-neutral-500 block">
                      {lang === "bn" ? "চার-পক্ষীয় প্রমাণ পর্যালোচনা (Side-by-Side Evidence):" : "4-Way Side-by-Side Physical Evidence:"}
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {/* Column 1: Listing Photos */}
                      <div className="border border-neutral-200 dark:border-neutral-800 p-2.5 bg-white dark:bg-black space-y-2">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-600 dark:text-neutral-400 block border-b border-neutral-200 dark:border-neutral-800 pb-1">
                          1. {lang === "bn" ? "লিস্টিং ছবি (বিক্রেতা)" : "Listing Photos (Seller)"}
                        </span>
                        {listingPhotos.length > 0 ? (
                          <div className="space-y-1.5">
                            {listingPhotos.map((lp: any) => (
                              <img
                                key={lp.id}
                                src={`${API}/deals/${m.code}/evidence/${lp.id}`}
                                alt="Listing evidence"
                                className="w-full h-36 object-contain bg-neutral-50 dark:bg-neutral-900 border cursor-pointer hover:opacity-90 transition"
                                onClick={() => setPreviewImage(`${API}/deals/${m.code}/evidence/${lp.id}`)}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="h-36 flex items-center justify-center text-xs text-neutral-400 italic border border-dashed">
                            {lang === "bn" ? "ছবি নেই" : "No photo"}
                          </div>
                        )}
                      </div>

                      {/* Column 2: Pre-Dispatch Photo */}
                      <div className="border border-neutral-200 dark:border-neutral-800 p-2.5 bg-white dark:bg-black space-y-2">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-600 dark:text-neutral-400 block border-b border-neutral-200 dark:border-neutral-800 pb-1">
                          2. {lang === "bn" ? "প্রি-ডিসপ্যাচ প্যাকিং (বিক্রেতা)" : "Pre-Dispatch (Seller)"}
                        </span>
                        {preDispatch ? (
                          <img
                            src={`${API}/deals/${m.code}/evidence/${preDispatch.id}`}
                            alt="Pre-dispatch packaging"
                            className="w-full h-36 object-contain bg-neutral-50 dark:bg-neutral-900 border cursor-pointer hover:opacity-90 transition"
                            onClick={() => setPreviewImage(`${API}/deals/${m.code}/evidence/${preDispatch.id}`)}
                          />
                        ) : (
                          <div className="h-36 flex items-center justify-center text-xs text-neutral-400 italic border border-dashed">
                            {lang === "bn" ? "ছবি আপলোড হয়নি" : "Not uploaded"}
                          </div>
                        )}
                      </div>

                      {/* Column 3: Buyer Parcel Label */}
                      <div className="border border-neutral-200 dark:border-neutral-800 p-2.5 bg-white dark:bg-black space-y-2">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-600 dark:text-neutral-400 block border-b border-neutral-200 dark:border-neutral-800 pb-1">
                          3. {lang === "bn" ? "পার্সেল লেবেল (বায়ার)" : "Parcel Label (Buyer)"}
                        </span>
                        {parcelLabel ? (
                          <img
                            src={`${API}/deals/${m.code}/evidence/${parcelLabel.id}`}
                            alt="Parcel label"
                            className="w-full h-36 object-contain bg-neutral-50 dark:bg-neutral-900 border cursor-pointer hover:opacity-90 transition"
                            onClick={() => setPreviewImage(`${API}/deals/${m.code}/evidence/${parcelLabel.id}`)}
                          />
                        ) : (
                          <div className="h-36 flex items-center justify-center text-xs text-neutral-400 italic border border-dashed">
                            {lang === "bn" ? "লেবেল নেই" : "No label"}
                          </div>
                        )}
                      </div>

                      {/* Column 4: Buyer Unboxing Item */}
                      <div className="border border-neutral-200 dark:border-neutral-800 p-2.5 bg-white dark:bg-black space-y-2">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-accent block border-b border-neutral-200 dark:border-neutral-800 pb-1">
                          4. {lang === "bn" ? "আনবক্সিং পণ্য (বায়ার)" : "Unboxing Item (Buyer)"}
                        </span>
                        {unboxingItem ? (
                          <img
                            src={`${API}/deals/${m.code}/evidence/${unboxingItem.id}`}
                            alt="Unboxing item"
                            className="w-full h-36 object-contain bg-neutral-50 dark:bg-neutral-900 border cursor-pointer hover:opacity-90 transition"
                            onClick={() => setPreviewImage(`${API}/deals/${m.code}/evidence/${unboxingItem.id}`)}
                          />
                        ) : (
                          <div className="h-36 flex items-center justify-center text-xs text-neutral-400 italic border border-dashed">
                            {lang === "bn" ? "ছবি নেই" : "No photo"}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* AI Multimodal Verification & Rule Recommendation */}
                  <div className="box p-4 border border-purple-300 dark:border-purple-800 bg-purple-500/5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-200 dark:border-purple-900/50 pb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                        🤖 {lang === "bn" ? "জেমিনাই এআই ফিজিক্যাল ভেরিফিকেশন" : "Gemini AI Physical Comparison"}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-neutral-700 dark:text-neutral-300">
                          Match: <strong className="uppercase">{ai.match || "uncertain"}</strong> ({ai.confidence || 0}%)
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 border border-purple-400/40 bg-purple-500/10 font-bold uppercase text-purple-700 dark:text-purple-300">
                          {decRecord.rule || "RULE_AI_EVALUATION"}
                        </span>
                      </div>
                    </div>

                    {decRecord.explanation && (
                      <p className="text-xs text-neutral-700 dark:text-neutral-300">
                        {decRecord.explanation}
                      </p>
                    )}

                    {Array.isArray(ai.differences) && ai.differences.length > 0 && (
                      <div className="text-xs space-y-1">
                        <span className="font-semibold text-neutral-800 dark:text-neutral-200 block">
                          {lang === "bn" ? "পরিলক্ষিত অমিলসমূহ (Differences):" : "Observed Physical Differences:"}
                        </span>
                        <ul className="list-disc pl-5 space-y-0.5 text-neutral-600 dark:text-neutral-400">
                          {ai.differences.map((diff: string, dIdx: number) => (
                            <li key={dIdx}>{diff}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Seller Rebuttal if present */}
                  {rebuttalPhoto && (
                    <div className="p-3 border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900 text-xs space-y-2">
                      <span className="font-bold text-neutral-800 dark:text-neutral-200 uppercase block">
                        {lang === "bn" ? "বিক্রেতার পাল্টা প্রমাণ (Rebuttal Photo):" : "Seller Rebuttal Evidence Photo:"}
                      </span>
                      <img
                        src={`${API}/deals/${m.code}/evidence/${rebuttalPhoto.id}`}
                        alt="Seller rebuttal"
                        className="w-48 h-32 object-contain bg-white dark:bg-black border cursor-pointer"
                        onClick={() => setPreviewImage(`${API}/deals/${m.code}/evidence/${rebuttalPhoto.id}`)}
                      />
                    </div>
                  )}

                  {/* Admin Decision Action Bar */}
                  {isActionable ? (
                    <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
                      <div>
                        <label htmlFor={`admin-mismatch-note-${m.code}`} className="text-xs font-semibold">
                          {t("adminNotes")}
                        </label>
                        <input
                          id={`admin-mismatch-note-${m.code}`}
                          placeholder={
                            lang === "bn"
                              ? "যেমন: এআই প্রমাণ সঠিক। বায়ারকে রিফান্ড ও সেলারকে দায়বদ্ধ করা হলো।"
                              : "e.g. Physical mismatch verified against pre-dispatch photo. Refund buyer."
                          }
                          value={adminNotes[m.code] || ""}
                          onChange={(e) =>
                            setAdminNotes({ ...adminNotes, [m.code]: e.target.value })
                          }
                          className="w-full text-xs py-2 px-3 border border-neutral-300 dark:border-neutral-700"
                        />
                      </div>

                      {/* Split inputs if admin chooses split */}
                      <div className="p-3 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="text-[11px] font-semibold block mb-1">
                            {lang === "bn" ? "সেলারকে পরিশোধ (BDT):" : "Seller Split Payout (BDT):"}
                          </label>
                          <input
                            type="number"
                            min={0}
                            placeholder="0"
                            value={splitInputs[m.code]?.seller || ""}
                            onChange={(e) =>
                              setSplitInputs({
                                ...splitInputs,
                                [m.code]: {
                                  seller: Number(e.target.value) || 0,
                                  buyer: splitInputs[m.code]?.buyer || 0,
                                },
                              })
                            }
                            className="font-mono text-xs py-1.5 px-2 border"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold block mb-1">
                            {lang === "bn" ? "বায়ারকে রিফান্ড (BDT):" : "Buyer Split Refund (BDT):"}
                          </label>
                          <input
                            type="number"
                            min={0}
                            placeholder="0"
                            value={splitInputs[m.code]?.buyer || ""}
                            onChange={(e) =>
                              setSplitInputs({
                                ...splitInputs,
                                [m.code]: {
                                  seller: splitInputs[m.code]?.seller || 0,
                                  buyer: Number(e.target.value) || 0,
                                },
                              })
                            }
                            className="font-mono text-xs py-1.5 px-2 border"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => handleMismatchResolve(m.code, "uphold")}
                          disabled={acting === m.code}
                          className="btn-success text-xs py-2.5 px-4 font-bold"
                        >
                          ✓ {t("upholdClaim")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMismatchResolve(m.code, "reject")}
                          disabled={acting === m.code}
                          className="btn-danger text-xs py-2.5 px-4 font-bold"
                        >
                          ✕ {t("rejectClaim")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMismatchResolve(m.code, "split")}
                          disabled={acting === m.code}
                          className="btn-ghost text-xs py-2.5 px-4 font-bold border"
                        >
                          ⚖️ {t("splitResolution")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500">
                      <strong>{lang === "bn" ? "নিষ্পত্তি:" : "Resolution:"}</strong>{" "}
                      {decRecord.admin_notes ||
                        (lang === "bn"
                          ? "সিদ্ধান্ত সম্পন্ন এবং লেজারে লিপিবদ্ধ।"
                          : "Decision finalized and ledger reconciled.")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* ========================================================================= */
        /* TAB 2: STANDARD DISPUTES                                                 */
        /* ========================================================================= */
        disputes.length === 0 ? (
          <div className="box p-8 text-center text-sm text-neutral-500">
            {lang === "bn" ? "বিরোধ সারিতে কোনো অপেক্ষমাণ অভিযোগ নেই।" : "No standard disputes pending."}
          </div>
        ) : (
          <div className="space-y-6">
            {disputes.map((d) => (
              <div
                key={d.id}
                className={`box p-6 border-2 space-y-5 ${
                  d.status === "open"
                    ? "border-purple-600 bg-purple-500/5"
                    : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black opacity-85"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 pb-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase font-bold text-neutral-500">
                        {lang === "bn" ? "অভিযোগ #" : "Dispute #"}{d.id} {lang === "bn" ? "ডিল:" : "on Deal:"}
                      </span>
                      <Link
                        href={`/deal/${d.deal_code}`}
                        className="font-mono text-xs font-bold text-accent hover:underline"
                      >
                        {d.deal_code}
                      </Link>
                    </div>
                    <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                      {d.product}
                    </h2>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-sm">
                      {lang === "bn" ? "এসক্রো:" : "Escrow:"} {Number(d.total_amount).toLocaleString()} {lang === "bn" ? "টাকা" : "BDT"}
                    </span>
                    <span
                      className={`text-xs uppercase font-bold px-2 py-0.5 border ${
                        d.status === "open"
                          ? "border-purple-600 text-purple-600 bg-purple-500/10"
                          : d.status === "upheld"
                          ? "border-emerald-600 text-emerald-600"
                          : "border-rose-600 text-rose-600"
                      }`}
                    >
                      {d.status}
                    </span>
                  </div>
                </div>

                {/* Dispute details & decision */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  <div className="lg:col-span-7 space-y-3">
                    <div className="space-y-1">
                      <span className="text-xs uppercase font-bold text-neutral-500">
                        {lang === "bn" ? "কারণ:" : "Stated Reason:"}
                      </span>
                      <p className="text-sm text-neutral-900 dark:text-neutral-100 bg-white dark:bg-black p-3 border">
                        {d.reason}
                      </p>
                    </div>

                    <div className="box p-4 border border-purple-300 dark:border-purple-800 bg-white dark:bg-black space-y-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-accent block">
                        {lang === "bn" ? "এআই পরামর্শ" : "AI Recommendation"}
                      </span>
                      <p className="text-xs text-neutral-700 dark:text-neutral-300">
                        {d.ai_summary || "Visual analysis evaluated listing against submitted evidence."}
                      </p>
                      <div className="text-xs font-semibold text-purple-700 dark:text-purple-300">
                        Recommendation: <strong>{d.ai_recommendation.toUpperCase()}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-5 space-y-2">
                    <span className="text-xs uppercase font-bold text-neutral-500 block">
                      {lang === "bn" ? "প্রমাণ ছবি:" : "Photo Evidence:"}
                    </span>
                    {d.has_photo ? (
                      <img
                        src={`${API}/disputes/${d.id}/photo`}
                        alt="Dispute evidence"
                        className="w-full max-h-64 object-contain border cursor-pointer"
                        onClick={() => setPreviewImage(`${API}/disputes/${d.id}/photo`)}
                      />
                    ) : (
                      <div className="p-8 text-center border border-dashed text-xs text-neutral-500">
                        No photo attached
                      </div>
                    )}
                  </div>
                </div>

                {d.status === "open" ? (
                  <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
                    <input
                      placeholder="Admin notes..."
                      value={adminNotes[String(d.id)] || ""}
                      onChange={(e) =>
                        setAdminNotes({ ...adminNotes, [String(d.id)]: e.target.value })
                      }
                      className="w-full text-xs py-2 px-3 border"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleDecision(d.id, "upheld")}
                        disabled={acting === String(d.id)}
                        className="btn-success text-sm py-2 px-4"
                      >
                        {t("uphold")}
                      </button>
                      <button
                        onClick={() => handleDecision(d.id, "rejected")}
                        disabled={acting === String(d.id)}
                        className="btn-danger text-sm py-2 px-4"
                      >
                        {t("reject")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pt-3 border-t text-xs text-neutral-500">
                    Resolution: {d.admin_notes || "Finalized"}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setPreviewImage(null)}
        >
          <div className="max-w-4xl max-h-[90vh] bg-white dark:bg-black p-2 border relative">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-2 right-2 bg-black/60 text-white w-7 h-7 font-bold flex items-center justify-center"
            >
              ✕
            </button>
            <img src={previewImage} alt="Enlarged view" className="max-w-full max-h-[85vh] object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
