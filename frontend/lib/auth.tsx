"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, getToken, post } from "./api";

export type User = {
  id: number;
  phone: string;
  name: string;
  role: "seller" | "buyer";
  page_name: string;
  page_url: string;
  seller_trust: number;
  buyer_trust: number;
};

type AuthContextType = {
  user: User | null;
  isAdmin: boolean;
  ready: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  switchRole: (role: "seller" | "buyer") => Promise<void>;
};

const Ctx = createContext<AuthContextType>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setAdmin] = useState(false);
  const [ready, setReady] = useState(false);

  async function load() {
    if (!getToken()) {
      setUser(null);
      setAdmin(false);
      setReady(true);
      return;
    }
    try {
      const r = await api("/auth/me");
      setUser(r.user);
      setAdmin(r.is_admin);
    } catch {
      localStorage.removeItem("token");
      setUser(null);
      setAdmin(false);
    }
    setReady(true);
  }

  useEffect(() => {
    load();
  }, []);

  const login = async (token: string) => {
    localStorage.setItem("token", token);
    await load();
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
    setAdmin(false);
  };

  const refresh = async () => {
    await load();
  };

  const switchRole = async (targetRole: "seller" | "buyer") => {
    try {
      const res = await post("/auth/switch-role", { role: targetRole });
      setUser(res.user);
      setAdmin(res.is_admin);
    } catch (err: any) {
      console.error("Failed to switch role:", err.message);
    }
  };

  return (
    <Ctx.Provider value={{ user, isAdmin, ready, login, logout, refresh, switchRole }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
