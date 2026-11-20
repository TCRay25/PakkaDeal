"use client";
import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, post, DealDetailResponse, API } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import StatusBadge from "@/components/StatusBadge";
import Timeline from "@/components/Timeline";
import MoneyBreakdown from "@/components/MoneyBreakdown";

export default function DealPage({ params }: { params: Promise<{ code: string }> }) {
  const resolvedParams = use(params);
  const code = resolvedParams.code;
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<DealDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // Modal states
  const [showPayModal, setShowPayModal] = useState(false);
  const [showShipModal, setShowShipModal] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);

  // Form states
  const [courierName, setCourierName] = useState("Steadfast");
  const [trackingId, setTrackingId] = useState("");
  const [returnTrackingId, setReturnTrackingId] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeEvidence, setDisputeEvidence] = useState("");
  const [disputePhoto, setDisputePhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center space-y-4">
        <h1 className="text-xl font-bold text-red-600">{t("notFound")}</h1>
        <p className="text-sm text-neutral-500">{err || "Deal not accessible."}</p>
        <Link href="/" className="btn text-xs">Return Home</Link>
      </div>
    );
  }

  const { deal, seller, buyer, events, ledger, dispute, me } = data;

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setMsg(t("copied"));
    setTimeout(() => setMsg(""), 2000);
  };

  // Actions
  const handlePay = async () => {
    setSubmitting(true);
    try {
      await post(`/deals/${deal.code}/pay`, { payment_method: "bKash" });
      setShowPayModal(false);
      load();
    } catch (x: any) {
      alert(x.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleShip = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await post(`/deals/${deal.code}/ship`, { courier_name: courierName, tracking_id: trackingId });
      setShowShipModal(false);
      load();
    } catch (x: any) {
      alert(x.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirm("Are you sure you want to confirm? This will permanently release escrow funds to the seller.")) return;
    setSubmitting(true);
    try {
      await post(`/deals/${deal.code}/confirm`);
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
    const reason = prompt("Enter return reason:");
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
    setSubmitting(true);
    try {
      await post(`/deals/${deal.code}/ship-return`, {
        return_courier_name: "Pathao",
        return_tracking_id: returnTrackingId,
      });
      setShowReturnModal(false);
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Top Banner */}
      <div className="box p-6 border-2 border-neutral-300 dark:border-neutral-700 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-bold text-accent">{deal.code}</span>
              <span className="text-xs uppercase px-2 py-0.5 border border-neutral-300 dark:border-neutral-700 text-neutral-500">
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
                Current Escrow Phase: {deal.status.toUpperCase()}
              </h2>
              <span className="text-xs font-mono font-bold text-accent">
                Vault: {deal.total_amount.toLocaleString()} BDT
              </span>
            </div>

            {/* State: created */}
            {deal.status === "created" && (
              <div className="space-y-3">
                <p className="text-sm text-neutral-700 dark:text-neutral-300">
                  {t("payHelp")}
                </p>
                {me.is_buyer ? (
                  <button onClick={() => setShowPayModal(true)} className="btn w-full sm:w-auto text-base py-2.5 px-6">
                    {t("payBtn")}
                  </button>
                ) : !user ? (
                  <Link href="/login" className="btn text-xs">
                    {t("loginToPay")}
                  </Link>
                ) : (
                  <p className="text-xs text-neutral-500 italic">
                    Waiting for buyer ({buyer.phone}) to deposit funds into escrow. Share the link with them.
                  </p>
                )}
              </div>
            )}

            {/* State: held */}
            {deal.status === "held" && (
              <div className="space-y-4">
                <p className="text-sm text-neutral-700 dark:text-neutral-300">
                  {deal.deal_type === "product"
                    ? "Funds are securely locked in PakkaDeal escrow. Seller must dispatch within 48 hours."
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
                    <button onClick={handleConfirm} disabled={submitting} className="btn-success text-sm">
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

            {/* State: shipped */}
            {deal.status === "shipped" && (
              <div className="space-y-4">
                <div className="p-3 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black text-xs space-y-1">
                  <div className="font-semibold text-sm">
                    Courier: {deal.courier_name} (Tracking: {deal.tracking_id})
                  </div>
                  <div className="text-neutral-500">Status: {deal.courier_status || "In transit"}</div>
                </div>

                {/* Demo courier simulation buttons */}
                <div className="pt-2 border-t border-neutral-300 dark:border-neutral-700 space-y-2">
                  <span className="text-xs uppercase font-bold text-neutral-500 block">
                    Demo Courier Controls (Steadfast/Pathao Simulation)
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
                <div className="p-3 border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-200">
                  <strong>Inspection Window Active:</strong> Courier confirmed delivery. Buyer has 72 hours to inspect item and confirm receipt.
                  If no issue is reported, funds will release automatically to the seller.
                </div>

                <div className="flex flex-wrap gap-3">
                  {me.is_buyer && (
                    <>
                      <button onClick={handleConfirm} disabled={submitting} className="btn-success text-sm py-2 px-4">
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
                <p className="text-sm">Buyer requested return. Buyer should now dispatch the parcel back to seller.</p>
                {me.is_buyer && (
                  <button onClick={() => setShowReturnModal(true)} className="btn text-xs">
                    {t("shipReturn")}
                  </button>
                )}
              </div>
            )}

            {/* State: return_shipped */}
            {deal.status === "return_shipped" && (
              <div className="space-y-3">
                <p className="text-sm">
                  Return in transit ({deal.return_courier_name} {deal.return_tracking_id}).
                </p>
                <button onClick={() => handleSimulateCourier("delivered")} className="btn-success text-xs">
                  Simulate Return Received by Seller
                </button>
              </div>
            )}

            {/* State: disputed */}
            {deal.status === "disputed" && (
              <div className="space-y-3">
                <div className="p-3 border border-purple-500/40 bg-purple-500/10 text-xs text-purple-800 dark:text-purple-200">
                  <strong>Dispute Under Admin Review:</strong> All funds are frozen in escrow. The admin will inspect uploaded photos,
                  courier delivery logs, and AI recommendation before releasing or refunding funds.
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
              <div className="p-3 border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-800 dark:text-emerald-200">
                <strong>Deal Completed:</strong> Seller payout of {deal.seller_payout.toLocaleString()} BDT released. 2% service fee collected.
              </div>
            )}

            {/* State: refunded */}
            {deal.status === "refunded" && (
              <div className="p-3 border border-rose-500/30 bg-rose-500/10 text-xs text-rose-800 dark:text-rose-200">
                <strong>Escrow Refunded:</strong> Outcome: {deal.outcome || "Refund processed to buyer."}
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

          {/* Audit Timeline */}
          <div className="box p-6 space-y-4">
            <h2 className="text-base font-bold tracking-tight text-neutral-900 dark:text-neutral-100 border-b border-neutral-200 dark:border-neutral-800 pb-2">
              {t("timeline")}
            </h2>
            <Timeline events={events} />
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
              Counterparties
            </h3>

            {/* Seller */}
            <div className="space-y-1 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-xs uppercase font-semibold text-neutral-500">{t("seller")}</span>
                <span className="text-xs font-bold text-accent font-mono">{seller.seller_trust}/100</span>
              </div>
              <div className="font-semibold">{seller.page_name || seller.name || "Seller"}</div>
              <Link href={`/seller/${seller.id}`} className="text-xs text-accent hover:underline block">
                View Public Shop Profile →
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
              <div className="font-semibold">{buyer.name || "Buyer"}</div>
              <div className="text-xs font-mono text-neutral-500">{buyer.phone}</div>
              <div className="text-xs text-neutral-400">
                Completed: {buyer.delivered} | Refused: {buyer.refused}
              </div>
            </div>

            {/* Address */}
            <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
              <span className="font-semibold text-neutral-900 dark:text-neutral-100 block">Delivery / Handover:</span>
              <p>{deal.address}, {deal.area}</p>
            </div>
          </div>

          {/* Risk Card (For Seller) */}
          {me.is_seller && (
            <div className="box p-4 border border-neutral-200 dark:border-neutral-800 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs uppercase font-bold text-neutral-500">Order Risk Assessment</span>
                <span className={`text-xs font-bold font-mono px-2 py-0.5 border ${
                  deal.risk_score > 35 ? "border-rose-500 text-rose-500" : "border-emerald-600 text-emerald-600"
                }`}>
                  {deal.risk_score} / 100
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                Indicators: {deal.risk_reasons || "Standard verified profile parameters."}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Pay with bKash Sandbox */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="box w-full max-w-md p-6 border-2 border-accent space-y-4 bg-white dark:bg-black">
            <div className="flex justify-between items-center border-b border-neutral-200 dark:border-neutral-800 pb-2">
              <h3 className="font-bold text-base">bKash / Nagad Escrow Gateway</h3>
              <button onClick={() => setShowPayModal(false)} className="text-neutral-500 hover:text-black dark:hover:text-white">✕</button>
            </div>
            <div className="p-3 bg-pink-50 dark:bg-pink-950/30 border border-pink-200 dark:border-pink-900 text-xs space-y-1 text-pink-900 dark:text-pink-100">
              <strong>bKash Merchant Escrow Checkout (Sandbox)</strong>
              <p>Amount to lock in escrow: <strong>{deal.total_amount.toLocaleString()} BDT</strong></p>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Your money will not be credited to the seller until you receive the package and confirm inspection.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowPayModal(false)} className="btn-ghost w-1/3">Cancel</button>
              <button onClick={handlePay} disabled={submitting} className="btn w-2/3">
                {submitting ? "Processing..." : `Confirm & Deposit ${deal.total_amount} BDT`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add Tracking / Mark Shipped */}
      {showShipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form onSubmit={handleShip} className="box w-full max-w-md p-6 border-2 border-accent space-y-4 bg-white dark:bg-black">
            <div className="flex justify-between items-center border-b border-neutral-200 dark:border-neutral-800 pb-2">
              <h3 className="font-bold text-base">{t("addShip")}</h3>
              <button type="button" onClick={() => setShowShipModal(false)} className="text-neutral-500">✕</button>
            </div>
            <div>
              <label htmlFor="ship-courier-select">{t("courierName")}</label>
              <select id="ship-courier-select" value={courierName} onChange={(e) => setCourierName(e.target.value)}>
                <option value="Steadfast">Steadfast Courier</option>
                <option value="Pathao">Pathao Courier</option>
                <option value="RedX">RedX Logistics</option>
              </select>
            </div>
            <div>
              <label htmlFor="ship-tracking-input">{t("trackingId")}</label>
              <input
                id="ship-tracking-input"
                required
                value={trackingId}
                onChange={(e) => setTrackingId(e.target.value)}
                placeholder="e.g. ST-998822"
                className="font-mono"
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowShipModal(false)} className="btn-ghost w-1/3">Cancel</button>
              <button type="submit" disabled={submitting} className="btn w-2/3">
                {submitting ? "Saving..." : "Confirm Shipment"}
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
                Multimodal AI model will inspect the photo against the original listing description.
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
              <button type="button" onClick={() => setShowDisputeModal(false)} className="btn-ghost w-1/3">Cancel</button>
              <button type="submit" disabled={submitting} className="btn-danger w-2/3">
                {submitting ? "Submitting..." : t("submit")}
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
              <label htmlFor="return-tracking-input">{t("returnTrackingId")}</label>
              <input
                id="return-tracking-input"
                required
                value={returnTrackingId}
                onChange={(e) => setReturnTrackingId(e.target.value)}
                placeholder="e.g. PT-448821"
                className="font-mono"
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowReturnModal(false)} className="btn-ghost w-1/3">Cancel</button>
              <button type="submit" disabled={submitting} className="btn w-2/3">
                {submitting ? "Saving..." : "Confirm Return Shipment"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
