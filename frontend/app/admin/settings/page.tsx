"use client";
import { useEffect, useState } from "react";
import { api, patch, SettingItem } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";

export default function AdminSettingsPage() {
  const { t, lang } = useI18n();
  const { refreshSettings } = useSettings();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api<SettingItem[]>("/admin/settings")
      .then((items) => {
        const map: Record<string, string> = {};
        for (const item of items) {
          map[item.key] = item.value;
        }
        setSettings(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (key: string, val: string) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      await patch("/admin/settings", settings);
      await refreshSettings();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (x: any) {
      setErr(x.message || (lang === "bn" ? "সেটিংস সংরক্ষণ ব্যর্থ হয়েছে" : "Failed to update settings"));
    }
  };

  return (
    <div className="max-w-3xl space-y-8">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("settingsTitle")}</h1>
        <p className="text-sm text-neutral-500">
          {lang === "bn"
            ? "এসক্রো প্যারামিটার, প্ল্যাটফর্ম ফি শতাংশ, টাইমআউট এবং রিটার্ন নীতিমালা কনফিগার করুন।"
            : "Configure deterministic escrow parameters, platform fee percentages, timeouts, and return rules."}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Escrow Merchant & Payment Gateway Numbers */}
          <div className="box p-6 border-2 border-accent bg-accent/5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-2">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100">
                  {t("officialEscrowAccountsTitle")}
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {t("officialEscrowAccountsSub")}
                </p>
              </div>
              <span className="px-2 py-0.5 text-xs bg-accent text-white font-mono font-bold">
                {lang === "bn" ? "এসক্রো ভল্ট" : "Escrow Vault"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="escrow-bkash-merchant">{t("bkashMerchantLabel")}</label>
                <input
                  id="escrow-bkash-merchant"
                  value={settings["escrow_bkash_merchant"] || "01711-000000"}
                  onChange={(e) => handleChange("escrow_bkash_merchant", e.target.value)}
                  placeholder="01711-000000"
                  className="font-mono text-sm bg-white dark:bg-black"
                />
                <span className="text-[11px] text-neutral-500 mt-1 block">{t("bkashMerchantHelp")}</span>
              </div>

              <div>
                <label htmlFor="escrow-nagad-merchant">{t("nagadMerchantLabel")}</label>
                <input
                  id="escrow-nagad-merchant"
                  value={settings["escrow_nagad_merchant"] || "01911-000000"}
                  onChange={(e) => handleChange("escrow_nagad_merchant", e.target.value)}
                  placeholder="01911-000000"
                  className="font-mono text-sm bg-white dark:bg-black"
                />
                <span className="text-[11px] text-neutral-500 mt-1 block">{t("nagadMerchantHelp")}</span>
              </div>

              <div>
                <label htmlFor="escrow-rocket-merchant">{t("rocketMerchantLabel")}</label>
                <input
                  id="escrow-rocket-merchant"
                  value={settings["escrow_rocket_merchant"] || "01811-000000"}
                  onChange={(e) => handleChange("escrow_rocket_merchant", e.target.value)}
                  placeholder="01811-000000"
                  className="font-mono text-sm bg-white dark:bg-black"
                />
                <span className="text-[11px] text-neutral-500 mt-1 block">{t("rocketMerchantHelp")}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <div>
                <label htmlFor="escrow-bank-name">{t("bankPartnerName")}</label>
                <input
                  id="escrow-bank-name"
                  value={settings["escrow_bank_name"] || "City Bank Ltd (Gulshan Branch)"}
                  onChange={(e) => handleChange("escrow_bank_name", e.target.value)}
                  placeholder="e.g. City Bank Ltd"
                  className="text-sm bg-white dark:bg-black"
                />
              </div>

              <div>
                <label htmlFor="escrow-bank-account">{t("bankAccountDetails")}</label>
                <input
                  id="escrow-bank-account"
                  value={settings["escrow_bank_account"] || "PakkaDeal Escrow Services Ltd (A/C: 150239482001)"}
                  onChange={(e) => handleChange("escrow_bank_account", e.target.value)}
                  placeholder="Company name, A/C number & branch"
                  className="font-mono text-sm bg-white dark:bg-black"
                />
              </div>
            </div>

            <div>
              <label htmlFor="escrow-instructions">{t("buyerCheckoutInstructions")}</label>
              <textarea
                id="escrow-instructions"
                rows={2}
                value={settings["escrow_payment_instructions"] || "বিকাশ বা নগদ অ্যাপের 'Make Payment' অপশন থেকে পাক্কাডিল অফিসিয়াল এসক্রো মার্চেন্ট নাম্বারে সম্পূর্ণ টাকা পেমেন্ট করুন। এরপর প্রাপ্ত Transaction ID (TrxID) এবং আপনার প্রেরক নম্বর নিচে বসিয়ে কনফার্ম করুন। টাকা সরাসরি পাক্কা ডিল এসক্রো ভল্টে সুরক্ষিত থাকবে।"}
                onChange={(e) => handleChange("escrow_payment_instructions", e.target.value)}
                className="text-xs bg-white dark:bg-black"
              />
              <span className="text-[11px] text-neutral-500 mt-0.5 block">{t("officialMerchantNumber")}</span>
            </div>
          </div>

          <div className="box p-6 border border-neutral-200 dark:border-neutral-800 space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200 border-b border-neutral-200 dark:border-neutral-800 pb-2">
              {lang === "bn" ? "ফি ও প্ল্যাটফর্ম আয় নির্ধারণ" : "Fee & Revenue Parameters"}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="platform-fee-percent-input">{t("feePercentSetting")}</label>
                <input
                  id="platform-fee-percent-input"
                  type="number"
                  step="0.1"
                  min="0"
                  max="20"
                  value={settings["platform_fee_percent"] !== undefined && settings["platform_fee_percent"] !== "" ? settings["platform_fee_percent"] : "1"}
                  onChange={(e) => handleChange("platform_fee_percent", e.target.value)}
                  className="font-mono text-sm"
                />
                <span className="text-xs text-neutral-500 mt-1 block">
                  {lang === "bn" ? "ক্রেতার এসক্রো ডিপোজিটের সাথে যুক্ত সার্ভিস ফি শতাংশ (ডিফল্ট ১%)।" : "Escrow service fee percentage added at buyer checkout (default 1%)."}
                </span>
              </div>

              <div>
                <label htmlFor="platform-fee-min-input">{t("feeMinSetting")}</label>
                <input
                  id="platform-fee-min-input"
                  type="number"
                  min="0"
                  value={settings["platform_fee_min"] || "10"}
                  onChange={(e) => handleChange("platform_fee_min", e.target.value)}
                  className="font-mono text-sm"
                />
                <span className="text-xs text-neutral-500 mt-1 block">
                  {lang === "bn" ? "প্রতি ট্রানজ্যাকশনে সর্বনিম্ন প্ল্যাটফর্ম ফি।" : "Floor minimum per transaction."}
                </span>
              </div>
            </div>
          </div>

          <div className="box p-6 border border-neutral-200 dark:border-neutral-800 space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200 border-b border-neutral-200 dark:border-neutral-800 pb-2">
              {lang === "bn" ? "এসক্রো সময়সীমা ও স্বয়ংক্রিয় টাইমআউট" : "Escrow Windows & Timeout Automation"}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="confirm-window-hours-input">{t("confirmHoursSetting")}</label>
                <input
                  id="confirm-window-hours-input"
                  type="number"
                  min="1"
                  value={settings["confirm_window_hours"] || "72"}
                  onChange={(e) => handleChange("confirm_window_hours", e.target.value)}
                  className="font-mono text-sm"
                />
                <span className="text-xs text-neutral-500 mt-1 block">
                  {lang === "bn"
                    ? "কুরিয়ার ডেলিভারির পর স্বয়ংক্রিয় পেআউট রিলিজের পূর্বে ক্রেতার পণ্য যাচাইয়ের সময়সীমা। ডিফল্ট ৭২ ঘণ্টা (৩ দিন)।"
                    : "Time buyer has to inspect item after courier delivery before automatic payout release. Default 72h (3 days)."}
                </span>
              </div>

              <div>
                <label htmlFor="ship-within-hours-input">{t("shipHoursSetting")}</label>
                <input
                  id="ship-within-hours-input"
                  type="number"
                  min="1"
                  value={settings["ship_within_hours"] || "48"}
                  onChange={(e) => handleChange("ship_within_hours", e.target.value)}
                  className="font-mono text-sm"
                />
                <span className="text-xs text-neutral-500 mt-1 block">
                  {lang === "bn"
                    ? "পেমেন্ট নিশ্চিতের পর সম্পূর্ণ রিফান্ডের পূর্বে বিক্রেতার কুরিয়ার ট্র্যাকিং প্রদানের সময়সীমা। ডিফল্ট ৪৮ ঘণ্টা।"
                    : "Time seller has to dispatch package with courier tracking after payment before automatic full buyer refund. Default 48h."}
                </span>
              </div>
            </div>
          </div>

          {/* Compliance & Regulatory Disclaimer */}
          <div className="box p-5 border border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 space-y-2 text-xs">
            <strong className="block text-amber-900 dark:text-amber-200 uppercase tracking-wide">
              {lang === "bn" ? "বাংলাদেশ ব্যাংক নিয়ন্ত্রক সম্মতি প্রটোকল" : "Bangladesh Bank Regulatory Compliance Protocol"}
            </strong>
            <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
              {t("regulatoryNotice")}
            </p>
          </div>

          {err && <p className="text-xs text-red-600">{err}</p>}
          {saved && <p className="text-xs text-emerald-600 font-semibold">{t("saved")}</p>}

          <button type="submit" className="btn px-6 py-2.5 text-sm">
            {t("saveSettings")}
          </button>
        </form>
      )}
    </div>
  );
}
