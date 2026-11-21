"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

export default function AdminSidebar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const links = [
    { href: "/admin", label: t("overview") },
    { href: "/admin/deals", label: t("allDeals") },
    { href: "/admin/disputes", label: t("disputesQueue") },
    { href: "/admin/users", label: t("userManagement") },
    { href: "/admin/ledger", label: t("ledger") },
    { href: "/admin/notifications", label: t("notifications") },
    { href: "/admin/settings", label: t("settings") },
  ];

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <aside className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black p-4 flex flex-col justify-between gap-4 md:sticky md:top-20 md:self-start md:h-[calc(100vh-6.5rem)] overflow-hidden">
      <div className="space-y-4">
        <div className="box p-3.5 bg-neutral-900 text-white dark:bg-neutral-950 border border-neutral-700 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-extrabold tracking-widest text-accent">
              PakkaDeal Admin
            </span>
            <span className="px-1.5 py-0.2 text-[10px] uppercase font-bold border border-accent bg-accent/20 text-white">
              Root
            </span>
          </div>
          {user && (
            <div className="pt-1.5 border-t border-neutral-800">
              <div className="font-mono text-xs font-semibold text-neutral-200">{user.phone}</div>
              <div className="text-[11px] text-neutral-400">{t("administrator")}</div>
            </div>
          )}
        </div>

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
