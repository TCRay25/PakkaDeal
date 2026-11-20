"use client";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import Logo from "./Logo";

export default function Header() {
  const { t, toggle, lang } = useI18n();
  const { user, isAdmin, logout, switchRole } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-black/95">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="shrink-0">
            <Logo size={28} />
          </Link>
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
            <Link
              href="/how-it-works"
              className={`px-3 py-1.5 transition-colors ${
                isActive("/how-it-works") ? "text-accent font-semibold" : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
              }`}
            >
              {t("howTitle")}
            </Link>
            <Link
              href="/fees"
              className={`px-3 py-1.5 transition-colors ${
                isActive("/fees") ? "text-accent font-semibold" : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
              }`}
            >
              {t("feesTitle")}
            </Link>
            <Link
              href="/faq"
              className={`px-3 py-1.5 transition-colors ${
                isActive("/faq") ? "text-accent font-semibold" : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
              }`}
            >
              {t("faqTitle")}
            </Link>
            {user && (
              <Link
                href="/dashboard"
                className={`px-3 py-1.5 transition-colors ${
                  isActive("/dashboard") ? "text-accent font-semibold" : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
                }`}
              >
                {t("dashboard")}
              </Link>
            )}
            {isAdmin && (
              <Link
                href="/admin"
                className={`ml-2 px-2.5 py-1 text-xs uppercase tracking-wider font-semibold border ${
                  isActive("/admin")
                    ? "border-accent bg-accent text-white"
                    : "border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 hover:border-accent"
                }`}
              >
                {t("admin")}
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <div className="hidden sm:flex items-center gap-2 mr-2 border-r border-neutral-200 dark:border-neutral-800 pr-3">
              <span className="text-xs text-neutral-500">{user.phone}</span>
              <button
                onClick={() => switchRole(user.role === "seller" ? "buyer" : "seller")}
                className="px-2 py-0.5 text-xs border border-neutral-300 dark:border-neutral-700 hover:border-neutral-500 bg-neutral-50 dark:bg-neutral-900"
                title="Switch active profile"
              >
                {user.role === "seller" ? t("roleSeller") : t("roleBuyer")} ⇄
              </button>
            </div>
          ) : (
            <Link href="/login" className="btn text-xs py-1.5 px-3">
              {t("login")}
            </Link>
          )}

          {user && (
            <button
              onClick={() => {
                logout();
                router.push("/");
              }}
              className="btn-ghost text-xs py-1.5 px-2.5"
            >
              {t("logout")}
            </button>
          )}

          <button
            onClick={toggle}
            className="btn-ghost text-xs py-1.5 px-2.5 font-semibold"
            aria-label="Toggle Language"
          >
            {lang === "bn" ? "English" : "বাংলা"}
          </button>

          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="btn-ghost text-xs py-1.5 px-2.5"
            aria-label="Toggle theme"
          >
            {mounted && theme === "dark" ? t("light") : t("dark")}
          </button>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden btn-ghost p-1.5"
            aria-label="Mobile Menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 5h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile nav dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black p-4 space-y-3">
          <Link href="/how-it-works" onClick={() => setMobileMenuOpen(false)} className="block py-1 text-sm">
            {t("howTitle")}
          </Link>
          <Link href="/fees" onClick={() => setMobileMenuOpen(false)} className="block py-1 text-sm">
            {t("feesTitle")}
          </Link>
          <Link href="/faq" onClick={() => setMobileMenuOpen(false)} className="block py-1 text-sm">
            {t("faqTitle")}
          </Link>
          {user && (
            <>
              <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className="block py-1 text-sm font-semibold text-accent">
                {t("dashboard")}
              </Link>
              <Link href="/dashboard/new" onClick={() => setMobileMenuOpen(false)} className="block py-1 text-sm">
                {t("createDeal")}
              </Link>
              <Link href="/dashboard/deals" onClick={() => setMobileMenuOpen(false)} className="block py-1 text-sm">
                {t("deals")}
              </Link>
              <Link href="/dashboard/wallet" onClick={() => setMobileMenuOpen(false)} className="block py-1 text-sm">
                {t("wallet")}
              </Link>
              <Link href="/dashboard/profile" onClick={() => setMobileMenuOpen(false)} className="block py-1 text-sm">
                {t("profile")}
              </Link>
            </>
          )}
          {isAdmin && (
            <Link href="/admin" onClick={() => setMobileMenuOpen(false)} className="block py-1 text-sm font-bold text-accent">
              {t("admin")}
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
