"use client";
import { useI18n, Key } from "@/lib/i18n";

export default function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const label = t(("s_" + status) as Key) || status;

  let colorClasses = "border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300";
  if (status === "held" || status === "shipped") {
    colorClasses = "border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400 bg-blue-500/5";
  } else if (status === "delivered") {
    colorClasses = "border-amber-500 text-amber-600 dark:border-amber-400 dark:text-amber-400 bg-amber-500/5";
  } else if (status === "released") {
    colorClasses = "border-emerald-600 text-emerald-600 dark:border-emerald-500 dark:text-emerald-400 bg-emerald-600/5";
  } else if (status === "disputed") {
    colorClasses = "border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400 bg-purple-600/5";
  } else if (status === "refunded") {
    colorClasses = "border-rose-600 text-rose-600 dark:border-rose-400 dark:text-rose-400 bg-rose-600/5";
  } else if (status === "return_requested" || status === "return_shipped") {
    colorClasses = "border-orange-500 text-orange-600 dark:border-orange-400 dark:text-orange-400 bg-orange-500/5";
  }

  return (
    <span className={`inline-block px-2.5 py-1 text-xs font-medium uppercase tracking-wider border rounded-none ${colorClasses}`}>
      {label}
    </span>
  );
}
