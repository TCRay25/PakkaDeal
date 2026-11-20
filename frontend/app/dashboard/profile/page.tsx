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
  const { user, refresh, switchRole } = useAuth();
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

  if (!user || loading) return null;

  return (
    <div className="max-w-4xl space-y-8">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("myProfile")}</h1>
          <p className="text-sm text-neutral-500">
            Every PakkaDeal account includes both a verified Buyer profile and Seller profile.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">Active Profile:</span>
          <button
            onClick={() => switchRole(user.role === "seller" ? "buyer" : "seller")}
            className="btn text-xs py-1.5 px-3"
          >
            Switch to {user.role === "seller" ? t("roleBuyer") : t("roleSeller")}
          </button>
        </div>
      </div>

      {/* Dual Profiles Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Seller Profile Card */}
        <div className={`box p-6 border-2 space-y-4 ${
          user.role === "seller" ? "border-accent bg-accent/5" : "border-neutral-200 dark:border-neutral-800"
        }`}>
          <div className="flex justify-between items-center border-b border-neutral-200 dark:border-neutral-800 pb-3">
            <div>
              <span className="text-xs uppercase font-bold text-accent block">Business / Merchant</span>
              <h2 className="text-lg font-bold">{t("sellerProfile")}</h2>
            </div>
            <div className="text-right">
              <span className="text-xs text-neutral-500 uppercase block">Trust Score</span>
              <span className="text-xl font-bold font-mono text-accent">{user.seller_trust} / 100</span>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500">{t("pageName")}:</span>
              <span className="font-semibold">{user.page_name || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">{t("pageUrl")}:</span>
              <span className="font-mono text-xs truncate max-w-[200px] text-accent">
                {user.page_url ? (
                  <a href={user.page_url.startsWith("http") ? user.page_url : `https://${user.page_url}`} target="_blank" rel="noreferrer">
                    {user.page_url}
                  </a>
                ) : (
                  "—"
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Completed Orders:</span>
              <span className="font-mono">{data?.seller_stats.completed || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Customer Refusals:</span>
              <span className="font-mono">{data?.seller_stats.refused || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Disputes Incurred:</span>
              <span className="font-mono">{data?.seller_stats.disputes || 0}</span>
            </div>
          </div>

          <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800">
            <Link
              href={`/seller/${user.id}`}
              className="btn-ghost text-xs w-full justify-center"
            >
              Preview Public Seller Page →
            </Link>
          </div>
        </div>

        {/* Buyer Profile Card */}
        <div className={`box p-6 border-2 space-y-4 ${
          user.role === "buyer" ? "border-emerald-600 bg-emerald-600/5" : "border-neutral-200 dark:border-neutral-800"
        }`}>
          <div className="flex justify-between items-center border-b border-neutral-200 dark:border-neutral-800 pb-3">
            <div>
              <span className="text-xs uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Personal</span>
              <h2 className="text-lg font-bold">{t("buyerProfile")}</h2>
            </div>
            <div className="text-right">
              <span className="text-xs text-neutral-500 uppercase block">Trust Score</span>
              <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {data?.buyer_stats.trust_score ?? user.buyer_trust} / 100
              </span>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500">{t("phone")}:</span>
              <span className="font-mono font-semibold">{user.phone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">{t("deliveredCount")}:</span>
              <span className="font-mono font-semibold">{data?.buyer_stats.delivered || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">{t("refusedCount")}:</span>
              <span className="font-mono">{data?.buyer_stats.refused || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">{t("disputesCount")}:</span>
              <span className="font-mono">{data?.buyer_stats.disputes || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Perks:</span>
              <span className="text-xs font-semibold text-accent">
                {(data?.buyer_stats.trust_score ?? user.buyer_trust) >= 85
                  ? "Deposit Waived on Small Orders"
                  : (data?.buyer_stats.trust_score ?? user.buyer_trust) >= 70
                  ? "50% Reduced Escrow Deposit"
                  : "Standard Deposit Rules"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Profile Form */}
      <div className="box p-6 border border-neutral-200 dark:border-neutral-800 space-y-6">
        <h2 className="text-lg font-bold tracking-tight">Edit Profile & Shop Information</h2>

        <form onSubmit={handleSave} className="space-y-4 max-w-xl">
          <div>
            <label htmlFor="profile-name-input">Your Full Name</label>
            <input
              id="profile-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rahim Chowdhury"
            />
          </div>

          <div>
            <label htmlFor="profile-page-name-input">{t("pageName")}</label>
            <input
              id="profile-page-name-input"
              value={pageName}
              onChange={(e) => setPageName(e.target.value)}
              placeholder="e.g. Gadget Corner BD or Dhanmondi Rentals"
            />
          </div>

          <div>
            <label htmlFor="profile-page-url-input">{t("pageUrl")}</label>
            <input
              id="profile-page-url-input"
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
