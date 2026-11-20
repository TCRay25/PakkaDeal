"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

export default function AppSidebar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAdmin, logout } = useAuth();

  const links = [
    { href: "/dashboard", label: t("overview") },
    { href: "/dashboard/deals", label: t("deals") },
    { href: "/dashboard/new", label: t("createDeal") },
    { href: "/dashboard/wallet", label: t("wallet") },
    { href: "/dashboard/notifications", label: t("notifications") },
    { href: "/dashboard/profile", label: t("profile") },
  ];

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const trustScore = user ? Math.max(user.seller_trust, user.buyer_trust, 70) : 70;

  return (
    <aside className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black p-4 flex flex-col justify-between gap-6">
      <div className="space-y-5">
        {user && (
          <div className="box p-3.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-2">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-2">
              <span className="font-mono text-xs font-bold text-neutral-900 dark:text-neutral-100">
                {user.phone}
              </span>
              <span className="text-xs font-mono font-bold text-accent">
                {trustScore}/100
              </span>
            </div>

            <div>
              <div className="font-semibold text-sm truncate text-neutral-900 dark:text-neutral-100">
                {user.name || user.page_name || "User Account"}
              </div>
              <div className="text-[11px] text-neutral-500">
                Verified Account
              </div>
            </div>
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

          {isAdmin && (
            <div className="pt-2 mt-2 border-t border-neutral-200 dark:border-neutral-800">
              <Link
                href="/admin"
                className="px-3 py-2 text-xs uppercase tracking-wider font-bold block border border-purple-500/50 bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:bg-purple-500/20"
              >
                🛡️ {t("admin")} →
              </Link>
            </div>
          )}
        </nav>
      </div>

      {user && (
        <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <button
            onClick={handleLogout}
            className="btn-danger w-full justify-center text-xs py-2 px-3"
          >
            {t("logout")}
          </button>
        </div>
      )}
    </aside>
  );
}
