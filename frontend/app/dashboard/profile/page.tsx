"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, patch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { toBengaliDigits } from "@/lib/settings";
import { validateBkashNumber } from "@/lib/firebaseAuthHelper";

type ProfileStats = {
  user: any;
  buyer_stats: {
    delivered: number;
    refused: number;
    disputes: number;
    refunded: number;
    trust_score: number;
  };
  seller_stats: {
    completed: number;
    refused: number;
    disputes: number;
    active_deals: number;
  };
};

export default function ProfilePage() {
  const { t, lang } = useI18n();
  const { user, refresh } = useAuth();
  const [data, setData] = useState<ProfileStats | null>(null);
  const [name, setName] = useState("");
  const [pageName, setPageName] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [bkashNumber, setBkashNumber] = useState("");
  const [bkashType, setBkashType] = useState<"Personal" | "Merchant" | "Agent">("Personal");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  const loadData = () => {
    setLoading(true);
    api<ProfileStats>("/profiles/me")
      .then((res) => {
        setData(res);
        setName(res.user.name || "");
        setPageName(res.user.page_name || "");
        setPageUrl(res.user.page_url || "");
        setBkashNumber(res.user.bkash_number || "");
        setBkashType(res.user.bkash_type || "Personal");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");

    if (bkashNumber.trim() && !validateBkashNumber(bkashNumber)) {
      setErr(
        lang === "bn"
          ? "সঠিক ১১-সংখ্যার বিকাশ নম্বর লিখুন (যেমন: 017XXXXXXXX)"
          : "Please enter a valid 11-digit bKash number (e.g. 017XXXXXXXX)"
      );
      return;
    }

    try {
      await patch("/profiles/me", {
        name,
        page_name: pageName,
        page_url: pageUrl,
        bkash_number: bkashNumber.trim(),
        bkash_type: bkashType,
      });
      await refresh();
      loadData();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (x: any) {
      setErr(x.message || "Failed to update profile");
    }
  };

  if (!user && loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      </div>
    );
  }

  const currentUser = data?.user || user;
  const trustScore = Math.max(currentUser?.seller_trust || 70, currentUser?.buyer_trust || 60, 70);
  const totalCompleted = (data?.seller_stats?.completed || 0) + (data?.buyer_stats?.delivered || 0);
  const totalRefused = (data?.seller_stats?.refused || 0) + (data?.buyer_stats?.refused || 0);
  const totalDisputes = (data?.seller_stats?.disputes || 0) + (data?.buyer_stats?.disputes || 0);

  const isBkashValid = validateBkashNumber(bkashNumber);
  const isBkashVerified = Boolean(currentUser?.bkash_verified);

  return (
    <div className="max-w-4xl space-y-8">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("profile")}</h1>
        <p className="text-sm text-neutral-500">{t("profileSub")}</p>
      </div>

      {/* Account Profile Card */}
      <div className="box p-6 border-2 border-accent bg-accent/5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs uppercase font-bold text-accent">{t("verifiedAccount")}</span>
              {isBkashVerified ? (
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  {t("bkashVerifiedBadge")}
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  {t("bkashPendingBadge")}
                </span>
              )}
            </div>

            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
              {currentUser?.name || currentUser?.page_name || t("profile")}
            </h2>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400 font-mono">
              {currentUser?.email && <div>✉ {currentUser.email}</div>}
              <div>
                bKash: <strong>{currentUser?.bkash_number || (lang === "bn" ? "নির্ধারিত নেই" : "Not set")}</strong> (
                {currentUser?.bkash_type || "Personal"})
              </div>
            </div>
          </div>

          <div className="box p-3 border border-accent bg-white dark:bg-black text-center min-w-[120px]">
            <span className="text-xs uppercase font-bold text-neutral-500 block">{t("trust")}</span>
            <div className="text-2xl font-extrabold font-mono text-accent">
              {lang === "bn" ? toBengaliDigits(trustScore) : trustScore} / {lang === "bn" ? "১০০" : "100"}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="p-3 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black">
            <span className="text-xs text-neutral-500 block uppercase">{t("completedDeals")}</span>
            <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {lang === "bn" ? toBengaliDigits(totalCompleted) : totalCompleted}
            </span>
          </div>
          <div className="p-3 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black">
            <span className="text-xs text-neutral-500 block uppercase">{t("doorstepRefusals")}</span>
            <span className="text-lg font-bold font-mono text-neutral-600 dark:text-neutral-400">
              {lang === "bn" ? toBengaliDigits(totalRefused) : totalRefused}
            </span>
          </div>
          <div className="p-3 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black">
            <span className="text-xs text-neutral-500 block uppercase">{t("disputes")}</span>
            <span className="text-lg font-bold font-mono text-neutral-600 dark:text-neutral-400">
              {lang === "bn" ? toBengaliDigits(totalDisputes) : totalDisputes}
            </span>
          </div>
          <div className="p-3 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black">
            <span className="text-xs text-neutral-500 block uppercase">{t("publicLink")}</span>
            <Link href={`/seller/${currentUser?.id}`} className="text-xs font-semibold text-accent hover:underline block pt-1">
              {t("viewShopProfile")}
            </Link>
          </div>
        </div>
      </div>

      {/* Edit Profile Form */}
      <div className="box p-6 border border-neutral-200 dark:border-neutral-800 space-y-6">
        <div className="border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <h2 className="text-lg font-bold tracking-tight">{t("editProfileInfo")}</h2>
          <p className="text-xs text-neutral-500">
            {lang === "bn"
              ? "আপনার বিকাশ অ্যাকাউন্ট ও শপ প্রোফাইল সম্পর্কিত তথ্য আপডেট করুন।"
              : "Update your bKash payout details and shop profile information."}
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4 max-w-xl">
          <div>
            <label htmlFor="edit-name-input">{t("fullName")}</label>
            <input
              id="edit-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={lang === "bn" ? "যেমন: রহিম চৌধুরী" : "e.g. Rahim Chowdhury"}
            />
          </div>

          {/* bKash Number & Verification Alert */}
          <div className="p-4 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-bold text-neutral-700 dark:text-neutral-300">
                {lang === "bn" ? "বিকাশ পেআউট অ্যাকাউন্ট" : "bKash Payout Account"}
              </span>
              {isBkashVerified ? (
                <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                  ✓ {lang === "bn" ? "অ্যাডমিন ভেরিফাইড" : "Admin Verified"}
                </span>
              ) : (
                <span className="text-xs text-amber-600 font-semibold flex items-center gap-1">
                  ⏳ {lang === "bn" ? "যাচাই প্রক্রিয়াধীন" : "Pending Verification"}
                </span>
              )}
            </div>

            <div>
              <label htmlFor="edit-bkash-number">{t("bkashNumber")}</label>
              <input
                id="edit-bkash-number"
                inputMode="tel"
                value={bkashNumber}
                onChange={(e) => {
                  setBkashNumber(e.target.value.replace(/\s+/g, ""));
                  if (err) setErr("");
                }}
                placeholder="01XXXXXXXXX"
                className="font-mono"
              />
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-neutral-500">{t("bkashNumberHelp")}</span>
                {bkashNumber.trim() && (
                  <span
                    className={`font-mono font-semibold ${
                      isBkashValid ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
                    }`}
                  >
                    {isBkashValid
                      ? lang === "bn"
                        ? "✓ সঠিক ফরম্যাট"
                        : "✓ Valid"
                      : lang === "bn"
                      ? "✗ ভুল ফরম্যাট"
                      : "✗ Invalid"}
                  </span>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="edit-bkash-type">{t("bkashType")}</label>
              <select
                id="edit-bkash-type"
                value={bkashType}
                onChange={(e) => setBkashType(e.target.value as any)}
              >
                <option value="Personal">{t("bkashPersonal")}</option>
                <option value="Merchant">{t("bkashMerchant")}</option>
                <option value="Agent">{t("bkashAgent")}</option>
              </select>
            </div>

            {/* Requirement 5 Notice: Editing resets bkashVerified to false */}
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs leading-relaxed">
              <strong>⚠️ {lang === "bn" ? "সতর্কতা:" : "Notice:"}</strong> {t("bkashEditNotice")}
            </div>
          </div>

          <div>
            <label htmlFor="edit-page-name-input">
              {t("pageName")} {lang === "bn" ? "(ঐচ্ছিক)" : "(Optional)"}
            </label>
            <input
              id="edit-page-name-input"
              value={pageName}
              onChange={(e) => setPageName(e.target.value)}
              placeholder={lang === "bn" ? "যেমন: গ্যাজেট কর্নার বিডি" : "e.g. Gadget Corner BD"}
            />
          </div>

          <div>
            <label htmlFor="edit-page-url-input">
              {t("pageUrl")} {lang === "bn" ? "(ঐচ্ছিক)" : "(Optional)"}
            </label>
            <input
              id="edit-page-url-input"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              placeholder={lang === "bn" ? "যেমন: facebook.com/gadgetcornerbd" : "e.g. facebook.com/gadgetcornerbd"}
            />
          </div>

          {err && <p className="text-xs text-red-600">{err}</p>}
          {saved && <p className="text-xs text-emerald-600 font-semibold">{t("saved")}</p>}

          <button type="submit" className="btn text-sm">
            {t("save")}
          </button>
        </form>
      </div>
    </div>
  );
}
