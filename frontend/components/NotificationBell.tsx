"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { api, post, NotificationItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useSocket } from "@/lib/socket";

export default function NotificationBell() {
  const { user } = useAuth();
  const { on, isConnected } = useSocket();
  const { t, lang } = useI18n();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = () => {
    if (!user) return;
    api<NotificationItem[]>("/notifications")
      .then(setNotifications)
      .catch(() => {});
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 20000);
    return () => clearInterval(interval);
  }, [user]);

  // Real-time notification receiver via Socket.IO
  useEffect(() => {
    if (!user) return;
    const unsubscribe = on("notification:new", (newNotif: NotificationItem) => {
      setNotifications((prev) => {
        if (prev.some((item) => item.id === newNotif.id)) return prev;
        return [newNotif, ...prev];
      });
    });
    return unsubscribe;
  }, [user, on]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleMarkAllRead = async () => {
    try {
      await post("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    } catch {}
  };

  const handleItemClick = async (n: NotificationItem) => {
    if (!n.is_read) {
      post(`/notifications/${n.id}/read`).catch(() => {});
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, is_read: 1 } : item))
      );
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="btn-ghost relative p-2"
        aria-label="Notifications"
      >
        {/* Bell SVG */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="square"
            strokeLinejoin="miter"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center bg-accent text-[10px] font-bold text-white px-1 rounded-none shadow">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 border-2 border-neutral-300 bg-white p-3 shadow-xl dark:border-neutral-700 dark:bg-black z-50 rounded-none animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-neutral-200 pb-2 dark:border-neutral-800">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100">
                {lang === "bn" ? "বিজ্ঞপ্তি" : "Notifications"}
              </span>
              {unreadCount > 0 && (
                <span className="bg-accent/10 text-accent text-[10px] font-mono px-1.5 py-0.5 border border-accent/30 font-bold">
                  {unreadCount} {lang === "bn" ? "নতুন" : "new"}
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] font-medium text-accent hover:underline"
              >
                {lang === "bn" ? "সব পঠিত করুন" : "Mark all read"}
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-900 mt-2">
            {notifications.length === 0 ? (
              <p className="py-6 text-center text-xs text-neutral-500">
                {lang === "bn" ? "কোন নতুন বিজ্ঞপ্তি নেই" : "No notifications"}
              </p>
            ) : (
              notifications.map((n) => {
                const dateStr = new Date(n.created_at).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", {
                  month: "short",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                });

                const content = (
                  <div
                    onClick={() => handleItemClick(n)}
                    className={`p-2.5 transition-colors cursor-pointer text-left ${
                      !n.is_read
                        ? "bg-accent/5 dark:bg-accent/10 border-l-2 border-accent"
                        : "hover:bg-neutral-50 dark:hover:bg-neutral-900"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                        {n.title}
                      </span>
                      <span className="text-[10px] text-neutral-400 font-mono shrink-0">
                        {dateStr}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 line-clamp-2">
                      {n.message}
                    </p>
                    {n.deal_code && (
                      <span className="inline-block font-mono text-[10px] text-accent font-semibold mt-1">
                        #{n.deal_code} →
                      </span>
                    )}
                  </div>
                );

                return n.deal_code ? (
                  <Link key={n.id} href={`/deal/${n.deal_code}`} className="block">
                    {content}
                  </Link>
                ) : (
                  <div key={n.id}>{content}</div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
