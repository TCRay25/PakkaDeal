"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, post, NotificationItem } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { translateNotification } from "@/lib/translateNotification";

export default function NotificationsPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api<NotificationItem[]>("/notifications")
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const markAllRead = async () => {
    await post("/notifications/read-all");
    load();
  };

  const markRead = async (id: number) => {
    await post(`/notifications/${id}/read`);
    load();
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("notifications")}</h1>
          <p className="text-sm text-neutral-500">{t("liveOperationalAlerts")}</p>
        </div>
        {items.some((i) => !i.is_read) && (
          <button onClick={markAllRead} className="btn-ghost text-xs">
            {t("markAllRead")}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      ) : items.length === 0 ? (
        <div className="box p-8 text-center text-sm text-neutral-500">
          {t("noNotificationsYet")}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const { title, message } = translateNotification(item.title, item.message, lang);
            return (
              <div
                key={item.id}
                className={`box p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  item.is_read
                    ? "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black opacity-80"
                    : "border-accent bg-accent/5"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                      {title}
                    </span>
                    {!item.is_read && (
                      <span className="w-2 h-2 bg-accent inline-block rounded-none" />
                    )}
                  </div>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                    {message}
                  </p>
                  <span className="text-xs text-neutral-400 block font-mono">
                    {new Date(item.created_at).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB")}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.deal_code && (
                    <Link href={`/deal/${item.deal_code}`} className="btn text-xs py-1 px-3">
                      {t("viewDeal")}
                    </Link>
                  )}
                  {!item.is_read && (
                    <button onClick={() => markRead(item.id)} className="btn-ghost text-xs py-1 px-2.5">
                      {t("markRead")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
