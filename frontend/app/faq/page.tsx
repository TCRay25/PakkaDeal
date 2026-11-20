"use client";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

export default function FaqPage() {
  const { t } = useI18n();

  const faqs = [
    { q: t("faq1Q"), a: t("faq1A") },
    { q: t("faq2Q"), a: t("faq2A") },
    { q: t("faq3Q"), a: t("faq3A") },
    {
      q: "How does the multimodal AI dispute analysis assist?",
      a: "When a buyer uploads photos of a broken or wrong product, our AI multimodal model examines the image against the original listing description. It extracts evidence details, categorizes the claim (damaged, wrong item, missing accessories), and outputs an objective recommendation to the Admin queue. The final decision is always made by human administrators.",
    },
    {
      q: "Can I use PakkaDeal for apartment rent advances or freelance milestones?",
      a: "Yes! PakkaDeal supports rental and service deals. Instead of courier tracking, funds are held in escrow until both parties confirm handover. If there is a dispute or failure to deliver, the case is handled by our admin dispute resolution protocol.",
    },
    {
      q: "How do trust scores work?",
      a: "Both buyers and sellers build a verified trust score starting at 60-70. Successfully completed deliveries raise the score up to 100. Refused deliveries and upheld disputes decrease the score. High-trust buyers can get deposit waivers on small orders.",
    },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 space-y-10">
      <div className="space-y-3 border-b border-neutral-200 dark:border-neutral-800 pb-6">
        <span className="text-xs font-semibold uppercase tracking-wider text-accent">Help Center</span>
        <h1 className="text-3xl font-bold tracking-tight">{t("faqTitle")}</h1>
        <p className="text-neutral-600 dark:text-neutral-400">Everything you need to know about escrow transactions and dispute protection.</p>
      </div>

      <div className="space-y-4">
        {faqs.map((faq, idx) => (
          <div key={idx} className="box p-5 space-y-2 border border-neutral-200 dark:border-neutral-800">
            <h3 className="font-semibold text-base text-neutral-900 dark:text-neutral-100">{faq.q}</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">{faq.a}</p>
          </div>
        ))}
      </div>

      <div className="text-center pt-4">
        <Link href="/login" className="btn px-6 py-2.5">{t("getStarted")}</Link>
      </div>
    </div>
  );
}
