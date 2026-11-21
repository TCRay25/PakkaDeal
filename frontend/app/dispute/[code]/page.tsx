"use client";
import { use, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function DisputePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const { t, lang } = useI18n();
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const fd = new FormData();
    fd.append("reason", reason);
    if (file) fd.append("photo", file);

    try {
      await api(`/deals/${code}/dispute`, { method: "POST", body: fd });
      setDone(true);
    } catch (x: any) {
      setErr(x.message);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md py-16 text-center space-y-4">
        <div className="box p-6 border-2 border-emerald-600 bg-emerald-600/5 space-y-3">
          <h2 className="text-lg font-bold text-emerald-600">{t("disputeSent")}</h2>
          <p className="text-xs text-neutral-500">
            {lang === "bn"
              ? "অ্যাডমিন সারিতে বিরোধের পর্যালোচনা চলাকালীন সমস্ত এসক্রো তহবিল সাময়িকভাবে স্থগিত (ফ্রিজ) থাকবে।"
              : "Escrow funds are frozen while the dispute is evaluated in the Admin Queue."}
          </p>
          <Link href={`/deal/${code}`} className="btn text-xs inline-block">
            {lang === "bn" ? "ডিলে ফিরে যান →" : "Return to Deal →"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg py-12 px-4 space-y-6">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <Link href={`/deal/${code}`} className="text-xs text-accent hover:underline mb-2 inline-block">
          {lang === "bn" ? `← ডিল #${code}-এ ফিরে যান` : `← Back to Deal #${code}`}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t("reportProblem")}</h1>
        <p className="text-sm text-neutral-500">
          {lang === "bn"
            ? "স্পষ্ট ছবি আপলোড করুন এবং সমস্যার বিবরণ দিন। অ্যাডমিন পর্যালোচনার পূর্বে মাল্টিমোডাল এআই প্রমাণগুলো পরীক্ষা করবে।"
            : "Upload clear photos and describe the issue. Multimodal AI will inspect your evidence for admin review."}
        </p>
      </div>

      <form onSubmit={send} className="box p-6 space-y-4">
        <div>
          <label htmlFor="dispute-reason-textarea">{t("reason")}</label>
          <textarea
            id="dispute-reason-textarea"
            required
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              lang === "bn"
                ? "কী নষ্ট হয়েছে, কী ভুল এসেছে বা কী পাওয়া যায়নি তা বিস্তারিত ব্যাখ্যা করুন..."
                : "Explain what is broken, incorrect, or missing..."
            }
          />
        </div>

        <div>
          <label htmlFor="dispute-photo-upload">{t("photo")}</label>
          <input
            id="dispute-photo-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-xs"
          />
          <span className="text-xs text-neutral-500 mt-1 block">
            {lang === "bn" ? "সর্বোচ্চ ৪ মেগাবাইট (JPEG, PNG, WEBP)।" : "Maximum 4 MB (JPEG, PNG, WEBP)."}
          </span>
        </div>

        {err && <p className="text-xs text-red-600">{err}</p>}

        <button type="submit" disabled={loading} className="btn-danger w-full py-2.5">
          {loading ? t("loading") : t("submit")}
        </button>
      </form>
    </div>
  );
}
