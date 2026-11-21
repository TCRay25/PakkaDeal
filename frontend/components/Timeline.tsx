"use client";
import { useI18n, Key } from "@/lib/i18n";

type TimelineEvent = {
  id: number;
  kind: string;
  from_status?: string;
  to_status?: string;
  actor?: string;
  note: string;
  created_at: string;
};

export default function Timeline({
  events,
  currentStatus = "",
}: {
  events: TimelineEvent[];
  currentStatus?: string;
}) {
  const { t, lang } = useI18n();

  if (!events || events.length === 0) {
    return <p className="text-sm text-neutral-500">{t("noEvents")}</p>;
  }

  const getNextStepText = (status: string) => {
    const s = status.toLowerCase();
    if (s === "created") {
      return lang === "bn"
        ? "পরবর্তী ধাপ: ক্রেতা কর্তৃক এসক্রো ভল্টে টাকা জমা করার অপেক্ষায়।"
        : "Next Step: Waiting for buyer to deposit funds into escrow.";
    }
    if (s === "payment_pending") {
      return lang === "bn"
        ? "পরবর্তী ধাপ: ক্রেতা লিংক খুলেছেন। পেমেন্ট কনফার্মেশনের অপেক্ষায়।"
        : "Next Step: Buyer opened deal link. Waiting for payment confirmation.";
    }
    if (s === "held" || s === "escrow_held") {
      return lang === "bn"
        ? "পরবর্তী ধাপ: ক্রেতার টাকা এসক্রোতে জমা রয়েছে। বিক্রেতা পার্সেল পাঠানোর অপেক্ষায়।"
        : "Next Step: Buyer has paid. Waiting for seller to dispatch parcel via courier.";
    }
    if (s === "shipped" || s === "in_transit") {
      return lang === "bn"
        ? "পরবর্তী ধাপ: পার্সেল পরিবহনে রয়েছে। কুরিয়ার কর্তৃক ক্রেতার ঠিকানায় ডেলিভারির অপেক্ষায়।"
        : "Next Step: Parcel in transit. Waiting for courier delivery to buyer.";
    }
    if (s === "delivered") {
      return lang === "bn"
        ? "পরবর্তী ধাপ: পার্সেল পৌঁছেছে। ক্রেতার কনফার্মেশন অথবা ২৪ ঘণ্টা অটো-রিলিজ টাইমারের অপেক্ষায়।"
        : "Next Step: Parcel delivered. Waiting for buyer confirmation or 24h auto-release countdown.";
    }
    if (s === "return_requested") {
      return lang === "bn"
        ? "পরবর্তী ধাপ: রিটার্ন চাওয়া হয়েছে। ক্রেতা কর্তৃক বিক্রেতার নিকট রিটার্ন পার্সেল পাঠানোর অপেক্ষায়।"
        : "Next Step: Return requested. Waiting for buyer to dispatch return parcel.";
    }
    if (s === "return_shipped") {
      return lang === "bn"
        ? "পরবর্তী ধাপ: রিটার্ন পার্সেল পরিবহনে রয়েছে। বিক্রেতা কর্তৃক প্রাপ্তি নিশ্চিতকরণের অপেক্ষায়।"
        : "Next Step: Return in transit. Waiting for seller to confirm return receipt.";
    }
    if (s === "disputed") {
      return lang === "bn"
        ? "পরবর্তী ধাপ: বিরোধ পর্যালোচনায় রয়েছে। অটো-রিলিজ স্থগিত। পাক্কাডিল অ্যাডমিন রায়ের অপেক্ষায়।"
        : "Next Step: Dispute under review. Auto-release paused. Waiting for admin verdict.";
    }
    if (s === "released") {
      return lang === "bn"
        ? "লেনদেন সমাপ্ত: টাকা সফলভাবে বিক্রেতার একাউন্টে হস্তান্তর করা হয়েছে।"
        : "Completed: All funds successfully released to seller.";
    }
    if (s === "refunded") {
      return lang === "bn"
        ? "লেনদেন সমাপ্ত: ক্রেতাকে রিফান্ড প্রদান সম্পন্ন হয়েছে।"
        : "Completed: Refund processed to buyer.";
    }
    return "";
  };

  const nextStepMsg = currentStatus ? getNextStepText(currentStatus) : "";

  return (
    <div className="space-y-6">
      {/* Vertical Stepper */}
      <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-neutral-200 dark:before:bg-neutral-800">
        {events.map((ev, idx) => {
          const isLatest = idx === events.length - 1;
          const translatedKind = t(("e_" + ev.kind) as Key);
          const title = translatedKind !== "e_" + ev.kind ? translatedKind : ev.kind.replace(/_/g, " ").toUpperCase();
          const dateStr = new Date(ev.created_at).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });

          const actorLabel = ev.actor ? ev.actor.toUpperCase() : "";

          return (
            <div key={ev.id} className="relative group">
              {/* Stepper Node Square */}
              <div
                className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-none border-2 transition-all ${
                  isLatest
                    ? "bg-accent border-white dark:border-black ring-2 ring-accent/40 shadow-sm"
                    : "bg-neutral-400 dark:bg-neutral-600 border-white dark:border-black"
                }`}
              />

              <div
                className={`box p-3 border transition-colors ${
                  isLatest
                    ? "border-accent/40 bg-accent/5 dark:bg-accent/10"
                    : "border-neutral-200 dark:border-neutral-800"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">{title}</span>
                    {actorLabel && (
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 border border-neutral-300 dark:border-neutral-700 text-neutral-500">
                        {actorLabel}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-neutral-500">{dateStr}</span>
                </div>
                {ev.note && <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">{ev.note}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Next Step Banner */}
      {nextStepMsg && (
        <div className="p-3 border-2 border-accent/30 bg-accent/5 rounded-none space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-accent block">
            {lang === "bn" ? "পরবর্তী করণীয় / ধাপ" : "Next Step"}
          </span>
          <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
            {nextStepMsg}
          </p>
        </div>
      )}
    </div>
  );
}
