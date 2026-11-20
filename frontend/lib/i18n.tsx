"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import en from "@/messages/en.json";
import bn from "@/messages/bn.json";

type Lang = "en" | "bn";
const dict = { en, bn } as const;
export type Key = keyof typeof en;
const Ctx = createContext<{ lang: Lang; toggle: () => void; t: (k: Key) => string }>(null as any);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("bn");
  useEffect(() => { const s = localStorage.getItem("lang") as Lang | null; if (s) setLang(s); }, []);
  useEffect(() => { document.documentElement.lang = lang; localStorage.setItem("lang", lang); }, [lang]);
  const t = (k: Key) => (dict[lang] as Record<string, string>)[k] ?? k;
  return <Ctx.Provider value={{ lang, toggle: () => setLang(lang === "bn" ? "en" : "bn"), t }}>{children}</Ctx.Provider>;
}
export const useI18n = () => useContext(Ctx);
