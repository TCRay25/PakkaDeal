"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, patch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

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
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const [data, setData] = useState<ProfileStats | null>(null);
  const [name, setName] = useState("");
  const [pageName, setPageName] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api<ProfileStats>("/profiles/me")
      .then((res) => {
        setData(res);
        setName(res.user.name || "");
        setPageName(res.user.page_name || "");
        setPageUrl(res.user.page_url || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      await patch("/profiles/me", { name, page_name: pageName, page_url: pageUrl });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (x: any) {
      setErr(x.message || "Failed to update profile");
    }
  };

  if (!user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      </div>
    );
  }

  const trustScore = Math.max(user.seller_trust || 70, user.buyer_trust || 60, 70);
  const totalCompleted = (data?.seller_stats?.completed || 0) + (data?.buyer_stats?.delivered || 0);
  const totalRefused = (data?.seller_stats?.refused || 0) + (data?.buyer_stats?.refused || 0);
  const totalDisputes = (data?.seller_stats?.disputes || 0) + (data?.buyer_stats?.disputes || 0);

  return (
    <div className="max-w-4xl space-y-8">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("profile")}</h1>
        <p className="text-sm text-neutral-500">
          {t("profileSub")}
        </p>
      </div>

      {/* Account Profile Card */}
      <div className="box p-6 border-2 border-accent bg-accent/5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-4">
          <div className="space-y-1">
            <span className="text-xs uppercase font-bold text-accent">{t("verifiedAccount")}</span>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
              {user.name || user.page_name || t("profile")}
            </h2>
            <div className="font-mono text-sm text-neutral-500">{user.phone}</div>
          </div>

          <div className="box p-3 border border-accent bg-white dark:bg-black text-center min-w-[120px]">
            <span className="text-xs uppercase font-bold text-neutral-500 block">{t("trust")}</span>
            <div className="text-2xl font-extrabold font-mono text-accent">{trustScore} / 100</div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="p-3 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black">
            <span className="text-xs text-neutral-500 block uppercase">{t("completedDeals")}</span>
            <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">{totalCompleted}</span>
          </div>
          <div className="p-3 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black">
            <span className="text-xs text-neutral-500 block uppercase">{t("doorstepRefusals")}</span>
            <span className="text-lg font-bold font-mono text-neutral-600 dark:text-neutral-400">{totalRefused}</span>
          </div>
          <div className="p-3 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black">
            <span className="text-xs text-neutral-500 block uppercase">{t("disputes")}</span>
            <span className="text-lg font-bold font-mono text-neutral-600 dark:text-neutral-400">{totalDisputes}</span>
          </div>
          <div className="p-3 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black">
            <span className="text-xs text-neutral-500 block uppercase">{t("publicLink")}</span>
            <Link href={`/seller/${user.id}`} className="text-xs font-semibold text-accent hover:underline block pt-1">
              {t("viewShopProfile")}
            </Link>
          </div>
        </div>
      </div>

      {/* Edit Profile Form */}
      <div className="box p-6 border border-neutral-200 dark:border-neutral-800 space-y-6">
        <h2 className="text-lg font-bold tracking-tight">{t("editProfileInfo")}</h2>

        <form onSubmit={handleSave} className="space-y-4 max-w-xl">
          <div>
            <label htmlFor="edit-name-input">{t("fullName")}</label>
            <input
              id="edit-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rahim Chowdhury"
            />
          </div>

          <div>
            <label htmlFor="edit-page-name-input">{t("pageName")} (Optional)</label>
            <input
              id="edit-page-name-input"
              value={pageName}
              onChange={(e) => setPageName(e.target.value)}
              placeholder="e.g. Gadget Corner BD"
            />
          </div>

          <div>
            <label htmlFor="edit-page-url-input">{t("pageUrl")} (Optional)</label>
            <input
              id="edit-page-url-input"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              placeholder="e.g. facebook.com/gadgetcornerbd"
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
