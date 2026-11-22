"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { post } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase";
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from "firebase/auth";
import { formatBdPhoneNumber, translateFirebaseError } from "@/lib/firebaseAuthHelper";

export default function LoginPage() {
  const { t, lang } = useI18n();
  const { login } = useAuth();
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  // 60-second countdown timer for resend OTP
  useEffect(() => {
    if (countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [countdown]);

  // Clean up recaptcha on unmount
  useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch {}
      }
    };
  }, []);

  function getRecaptchaVerifier() {
    const auth = getFirebaseAuth();
    if (!recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current = new RecaptchaVerifier(auth, "login-recaptcha-container", {
        size: "invisible",
        callback: () => {},
        "expired-callback": () => {
          setErr(lang === "bn" ? "reCAPTCHA এর মেয়াদ শেষ। পুনরায় চেষ্টা করুন।" : "reCAPTCHA expired. Please try again.");
        },
      });
    }
    return recaptchaVerifierRef.current;
  }

  async function handleSendOtp(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setErr("");

    if (!isFirebaseConfigured()) {
      setErr(
        lang === "bn"
          ? "Firebase কনফিগারেশন মিসিং! অনুগ্রহ করে frontend/.env ফাইলে আপনার Firebase ক্রেডেনশিয়াল (NEXT_PUBLIC_FIREBASE_API_KEY ইত্যাদি) বসান।"
          : "Firebase configuration is missing! Please add NEXT_PUBLIC_FIREBASE_API_KEY in frontend/.env."
      );
      return;
    }

    const { e164, isValid } = formatBdPhoneNumber(phone);
    if (!isValid) {
      setErr(
        lang === "bn"
          ? "সঠিক ১১-সংখ্যার বাংলাদেশি মোবাইল নম্বর লিখুন (যেমন: 017XXXXXXXX)"
          : "Please enter a valid 11-digit Bangladeshi mobile number (e.g. 017XXXXXXXX)"
      );
      return;
    }

    setLoading(true);

    try {
      const auth = getFirebaseAuth();
      const verifier = getRecaptchaVerifier();
      const confirmationResult = await signInWithPhoneNumber(auth, e164, verifier);
      confirmationResultRef.current = confirmationResult;
      setStep("otp");
      setCountdown(60);
      setOtp("");
    } catch (x: any) {
      console.error("Firebase send OTP error:", x);
      setErr(translateFirebaseError(x.code || x.message, lang));
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
          recaptchaVerifierRef.current = null;
        } catch {}
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    if (countdown > 0 || loading) return;
    await handleSendOtp();
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    if (!confirmationResultRef.current) {
      setErr(lang === "bn" ? "ভেরিফিকেশন সেশন পাওয়া যায়নি। পুনরায় ওটিপি পাঠান।" : "No verification session found. Please resend OTP.");
      return;
    }

    if (otp.trim().length !== 6) {
      setErr(lang === "bn" ? "সঠিক ৬-সংখ্যার ওটিপি কোড লিখুন।" : "Please enter the valid 6-digit OTP code.");
      return;
    }

    setLoading(true);

    try {
      // 1. Confirm OTP code with Firebase
      const result = await confirmationResultRef.current.confirm(otp.trim());
      // 2. Obtain Firebase ID Token
      const idToken = await result.user.getIdToken();

      // 3. Authenticate with backend
      const r = await post<{ token: string; user: any; is_admin: boolean }>("/auth/firebase-login", {
        idToken,
        name,
        role: "user",
      });

      await login(r.token);
      if (r.is_admin) {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
    } catch (x: any) {
      console.error("Firebase verify error:", x);
      setErr(translateFirebaseError(x.code || x.message, lang));
    } finally {
      setLoading(false);
    }
  }

  // Quick fill for testing
  function quickFill(quickPhone: string, quickName: string) {
    setPhone(quickPhone);
    setName(quickName);
    setErr("");
  }

  // Direct demo login fallback (optional bypass for predefined test numbers)
  async function directDemoLogin(demoPhone: string, demoName: string) {
    setLoading(true);
    setErr("");
    try {
      const r = await post<{ token: string; user: any; is_admin: boolean }>("/auth/verify", {
        phone: demoPhone,
        otp: "123456",
        name: demoName,
      });
      await login(r.token);
      if (r.is_admin) {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
    } catch (x: any) {
      setErr(x.message || "Demo login failed");
    } finally {
      setLoading(false);
    }
  }

  const { e164: previewE164, isValid: isPhoneValid } = formatBdPhoneNumber(phone);

  return (
    <div className="mx-auto max-w-md py-12 px-4 space-y-8">
      {/* Invisible reCAPTCHA container for Firebase Phone Auth */}
      <div id="login-recaptcha-container"></div>

      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{t("login")}</h1>
        <p className="text-sm text-neutral-500">
          {t("loginSub")}
        </p>
      </div>

      {/* Quick Demo Logins */}
      <div className="box p-4 bg-neutral-50 dark:bg-neutral-900 space-y-2 border border-neutral-300 dark:border-neutral-700">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-bold text-neutral-500 tracking-wider">
            {t("demoAccounts")}
          </span>
          <span className="text-[10px] text-neutral-400">
            {lang === "bn" ? "দ্রুত লগইন" : "Quick Access"}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={() => directDemoLogin("01711223344", "Rahim Chowdhury")}
            className="btn-ghost text-xs justify-between w-full"
          >
            <span>Rahim Chowdhury (Seller)</span>
            <span className="font-mono text-neutral-400">01711223344</span>
          </button>
          <button
            type="button"
            onClick={() => directDemoLogin("01755667788", "Nusrat Jahan")}
            className="btn-ghost text-xs justify-between w-full"
          >
            <span>Nusrat Jahan (Buyer)</span>
            <span className="font-mono text-neutral-400">01755667788</span>
          </button>
          <button
            type="button"
            onClick={() => directDemoLogin("01700000000", "PakkaDeal Admin")}
            className="btn-ghost text-xs justify-between w-full border-accent/40"
          >
            <span className="font-semibold text-accent">{t("loginQuickAdmin")}</span>
            <span className="font-mono text-neutral-400">01700000000</span>
          </button>
        </div>
      </div>

      {step === "phone" ? (
        <form onSubmit={handleSendOtp} className="box p-6 space-y-4">
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
              onChange={(e) => {
                setPhone(e.target.value);
                if (err) setErr("");
              }}
              className="font-mono"
            />
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-neutral-500">
                {lang === "bn" ? "১১-সংখ্যার নম্বর লিখলে অটো +880 সেট হবে" : "Auto +880 prefix added"}
              </span>
              {phone.trim() && (
                <span className={`font-mono ${isPhoneValid ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-neutral-400"}`}>
                  {previewE164}
                </span>
              )}
            </div>
          </div>

          {err && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
              {err}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn w-full py-2.5">
            {loading ? (
              <span className="inline-flex items-center justify-center gap-2">
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/60 border-t-white animate-spin"></span>
                <span>{lang === "bn" ? "OTP পাঠানো হচ্ছে..." : "Sending OTP..."}</span>
              </span>
            ) : (
              lang === "bn" ? "OTP পাঠাও" : "Send OTP"
            )}
          </button>

          <div className="pt-2 text-center text-xs text-neutral-500 border-t border-neutral-200 dark:border-neutral-800">
            <Link href="/register" className="text-accent font-semibold hover:underline">
              {t("dontHaveAccount")}
            </Link>
          </div>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="box p-6 space-y-4">
          <div className="text-xs text-neutral-600 dark:text-neutral-400 space-y-1 border-b border-neutral-200 dark:border-neutral-800 pb-3">
            <div>
              {t("codeSentTo")}: <strong className="text-neutral-900 dark:text-neutral-100 font-mono text-sm">{previewE164}</strong>
            </div>
            <p className="text-[11px] text-neutral-500">
              {lang === "bn"
                ? "এসএমএসে প্রাপ্ত ৬-সংখ্যার ভেরিফিকেশন কোডটি প্রদান করুন।"
                : "Enter the 6-digit verification code received via SMS."}
            </p>
          </div>

          <div>
            <label htmlFor="login-code-input">{t("code")}</label>
            <input
              id="login-code-input"
              required
              autoFocus
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, ""));
                if (err) setErr("");
              }}
              placeholder="••••••"
              className="font-mono text-center text-xl tracking-widest font-bold py-2.5"
            />
          </div>

          {err && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
              {err}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setErr("");
              }}
              className="btn-ghost w-1/3"
            >
              {t("cancel")}
            </button>
            <button type="submit" disabled={loading || otp.length !== 6} className="btn w-2/3">
              {loading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/60 border-t-white animate-spin"></span>
                  <span>{lang === "bn" ? "যাচাই করা হচ্ছে..." : "Verifying..."}</span>
                </span>
              ) : (
                lang === "bn" ? "যাচাই করো" : "Verify & Login"
              )}
            </button>
          </div>

          <div className="pt-2 text-center text-xs">
            {countdown > 0 ? (
              <span className="text-neutral-400 font-mono">
                {lang === "bn"
                  ? `OTP আবার পাঠানোর সময় বাকি: ${countdown} সেকেন্ড`
                  : `Resend OTP in: ${countdown}s`}
              </span>
            ) : (
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={loading}
                className="text-accent font-semibold hover:underline"
              >
                {lang === "bn" ? "OTP আবার পাঠান" : "Resend OTP"}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
