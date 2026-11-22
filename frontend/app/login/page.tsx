"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { post } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

export default function Login() {
  const { t, lang } = useI18n();
  const { login } = useAuth();
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [isDemo, setIsDemo] = useState(false);
  const [devOtp, setDevOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  async function sendOtp(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const res = await post<{
        sent: boolean;
        is_demo?: boolean;
        demo_otp?: string;
        dev_otp?: string;
        message: string;
      }>("/auth/send-otp", { phone });
      setStep("otp");
      setIsDemo(Boolean(res.is_demo));
      if (res.is_demo && res.demo_otp) {
        setOtp(res.demo_otp);
      } else {
        setOtp("");
        if (res.dev_otp) setDevOtp(res.dev_otp);
      }
    } catch (x: any) {
      setErr(x.message || "Failed to send code");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setErr("");
    setResending(true);
    try {
      const res = await post<{
        sent: boolean;
        is_demo?: boolean;
        demo_otp?: string;
        dev_otp?: string;
        message: string;
      }>("/auth/send-otp", { phone });
      if (res.is_demo && res.demo_otp) {
        setOtp(res.demo_otp);
      } else {
        setOtp("");
        if (res.dev_otp) setDevOtp(res.dev_otp);
      }
      alert(res.message || (lang === "bn" ? "নতুন ওটিপি পাঠানো হয়েছে।" : "New OTP sent."));
    } catch (x: any) {
      setErr(x.message || "Failed to resend code");
    } finally {
      setResending(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const r = await post("/auth/verify", { phone, otp, name });
      await login(r.token);
      if (r.is_admin) {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
    } catch (x: any) {
      setErr(x.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  function quickFill(quickPhone: string, quickName: string) {
    setPhone(quickPhone);
    setName(quickName);
    setErr("");
  }

  return (
    <div className="mx-auto max-w-md py-12 px-4 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{t("login")}</h1>
        <p className="text-sm text-neutral-500">
          {t("loginSub")}
        </p>
      </div>

      {/* Quick Demo Logins */}
      <div className="box p-4 bg-neutral-50 dark:bg-neutral-900 space-y-2 border border-neutral-300 dark:border-neutral-700">
        <div className="text-xs uppercase font-bold text-neutral-500 tracking-wider">
          {t("demoAccounts")}
        </div>
        <div className="grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={() => quickFill("01711223344", "Rahim Chowdhury")}
            className="btn-ghost text-xs justify-between w-full"
          >
            <span>Rahim Chowdhury</span>
            <span className="font-mono text-neutral-400">01711223344</span>
          </button>
          <button
            type="button"
            onClick={() => quickFill("01755667788", "Nusrat Jahan")}
            className="btn-ghost text-xs justify-between w-full"
          >
            <span>Nusrat Jahan</span>
            <span className="font-mono text-neutral-400">01755667788</span>
          </button>
          <button
            type="button"
            onClick={() => quickFill("01700000000", "PakkaDeal Admin")}
            className="btn-ghost text-xs justify-between w-full border-accent/40"
          >
            <span className="font-semibold text-accent">{t("loginQuickAdmin")}</span>
            <span className="font-mono text-neutral-400">01700000000</span>
          </button>
        </div>
      </div>

      {step === "phone" ? (
        <form onSubmit={sendOtp} className="box space-y-4">
          <div>
            <label htmlFor="login-name-input">{t("yourName")} ({t("shopOrgNameOptional")})</label>
            <input
              id="login-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rahim Chowdhury"
            />
          </div>

          <div>
            <label htmlFor="login-phone-input">{t("phone")}</label>
            <input
              id="login-phone-input"
              required
              inputMode="tel"
              placeholder="01XXXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="font-mono"
            />
          </div>

          {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}

          <button type="submit" disabled={loading} className="btn w-full">
            {loading ? t("loading") : t("sendCode")}
          </button>

          <div className="pt-2 text-center text-xs text-neutral-500 border-t border-neutral-200 dark:border-neutral-800">
            <Link href="/register" className="text-accent font-semibold hover:underline">
              {t("dontHaveAccount")}
            </Link>
          </div>
        </form>
      ) : (
        <form onSubmit={verify} className="box space-y-4">
          <div className="text-xs text-neutral-500">
            {t("codeSentTo")}: <strong className="text-neutral-900 dark:text-neutral-100 font-mono">{phone}</strong>
          </div>

          {/* Development mode OTP auto-fill helper */}
          {devOtp && !isDemo && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center justify-between">
              <div>
                <span className="font-semibold">{lang === "bn" ? "ভেরিফিকেশন কোড: " : "Verification Code: "}</span>
                <span className="font-mono font-bold tracking-widest text-sm">{devOtp}</span>
              </div>
              <button
                type="button"
                onClick={() => setOtp(devOtp)}
                className="text-[11px] underline font-semibold text-emerald-700 dark:text-emerald-300 hover:text-emerald-900"
              >
                {lang === "bn" ? "অটো-ফিল করুন" : "Auto-fill"}
              </button>
            </div>
          )}

          <div>
            <label htmlFor="login-code-input">{t("code")}</label>
            <input
              id="login-code-input"
              required
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder={isDemo ? "123456" : "••••••"}
              className="font-mono text-center tracking-widest text-lg font-bold"
            />
            <p className="text-xs text-neutral-500 mt-1 text-center">
              {isDemo ? t("demoCode") : t("realCodeNotice")}
            </p>
          </div>

          {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep("phone")}
              className="btn-ghost w-1/3"
            >
              {t("cancel")}
            </button>
            <button type="submit" disabled={loading} className="btn w-2/3">
              {loading ? t("loading") : t("login")}
            </button>
          </div>

          {!isDemo && (
            <div className="pt-2 text-center text-xs">
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="text-neutral-500 hover:text-accent underline transition-colors"
              >
                {resending ? t("loading") : t("resendCode")}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}