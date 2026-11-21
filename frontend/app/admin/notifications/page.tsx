"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, NotificationItem } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { translateNotification } from "@/lib/translateNotification";

export default function AdminNotificationsPage() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<NotificationItem[]>("/admin/notifications")
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">
          {lang === "bn" ? "সিস্টেম নোটিফিকেশন লগ" : "System Notification Log"}
        </h1>
        <p className="text-sm text-neutral-500">
          {lang === "bn"
            ? "প্ল্যাটফর্মে পাঠানো সমস্ত আউটবাউন্ড নোটিফিকেশন, এসএমএস ও ট্রানজ্যাকশন সতর্কবার্তা।"
            : "Audit of all outbound notifications, SMS prompts, and transactional alerts triggered across the platform."}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      ) : items.length === 0 ? (
        <div className="box p-8 text-center text-sm text-neutral-500">
          {lang === "bn" ? "কোনো নোটিফিকেশন রেকর্ড পাওয়া যায়নি।" : "No notifications recorded."}
        </div>
      ) : (
        <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 text-xs uppercase font-semibold text-neutral-500">
              <tr>
                <th className="px-4 py-3">{lang === "bn" ? "আইডি" : "ID"}</th>
                <th className="px-4 py-3">{lang === "bn" ? "প্রাপকের ফোন" : "Recipient Phone"}</th>
                <th className="px-4 py-3">{lang === "bn" ? "শিরোনাম" : "Title"}</th>
                <th className="px-4 py-3">{lang === "bn" ? "বার্তা" : "Message"}</th>
                <th className="px-4 py-3">{lang === "bn" ? "ডিল" : "Deal"}</th>
                <th className="px-4 py-3">{lang === "bn" ? "সময়" : "Timestamp"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-xs">
              {items.map((n) => {
                const { title, message } = translateNotification(n.title, n.message, lang);
                return (
                  <tr key={n.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-900/50">
                    <td className="px-4 py-3 font-mono text-neutral-400">#{n.id}</td>
                    <td className="px-4 py-3 font-mono font-semibold">{n.phone}</td>
                    <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{title}</td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400 max-w-sm">{message}</td>
                    <td className="px-4 py-3">
                      {n.deal_code ? (
                        <Link href={`/deal/${n.deal_code}`} className="font-mono text-accent hover:underline">
                          {n.deal_code}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-500 whitespace-nowrap">
                      {new Date(n.created_at).toLocaleString(lang === "bn" ? "bn-BD" : "en-US")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
