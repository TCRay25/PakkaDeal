"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import en from "@/messages/en.json";
import bn from "@/messages/bn.json";
import { useSettings, toBengaliDigits } from "./settings";

export type Lang = "en" | "bn";
const dict = { en, bn } as const;
export type Key = keyof typeof en;
const Ctx = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (k: Key | string) => string;
}>(null as any);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("bn");
  const { feePercent, feeMin, confirmHours, shipHours } = useSettings();

  useEffect(() => {
    const s = localStorage.getItem("lang") as Lang | null;
    if (s && (s === "en" || s === "bn")) setLang(s);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem("lang", lang);
  }, [lang]);

  const t = (k: Key | string): string => {
    const cur = (dict[lang] as Record<string, string>)?.[k];
    let res = cur !== undefined && cur !== "" ? cur : (dict.en as Record<string, string>)?.[k];
    if (res === undefined || res === "") return String(k);

    // Dynamic interpolation of live platform settings into translation strings
    if (lang === "bn") {
      const bnFee = toBengaliDigits(feePercent);
      const bnMin = toBengaliDigits(feeMin);
      const bnShip = toBengaliDigits(shipHours);

      res = res
        .replace(/২\.৫%/g, `${bnFee}%`)
        .replace(/২%/g, `${bnFee}%`)
        .replace(/১০ টাকা/g, `${bnMin} টাকা`)
        .replace(/৪৮ ঘণ্টা/g, `${bnShip} ঘণ্টা`);
    } else {
      res = res
        .replace(/2\.5%/g, `${feePercent}%`)
        .replace(/2%/g, `${feePercent}%`)
        .replace(/10 BDT/g, `${feeMin} BDT`)
        .replace(/48 hours/g, `${shipHours} hours`)
        .replace(/48h/g, `${shipHours}h`);
    }

    return res;
  };

  return (
    <Ctx.Provider value={{ lang, setLang, toggle: () => setLang(lang === "bn" ? "en" : "bn"), t }}>
      {children}
    </Ctx.Provider>
  );
}

export const useI18n = () => useContext(Ctx);
