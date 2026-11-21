"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, post, Dispute, API } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSocket } from "@/lib/socket";

export default function AdminDisputesPage() {
  const { t } = useI18n();
  const { on } = useSocket();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminNotes, setAdminNotes] = useState<Record<number, string>>({});
  const [acting, setActing] = useState<number | null>(null);

  const loadDisputes = () => {
    setLoading(true);
    api<Dispute[]>("/disputes")
      .then(setDisputes)
      .catch(() => setDisputes([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDisputes();
  }, []);

  // Real-time dispute queue synchronization via Socket.IO
  useEffect(() => {
    const unsubs = [
      on("admin:dispute_opened", () => loadDisputes()),
      on("admin:dispute_decided", () => loadDisputes()),
    ];
    return () => unsubs.forEach((u) => u());
  }, [on]);

  const handleDecision = async (id: number, decision: "upheld" | "rejected") => {
    if (!confirm(`Are you sure you want to mark this dispute as ${decision.toUpperCase()}?`)) return;
    setActing(id);
    try {
      await post(`/disputes/${id}/decide`, {
        decision,
        admin_notes: adminNotes[id] || "",
      });
      loadDisputes();
    } catch (x: any) {
      alert(x.message || "Failed to submit decision");
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("disputesQueue")}</h1>
        <p className="text-sm text-neutral-500">
          Review counterparty dispute claims, inspect physical unboxing evidence, and apply final decisions.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      ) : disputes.length === 0 ? (
        <div className="box p-8 text-center text-sm text-neutral-500">
          No disputes pending in the queue.
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
                      Dispute #{d.id} on Deal:
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
                    Escrow: {Number(d.total_amount).toLocaleString()} BDT
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

              {/* Counterparty summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs p-3 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                <div>
                  <span className="text-neutral-500 uppercase block font-semibold">Complainant (Buyer):</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">{d.buyer_name}</span>
                  <span className="font-mono text-neutral-500 block">{d.buyer_phone}</span>
                </div>
                <div>
                  <span className="text-neutral-500 uppercase block font-semibold">Seller:</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {d.page_name || d.seller_name}
                  </span>
                  <span className="font-mono text-neutral-500 block">ID #{d.seller_id}</span>
                </div>
              </div>

              {/* Evidence & Complaint section */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-7 space-y-3">
                  <div className="space-y-1">
                    <span className="text-xs uppercase font-bold text-neutral-500">Buyer&apos;s Stated Reason:</span>
                    <p className="text-sm text-neutral-900 dark:text-neutral-100 bg-white dark:bg-black p-3 border border-neutral-200 dark:border-neutral-800">
                      {d.reason}
                    </p>
                  </div>

                  {d.evidence_text && (
                    <div className="space-y-1">
                      <span className="text-xs uppercase font-bold text-neutral-500">Additional Evidence:</span>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 bg-white dark:bg-black p-3 border border-neutral-200 dark:border-neutral-800">
                        {d.evidence_text}
                      </p>
                    </div>
                  )}

                  {/* AI Multimodal Analysis */}
                  <div className="box p-4 border border-purple-300 dark:border-purple-800 bg-white dark:bg-black space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-accent">
                        Multimodal AI Analysis
                      </span>
                      <span className="text-xs font-mono font-bold uppercase text-neutral-500">
                        Category: {d.category}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-700 dark:text-neutral-300">
                      {d.ai_summary || "Visual analysis evaluated listing against submitted evidence."}
                    </p>
                    <div className="text-xs font-semibold text-purple-700 dark:text-purple-300 pt-1">
                      Recommendation: <strong>{d.ai_recommendation.toUpperCase()}</strong> (AI only suggests; human admin decides)
                    </div>
                  </div>
                </div>

                {/* Evidence Photo */}
                <div className="lg:col-span-5 space-y-2">
                  <span className="text-xs uppercase font-bold text-neutral-500 block">
                    Uploaded Photo Evidence:
                  </span>
                  {d.has_photo ? (
                    <div className="border border-neutral-300 dark:border-neutral-700 bg-black/5 dark:bg-white/5 p-2">
                      <img
                        src={`${API}/disputes/${d.id}/photo`}
                        alt="Dispute evidence"
                        className="w-full max-h-64 object-contain"
                      />
                    </div>
                  ) : (
                    <div className="p-8 text-center border border-dashed border-neutral-300 dark:border-neutral-700 text-xs text-neutral-500">
                      No photographic evidence attached to this claim.
                    </div>
                  )}
                </div>
              </div>

              {/* Admin Decision Bar */}
              {d.status === "open" ? (
                <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
                  <div>
                    <label htmlFor={`admin-note-input-${d.id}`}>{t("adminNotes")}</label>
                    <input
                      id={`admin-note-input-${d.id}`}
                      placeholder="e.g. Broken screen confirmed from unboxing photo. Full refund granted."
                      value={adminNotes[d.id] || ""}
                      onChange={(e) => setAdminNotes({ ...adminNotes, [d.id]: e.target.value })}
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => handleDecision(d.id, "upheld")}
                      disabled={acting === d.id}
                      className="btn-success text-sm py-2 px-4"
                    >
                      {acting === d.id ? "Processing..." : t("uphold")}
                    </button>
                    <button
                      onClick={() => handleDecision(d.id, "rejected")}
                      disabled={acting === d.id}
                      className="btn-danger text-sm py-2 px-4"
                    >
                      {acting === d.id ? "Processing..." : t("reject")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500">
                  <strong>Resolution:</strong> {d.admin_notes || "Decision finalized and ledger updated."}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
