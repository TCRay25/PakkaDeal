"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, NotificationItem } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function AdminNotificationsPage() {
  const { t } = useI18n();
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
        <h1 className="text-2xl font-bold tracking-tight">System Notification Log</h1>
        <p className="text-sm text-neutral-500">
          Audit of all outbound notifications, SMS prompts, and transactional alerts triggered across the platform.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      ) : items.length === 0 ? (
        <div className="box p-8 text-center text-sm text-neutral-500">
          No notifications recorded.
        </div>
      ) : (
        <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 text-xs uppercase font-semibold text-neutral-500">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Recipient Phone</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3">Deal</th>
                <th className="px-4 py-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-xs">
              {items.map((n) => (
                <tr key={n.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-900/50">
                  <td className="px-4 py-3 font-mono text-neutral-400">#{n.id}</td>
                  <td className="px-4 py-3 font-mono font-semibold">{n.phone}</td>
                  <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{n.title}</td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400 max-w-sm">{n.message}</td>
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
                    {new Date(n.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
