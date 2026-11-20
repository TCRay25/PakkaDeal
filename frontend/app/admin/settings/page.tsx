"use client";
import { useEffect, useState } from "react";
import { api, patch, SettingItem } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function AdminSettingsPage() {
  const { t } = useI18n();
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
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (x: any) {
      setErr(x.message || "Failed to update settings");
    }
  };

  return (
    <div className="max-w-3xl space-y-8">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("settingsTitle")}</h1>
        <p className="text-sm text-neutral-500">
          Configure deterministic escrow parameters, platform fee percentages, timeouts, and return rules.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="box p-6 border border-neutral-200 dark:border-neutral-800 space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200 border-b border-neutral-200 dark:border-neutral-800 pb-2">
              Fee & Revenue Parameters
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
                  value={settings["platform_fee_percent"] || "2"}
                  onChange={(e) => handleChange("platform_fee_percent", e.target.value)}
                  className="font-mono text-sm"
                />
                <span className="text-xs text-neutral-500 mt-1 block">Default 2%. Deducted from seller payout.</span>
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
                <span className="text-xs text-neutral-500 mt-1 block">Floor minimum per transaction.</span>
              </div>
            </div>
          </div>

          <div className="box p-6 border border-neutral-200 dark:border-neutral-800 space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200 border-b border-neutral-200 dark:border-neutral-800 pb-2">
              Escrow Windows & Timeout Automation
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
                  Time buyer has to inspect item after courier delivery before automatic payout release. Default 72h (3 days).
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
                  Time seller has to dispatch package with courier tracking after payment before automatic full buyer refund. Default 48h.
                </span>
              </div>
            </div>
          </div>

          {/* Compliance & Regulatory Disclaimer */}
          <div className="box p-5 border border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 space-y-2 text-xs">
            <strong className="block text-amber-900 dark:text-amber-200 uppercase tracking-wide">
              Bangladesh Bank Regulatory Compliance Protocol
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
