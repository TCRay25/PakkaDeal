"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api";
import { useSocket } from "./socket";

export type PublicSettings = {
  platform_fee_percent: string;
  platform_fee_min: string;
  min_delivery_deposit: string;
  refusal_review_hours: string;
  confirm_window_hours: string;
  ship_within_hours: string;
  return_deduct_shipping: string;
  escrow_bkash_merchant: string;
  escrow_nagad_merchant: string;
  escrow_rocket_merchant: string;
  escrow_bank_name: string;
  escrow_bank_account: string;
  escrow_payment_instructions: string;
  [key: string]: string;
};

export const DEFAULT_PUBLIC_SETTINGS: PublicSettings = {
  platform_fee_percent: "1",
  platform_fee_min: "10",
  min_delivery_deposit: "60",
  refusal_review_hours: "24",
  confirm_window_hours: "72",
  ship_within_hours: "48",
  return_deduct_shipping: "true",
  escrow_bkash_merchant: "01711-000000",
  escrow_nagad_merchant: "01911-000000",
  escrow_rocket_merchant: "01811-000000",
  escrow_bank_name: "City Bank Ltd (Gulshan Branch)",
  escrow_bank_account: "PakkaDeal Escrow Services Ltd (A/C: 150239482001)",
  escrow_payment_instructions:
    "বিকাশ বা নগদ অ্যাপের 'Make Payment' অপশন থেকে পাক্কাডিল অফিসিয়াল এসক্রো মার্চেন্ট নাম্বারে সম্পূর্ণ টাকা পেমেন্ট করুন। এরপর প্রাপ্ত Transaction ID (TrxID) এবং আপনার প্রেরক নম্বর নিচে বসিয়ে কনফার্ম করুন। টাকা সরাসরি পাক্কা ডিল এসক্রো ভল্টে সুরক্ষিত থাকবে।",
};

export function toBengaliDigits(n: number | string): string {
  const bn = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return String(n).replace(/[0-9]/g, (d) => bn[Number(d)]);
}

type SettingsContextType = {
  settings: PublicSettings;
  feePercent: number;
  feeMin: number;
  minDeliveryDeposit: number;
  confirmHours: number;
  shipHours: number;
  calculateFee: (amount: number) => number;
  formatFeePercent: (lang?: string) => string;
  formatFeeMin: (lang?: string) => string;
  refreshSettings: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextType>({
  settings: DEFAULT_PUBLIC_SETTINGS,
  feePercent: 1,
  feeMin: 10,
  minDeliveryDeposit: 60,
  confirmHours: 72,
  shipHours: 48,
  calculateFee: (amount: number) => Math.max(10, Math.round((amount * 1) / 100)),
  formatFeePercent: (lang?: string) => (lang === "bn" ? "১%" : "1%"),
  formatFeeMin: (lang?: string) => (lang === "bn" ? "১০ টাকা" : "10 BDT"),
  refreshSettings: async () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<PublicSettings>(DEFAULT_PUBLIC_SETTINGS);
  const { on } = useSocket();

  const loadSettings = useCallback(async () => {
    try {
      const data = await api<PublicSettings>("/settings/public");
      if (data && typeof data === "object") {
        setSettings((prev) => ({ ...prev, ...data }));
      }
    } catch {
      // Keep existing settings if request fails
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Real-time update via Socket.IO
  useEffect(() => {
    const unsub = on("settings:updated", (newSettings: PublicSettings) => {
      if (newSettings && typeof newSettings === "object") {
        setSettings((prev) => ({ ...prev, ...newSettings }));
      }
    });
    return () => {
      unsub();
    };
  }, [on]);

  const rawFee = Number(settings.platform_fee_percent);
  const feePercent = !isNaN(rawFee) && settings.platform_fee_percent !== "" ? rawFee : 1;
  const rawMin = Number(settings.platform_fee_min);
  const feeMin = !isNaN(rawMin) && settings.platform_fee_min !== "" ? rawMin : 10;
  const rawMinDeposit = Number(settings.min_delivery_deposit);
  const minDeliveryDeposit = !isNaN(rawMinDeposit) && settings.min_delivery_deposit !== "" ? rawMinDeposit : 60;
  const confirmHours = Number(settings.confirm_window_hours) || 72;
  const shipHours = Number(settings.ship_within_hours) || 48;

  const calculateFee = useCallback(
    (amount: number) => {
      if (!amount || amount <= 0) return 0;
      const calculated = Math.round((Number(amount) * feePercent) / 100);
      return Math.max(calculated, feeMin);
    },
    [feePercent, feeMin]
  );

  const formatFeePercent = useCallback(
    (lang?: string) => {
      return lang === "bn" ? `${toBengaliDigits(feePercent)}%` : `${feePercent}%`;
    },
    [feePercent]
  );

  const formatFeeMin = useCallback(
    (lang?: string) => {
      return lang === "bn" ? `${toBengaliDigits(feeMin)} টাকা` : `${feeMin} BDT`;
    },
    [feeMin]
  );

  return (
    <SettingsContext.Provider
      value={{
        settings,
        feePercent,
        feeMin,
        minDeliveryDeposit,
        confirmHours,
        shipHours,
        calculateFee,
        formatFeePercent,
        formatFeeMin,
        refreshSettings: loadSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
