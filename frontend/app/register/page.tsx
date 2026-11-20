"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { post } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

export default function RegisterPage() {
  const { t } = useI18n();
  const { login } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pageName, setPageName] = useState("");
  const [city, setCity] = useState("Dhaka");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"details" | "otp">("details");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);

    try {
      await post("/auth/send-otp", { phone });
      setStep("otp");
      setOtp("123456"); // Pre-fill demo OTP
    } catch (x: any) {
      setErr(x.message || "Failed to send code");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);

    try {
      const res = await post("/auth/verify", {
        phone,
        otp,
        name,
        page_name: pageName,
        role: "user",
      });
      await login(res.token);
      router.push("/dashboard");
    } catch (x: any) {
      setErr(x.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-12 px-4 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Create an Escrow Account</h1>
        <p className="text-sm text-neutral-500">
          Sign up to buy, sell, or rent with 100% escrow fraud protection in Bangladesh.
        </p>
      </div>

      {step === "details" ? (
        <form onSubmit={handleSendOtp} className="box p-6 space-y-4">
          <div>
            <label htmlFor="reg-name-input">Your Full Name</label>
            <input
              id="reg-name-input"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tanvir Ahmed"
            />
          </div>

          <div>
            <label htmlFor="reg-phone-input">{t("phone")}</label>
            <input
              id="reg-phone-input"
              required
              inputMode="tel"
              placeholder="01XXXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="font-mono"
            />
            <span className="text-xs text-neutral-500 mt-1 block">
              Used to secure your deals and receive courier delivery notifications.
            </span>
          </div>

          <div>
            <label htmlFor="reg-page-name-input">Shop or Organization Name (Optional)</label>
            <input
              id="reg-page-name-input"
              value={pageName}
              onChange={(e) => setPageName(e.target.value)}
              placeholder="e.g. Dhaka Gadgets or Niloy Flats"
            />
          </div>

          <div>
            <label htmlFor="reg-city-select">{t("area")}</label>
            <select id="reg-city-select" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="Dhaka">Dhaka</option>
              <option value="Chattogram">Chattogram</option>
              <option value="Cumilla">Cumilla</option>
              <option value="Sylhet">Sylhet</option>
              <option value="Rajshahi">Rajshahi</option>
              <option value="Khulna">Khulna</option>
              <option value="Barishal">Barishal</option>
              <option value="Rangpur">Rangpur</option>
            </select>
          </div>

          {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}

          <button type="submit" disabled={loading} className="btn w-full py-2.5">
            {loading ? t("loading") : "Send Verification Code"}
          </button>

          <div className="pt-2 text-center text-xs text-neutral-500 border-t border-neutral-200 dark:border-neutral-800">
            Already have an account?{" "}
            <Link href="/login" className="text-accent font-semibold hover:underline">
              Log in here →
            </Link>
          </div>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="box p-6 space-y-4">
          <div className="text-xs text-neutral-500">
            {t("codeSentTo")}: <strong className="text-neutral-900 dark:text-neutral-100 font-mono">{phone}</strong>
          </div>

          <div>
            <label htmlFor="reg-code-input">{t("code")}</label>
            <input
              id="reg-code-input"
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
              onClick={() => setStep("details")}
              className="btn-ghost w-1/3"
            >
              Back
            </button>
            <button type="submit" disabled={loading} className="btn w-2/3">
              {loading ? t("loading") : "Confirm & Register"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
