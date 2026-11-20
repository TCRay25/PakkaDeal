"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

export default function AppSidebar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { user } = useAuth();

  const links = [
    { href: "/dashboard", label: t("overview") },
    { href: "/dashboard/deals", label: t("deals") },
    { href: "/dashboard/new", label: t("createDeal") },
    { href: "/dashboard/wallet", label: t("wallet") },
    { href: "/dashboard/notifications", label: t("notifications") },
    { href: "/dashboard/profile", label: t("profile") },
  ];

  return (
    <aside className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black p-4 space-y-6">
      {user && (
        <div className="box p-3 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-semibold text-neutral-500">
              {user.role === "seller" ? t("roleSeller") : t("roleBuyer")}
            </span>
            <span className="text-xs font-bold text-accent">
              Score: {user.role === "seller" ? user.seller_trust : user.buyer_trust}/100
            </span>
          </div>
          <div className="font-semibold text-sm truncate">{user.name || user.page_name || user.phone}</div>
          <div className="text-xs text-neutral-500">{user.phone}</div>
        </div>
      )}

      <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors border ${
                active
                  ? "border-accent bg-accent text-white"
                  : "border-transparent text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900 hover:text-neutral-900 dark:hover:text-neutral-100"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
