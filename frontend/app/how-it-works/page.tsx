"use client";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

export default function HowItWorksPage() {
  const { t, lang } = useI18n();

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 space-y-12">
      <div className="space-y-3 border-b border-neutral-200 dark:border-neutral-800 pb-6">
        <span className="text-xs font-semibold uppercase tracking-wider text-accent">{lang === "bn" ? "ডকুমেন্টেশন" : "Documentation"}</span>
        <h1 className="text-3xl font-bold tracking-tight">{t("howTitle")}</h1>
        <p className="text-neutral-600 dark:text-neutral-400">{t("howSub")}</p>
      </div>

      <div className="space-y-12">
        <section className="box p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-accent text-white flex items-center justify-center font-bold">1</span>
            <h2 className="text-xl font-bold">{t("howProductTitle")}</h2>
          </div>
          <p className="text-neutral-600 dark:text-neutral-400 text-sm leading-relaxed">{t("howProductText")}</p>
          {lang === "bn" ? (
            <div className="border border-neutral-200 dark:border-neutral-800 p-4 bg-neutral-50 dark:bg-neutral-900 text-xs space-y-2">
              <strong>সময়রেখা ও প্রক্রিয়া:</strong>
              <p>১. বিক্রেতা পণ্যের মূল্য ও কুরিয়ারের নাম উল্লেখ করে ডিল তৈরি করেন।</p>
              <p>২. ক্রেতা পুরো টাকা (পণ্য + ডেলিভারি চার্জ) এসক্রো ভল্টে জমা দেন।</p>
              <p>৩. বিক্রেতা ৪৮ ঘণ্টার মধ্যে পার্সেল বুক করে ট্র্যাকিং আইডি প্রদান করেন।</p>
              <p>৪. স্বয়ংক্রিয় কুরিয়ার ট্র্যাকিং পার্সেল গ্রহণ, পরিবহন ও ডেলিভারি ট্র্যাক করে।</p>
              <p>৫. ডেলিভারির পর ক্রেতার পণ্য যাচাই ও সন্তুষ্টি নিশ্চিতের জন্য ৩ দিন সময় থাকে।</p>
              <p>৬. ক্রেতা নিশ্চিত করলে বা কোনো অভিযোগ না থাকলে ২% সার্ভিস ফি কেটে বিক্রেতাকে পাওনা পরিশোধ করা হয়।</p>
            </div>
          ) : (
            <div className="border border-neutral-200 dark:border-neutral-800 p-4 bg-neutral-50 dark:bg-neutral-900 text-xs space-y-2">
              <strong>Timeline Breakdown:</strong>
              <p>1. Seller initiates deal with price and courier name (Steadfast, Pathao, RedX).</p>
              <p>2. Buyer deposits full amount into escrow (bKash/Nagad mock gateway).</p>
              <p>3. Seller dispatches within 48 hours and inputs consignment tracking ID.</p>
              <p>4. Automated courier status checks detect pickup, transit, and delivery events.</p>
              <p>5. On delivery, a 72-hour inspection window opens for buyer verification.</p>
              <p>6. If confirmed or if window passes without dispute, funds are released to seller minus 2% fee.</p>
            </div>
          )}
        </section>

        <section className="box p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-accent text-white flex items-center justify-center font-bold">2</span>
            <h2 className="text-xl font-bold">{t("howReturnTitle")}</h2>
          </div>
          <p className="text-neutral-600 dark:text-neutral-400 text-sm leading-relaxed">{t("howReturnText")}</p>
          {lang === "bn" ? (
            <div className="border border-neutral-200 dark:border-neutral-800 p-4 bg-neutral-50 dark:bg-neutral-900 text-xs space-y-2">
              <strong>রিটার্ন ও ক্ষতিপূরণ নিয়মাবলী:</strong>
              <p>• ক্রেতা দরজায় পার্সেল নিতে অস্বীকৃতি জানালে: বিক্রেতা ডেলিভারি ও রিটার্ন ক্ষতিপূরণ এসক্রো থেকে পান; বাকি টাকা ক্রেতা ফেরত পান।</p>
              <p>• পণ্য ভুল বা ভাঙা হলে: ক্রেতা ছবিসহ অভিযোগ দাখিল করেন। মাল্টিমোডাল এআই সহায়তা নিয়ে অ্যাডমিন দাবি মূল্যায়ন করেন।</p>
              <p>• রিটার্ন অনুমোদিত হলে: ক্রেতা পার্সেল ফেরত পাঠান। বিক্রেতার কাছে পৌঁছানো নিশ্চিত হলে ক্রেতাকে রিফান্ড দেওয়া হয়।</p>
            </div>
          ) : (
            <div className="border border-neutral-200 dark:border-neutral-800 p-4 bg-neutral-50 dark:bg-neutral-900 text-xs space-y-2">
              <strong>Return Rules:</strong>
              <p>• If buyer refuses parcel at doorstep: seller receives delivery charge + return compensation from escrow; buyer refunded balance.</p>
              <p>• If product is wrong or damaged: buyer files dispute with photos. Admin evaluates claim with multimodal AI assistance.</p>
              <p>• Approved return: buyer ships item back with return tracking ID. Escrow refund occurs upon confirmed delivery back to seller.</p>
            </div>
          )}
        </section>

        <section className="box p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-accent text-white flex items-center justify-center font-bold">3</span>
            <h2 className="text-xl font-bold">{t("howRentalTitle")}</h2>
          </div>
          <p className="text-neutral-600 dark:text-neutral-400 text-sm leading-relaxed">{t("howRentalText")}</p>
          {lang === "bn" ? (
            <div className="border border-neutral-200 dark:border-neutral-800 p-4 bg-neutral-50 dark:bg-neutral-900 text-xs space-y-2">
              <strong>দ্বৈত-নিশ্চিতকরণ হস্তান্তর প্রোটোকল:</strong>
              <p>• বাড়িভাড়া অগ্রিম, ফ্রিল্যান্সিং প্রজেক্ট মাইলস্টোন বা সরাসরি মুখোমুখি লেনদেনের জন্য কুরিয়ার ট্র্যাকিং ছাড়া প্রযোজ্য।</p>
              <p>• উভয় পক্ষ 'কাজ সম্পন্ন' বোতাম চাপলেই কেবল টাকা স্থানান্তরিত হয়।</p>
              <p>• এক পক্ষ নিশ্চিত করে অন্য পক্ষ সাড়া না দিলে তা স্বয়ংক্রিয়ভাবে অ্যাডমিন মধ্যস্থতা সারিতে চলে যায়।</p>
            </div>
          ) : (
            <div className="border border-neutral-200 dark:border-neutral-800 p-4 bg-neutral-50 dark:bg-neutral-900 text-xs space-y-2">
              <strong>Dual-Confirmation Handover Protocol:</strong>
              <p>• Tailored for apartment rent advances, freelance project milestones, or in-person exchanges without third-party courier tracking.</p>
              <p>• Money moves ONLY when BOTH parties click 'Confirm Handover'.</p>
              <p>• If one party confirms and the other does not respond, a reminder is triggered. Unresolved cases escalate to the admin queue.</p>
            </div>
          )}
        </section>
      </div>

      <div className="text-center pt-6">
        <Link href="/login" className="btn px-6 py-3">{t("getStarted")}</Link>
      </div>
    </div>
  );
}
