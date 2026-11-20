"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";

export default function AdminSidebar() {
  const { t } = useI18n();
  const pathname = usePathname();

  const links = [
    { href: "/admin", label: t("overview") },
    { href: "/admin/deals", label: t("allDeals") },
    { href: "/admin/disputes", label: t("disputesQueue") },
    { href: "/admin/users", label: t("userManagement") },
    { href: "/admin/ledger", label: t("ledger") },
    { href: "/admin/notifications", label: t("notifications") },
    { href: "/admin/settings", label: t("settings") },
  ];

  return (
    <aside className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black p-4 space-y-6">
      <div className="box p-3 bg-neutral-900 text-white dark:bg-neutral-900 border border-neutral-700 space-y-1">
        <span className="text-xs uppercase font-bold tracking-widest text-accent">PakkaDeal Admin</span>
        <div className="text-xs text-neutral-400">Escrow Management System</div>
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
    </aside>
  );
}
