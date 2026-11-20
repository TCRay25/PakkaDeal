"use client";
import { useI18n, Key } from "@/lib/i18n";

export default function Timeline({ events }: { events: Array<{ id: number; kind: string; note: string; created_at: string }> }) {
  const { t } = useI18n();

  if (!events || events.length === 0) {
    return <p className="text-sm text-neutral-500">No events recorded.</p>;
  }

  return (
    <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-neutral-200 dark:before:bg-neutral-800">
      {events.map((ev) => {
        const translatedKind = t(("e_" + ev.kind) as Key);
        const title = translatedKind !== "e_" + ev.kind ? translatedKind : ev.kind.replace(/_/g, " ").toUpperCase();
        const dateStr = new Date(ev.created_at).toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

        return (
          <div key={ev.id} className="relative group">
            <div className="absolute -left-6 top-1 w-3.5 h-3.5 bg-accent border-2 border-white dark:border-black rounded-none shadow-sm" />
            <div className="box p-3 border border-neutral-200 dark:border-neutral-800">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">{title}</span>
                <span className="text-xs text-neutral-500">{dateStr}</span>
              </div>
              {ev.note && <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">{ev.note}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
