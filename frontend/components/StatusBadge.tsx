"use client";
import { useI18n, Key } from "@/lib/i18n";

export default function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const s = (status || "").toLowerCase();
  const label = t(("s_" + s) as Key) || status?.replace(/_/g, " ").toUpperCase();

  let colorClasses = "border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300";

  if (s === "held" || s === "escrow_held" || s === "payment_confirmed") {
    colorClasses = "border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400 bg-blue-500/10";
  } else if (s === "shipped" || s === "in_transit") {
    colorClasses = "border-cyan-500 text-cyan-600 dark:border-cyan-400 dark:text-cyan-400 bg-cyan-500/10";
  } else if (s === "payment_pending" || s === "created") {
    colorClasses = "border-yellow-500 text-yellow-700 dark:border-yellow-400 dark:text-yellow-400 bg-yellow-500/10";
  } else if (s === "delivered" || s === "buyer_confirmed") {
    colorClasses = "border-amber-500 text-amber-600 dark:border-amber-400 dark:text-amber-400 bg-amber-500/10";
  } else if (s === "released") {
    colorClasses = "border-emerald-600 text-emerald-600 dark:border-emerald-500 dark:text-emerald-400 bg-emerald-600/10";
  } else if (s === "disputed") {
    colorClasses = "border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400 bg-purple-600/10";
  } else if (s === "refunded" || s === "cancelled") {
    colorClasses = "border-rose-600 text-rose-600 dark:border-rose-400 dark:text-rose-400 bg-rose-600/10";
  } else if (s === "return_requested" || s === "return_shipped" || s === "return_received") {
    colorClasses = "border-orange-500 text-orange-600 dark:border-orange-400 dark:text-orange-400 bg-orange-500/10";
  }

  return (
    <span className={`inline-block px-2.5 py-1 text-xs font-semibold uppercase tracking-wider border rounded-none ${colorClasses}`}>
      {label}
    </span>
  );
}
