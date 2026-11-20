"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

export default function Login() {
  const { t } = useI18n();
  const { login } = useAuth();
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await post("/auth/send-otp", { phone });
      setStep("otp");
      setOtp("123456");
    } catch (x: any) {
      setErr(x.message);
    } finally {
      setLoading(false);
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
      setErr(x.message);
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
          Enter your Bangladesh mobile number to access your escrow account.
        </p>
      </div>

      {/* Quick Demo Logins */}
      <div className="box p-4 bg-neutral-50 dark:bg-neutral-900 space-y-2 border border-neutral-300 dark:border-neutral-700">
        <div className="text-xs uppercase font-bold text-neutral-500 tracking-wider">
          Demo Accounts
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
            <label htmlFor="login-name-input">Your Name or Shop Name (Optional)</label>
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
        </form>
      ) : (
        <form onSubmit={verify} className="box space-y-4">
          <div className="text-xs text-neutral-500">
            {t("codeSentTo")}: <strong className="text-neutral-900 dark:text-neutral-100 font-mono">{phone}</strong>
          </div>

          <div>
            <label htmlFor="login-code-input">{t("code")}</label>
            <input
              id="login-code-input"
              required
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456"
              className="font-mono text-center tracking-widest text-lg"
            />
            <p className="text-xs text-neutral-500 mt-1">{t("demoCode")}</p>
          </div>

          {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep("phone")}
              className="btn-ghost w-1/3"
            >
              Back
            </button>
            <button type="submit" disabled={loading} className="btn w-2/3">
              {loading ? t("loading") : "Verify & Sign In"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
