"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";

export default function Footer() {
  const pathname = usePathname();
  const { t, lang } = useI18n();
  const { formatFeePercent } = useSettings();

  // Only render footer on the landing page ("/") and nowhere else
  if (pathname !== "/" && pathname !== "") {
    return null;
  }

  return (
    <footer className="border-t border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-black mt-20">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2 space-y-4">
            <Logo size={28} />
            <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-md">
              {t("tagline")}
            </p>
            <div className="p-3 border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-xs text-neutral-500 leading-relaxed">
              <strong className="block text-neutral-800 dark:text-neutral-200 mb-1">{t("noticeLabel")}</strong>
              {t("regulatoryNotice")}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-900 dark:text-neutral-100 mb-3">
              {t("platformTitle")}
            </h4>
            <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
              <li><Link href="/" className="hover:text-accent">{t("home")}</Link></li>
              <li><Link href="/how-it-works" className="hover:text-accent">{t("howTitle")}</Link></li>
              <li>
                <Link href="/fees" className="hover:text-accent flex items-center gap-1.5">
                  <span>{lang === "bn" ? "সার্ভিস ফি" : "Fees"}</span>
                  <span className="font-mono text-[11px] font-bold text-accent">({formatFeePercent(lang)})</span>
                </Link>
              </li>
              <li><Link href="/faq" className="hover:text-accent">{t("faqTitle")}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-900 dark:text-neutral-100 mb-3">
              {t("quickPortals")}
            </h4>
            <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
              <li><Link href="/login" className="hover:text-accent">{t("login")}</Link></li>
              <li><Link href="/dashboard" className="hover:text-accent">{t("dashboard")}</Link></li>
              <li><Link href="/dashboard/new" className="hover:text-accent">{t("createDeal")}</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between text-xs text-neutral-500 gap-4">
          <p>{t("footerCopyright")}</p>
          <div className="flex gap-4">
            <span>{formatFeePercent(lang)} {lang === "bn" ? "এসক্রো ফি" : "Escrow Fee"}</span>
            <span>{t("footerCouriers")}</span>
            <span>{t("footerSandbox")}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
