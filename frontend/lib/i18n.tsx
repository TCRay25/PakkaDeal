"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import en from "@/messages/en.json";
import bn from "@/messages/bn.json";

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
    if (cur !== undefined && cur !== "") return cur;
    const fallback = (dict.en as Record<string, string>)?.[k];
    if (fallback !== undefined && fallback !== "") return fallback;
    return String(k);
  };

  return (
    <Ctx.Provider value={{ lang, setLang, toggle: () => setLang(lang === "bn" ? "en" : "bn"), t }}>
      {children}
    </Ctx.Provider>
  );
}

export const useI18n = () => useContext(Ctx);
