"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import Logo from "./Logo";

export default function Header() {
  const { t, toggle, lang } = useI18n();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
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
                isActive("/how-it-works")
                  ? "text-accent font-semibold"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
              }`}
            >
              {t("howTitle")}
            </Link>
            <Link
              href="/fees"
              className={`px-3 py-1.5 transition-colors ${
                isActive("/fees")
                  ? "text-accent font-semibold"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
              }`}
            >
              {t("feesTitle")}
            </Link>
            <Link
              href="/faq"
              className={`px-3 py-1.5 transition-colors ${
                isActive("/faq")
                  ? "text-accent font-semibold"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
              }`}
            >
              {t("faqTitle")}
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {!user ? (
            <div className="flex items-center gap-1.5">
              <Link href="/login" className="btn-ghost text-xs py-1.5 px-3">
                {t("login")}
              </Link>
              <Link href="/register" className="btn text-xs py-1.5 px-3">
                {t("register")}
              </Link>
            </div>
          ) : (
            !pathname.startsWith("/dashboard") && !pathname.startsWith("/admin") && (
              <Link href="/dashboard" className="btn text-xs py-1.5 px-3">
                {t("dashboard")} →
              </Link>
            )
          )}

          <button
            onClick={toggle}
            className="btn-ghost text-xs py-1.5 px-2.5 font-semibold ml-1"
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
              <path
                fillRule="evenodd"
                d="M3 5h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2z"
                clipRule="evenodd"
              />
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
          {!user ? (
            <div className="pt-2 flex gap-2">
              <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="btn-ghost text-xs py-2 px-4 w-1/2 text-center">
                {t("login")}
              </Link>
              <Link href="/register" onClick={() => setMobileMenuOpen(false)} className="btn text-xs py-2 px-4 w-1/2 text-center">
                {t("register")}
              </Link>
            </div>
          ) : (
            <Link
              href="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1 text-sm font-semibold text-accent"
            >
              {t("dashboard")}
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
