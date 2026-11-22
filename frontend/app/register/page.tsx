"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { post } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { getFirebaseAuth, getGoogleProvider, isFirebaseConfigured } from "@/lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendEmailVerification,
  updateProfile,
  User,
} from "firebase/auth";
import {
  BKASH_REGEX,
  validateBkashNumber,
  translateFirebaseError,
} from "@/lib/firebaseAuthHelper";

export default function RegisterPage() {
  const { t, lang } = useI18n();
  const { user, isAdmin, ready, login } = useAuth();
  const router = useRouter();

  // Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bkashNumber, setBkashNumber] = useState("");
  const [bkashType, setBkashType] = useState<"Personal" | "Merchant" | "Agent">("Personal");
  const [pageName, setPageName] = useState("");

  // Flow State: "register" | "verify-email" | "google-complete-profile"
  const [step, setStep] = useState<"register" | "verify-email" | "google-complete-profile">("register");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // References for created user in email flow or Google user
  const [registeredFirebaseUser, setRegisteredFirebaseUser] = useState<User | null>(null);
  const [googleUser, setGoogleUser] = useState<User | null>(null);

  // Auto-redirect if already logged in
  useEffect(() => {
    if (ready && user) {
      if (isAdmin) {
        router.replace("/admin");
      } else {
        router.replace("/dashboard");
      }
    }
  }, [ready, user, isAdmin, router]);

  // 60-second countdown timer for resend verification email
  useEffect(() => {
    if (countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [countdown]);

  const isBkashValid = validateBkashNumber(bkashNumber);

  // Handle Google Sign Up
  async function handleGoogleSignUp() {
    setErr("");
    if (!isFirebaseConfigured()) {
      setErr(
        lang === "bn"
          ? "Firebase কনফিগারেশন মিসিং! frontend/.env ফাইলে ক্রেডেনশিয়াল চেক করুন।"
          : "Firebase configuration is missing! Check frontend/.env."
      );
      return;
    }

    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const provider = getGoogleProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      setGoogleUser(user);
      setName(user.displayName || "");
      setEmail(user.email || "");

      // Check if user already exists in backend
      const idToken = await user.getIdToken();
      try {
        const res = await post<{ token: string; user: any; is_admin: boolean; profile_complete: boolean }>(
          "/auth/firebase-login",
          { idToken }
        );

        if (res.profile_complete && res.user.bkash_number) {
          // Already has bKash number, log in directly
          await login(res.token, res.user, res.is_admin);
          router.replace(res.is_admin ? "/admin" : "/dashboard");
          return;
        }
      } catch (_checkErr) {
        // Fall through to complete profile step
      }

      // First time or missing bKash info: prompt to complete profile
      setStep("google-complete-profile");
    } catch (x: any) {
      console.error("Google sign up error:", x);
      setErr(translateFirebaseError(x.code || x.message, lang));
    } finally {
      setLoading(false);
    }
  }

  // Complete Google Profile with bKash details
  async function handleGoogleCompleteProfile(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    if (!validateBkashNumber(bkashNumber)) {
      setErr(
        lang === "bn"
          ? "সঠিক ১১-সংখ্যার বিকাশ নম্বর লিখুন (যেমন: 017XXXXXXXX)"
          : "Please enter a valid 11-digit bKash number (e.g. 017XXXXXXXX)"
      );
      return;
    }

    if (!googleUser) {
      setErr(lang === "bn" ? "Google সেশন পাওয়া যায়নি। পুনরায় চেষ্টা করুন।" : "Google session lost. Please try again.");
      return;
    }

    setLoading(true);
    try {
      const idToken = await googleUser.getIdToken(true);
      const res = await post<{ token: string; user: any; is_admin: boolean }>("/auth/firebase-login", {
        idToken,
        bkash_number: bkashNumber.trim(),
        bkash_type: bkashType,
        name: name.trim() || googleUser.displayName || "",
        page_name: pageName.trim(),
        role: "seller",
      });

      await login(res.token, res.user, res.is_admin);
      router.replace(res.is_admin ? "/admin" : "/dashboard");
    } catch (x: any) {
      console.error("Google complete profile error:", x);
      setErr(x.message || translateFirebaseError(x.code || x.message, lang));
    } finally {
      setLoading(false);
    }
  }

  // Handle Email + Password Sign Up
  async function handleEmailSignUp(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    if (!isFirebaseConfigured()) {
      setErr(
        lang === "bn"
          ? "Firebase কনফিগারেশন মিসিং! frontend/.env ফাইলে ক্রেডেনশিয়াল চেক করুন।"
          : "Firebase configuration is missing! Check frontend/.env."
      );
      return;
    }

    if (!validateBkashNumber(bkashNumber)) {
      setErr(
        lang === "bn"
          ? "সঠিক ১১-সংখ্যার বিকাশ নম্বর লিখুন (যেমন: 017XXXXXXXX)"
          : "Please enter a valid 11-digit bKash number (e.g. 017XXXXXXXX)"
      );
      return;
    }

    if (password.length < 6) {
      setErr(
        lang === "bn"
          ? "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।"
          : "Password must be at least 6 characters long."
      );
      return;
    }

    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const userCred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = userCred.user;

      if (name.trim()) {
        try {
          await updateProfile(user, { displayName: name.trim() });
        } catch {}
      }

      // Send Firebase Email Verification
      await sendEmailVerification(user);
      setRegisteredFirebaseUser(user);
      setStep("verify-email");
      setCountdown(60);
    } catch (x: any) {
      console.error("Email sign up error:", x);
      setErr(translateFirebaseError(x.code || x.message, lang));
    } finally {
      setLoading(false);
    }
  }

  // Resend Verification Email
  async function handleResendVerificationEmail() {
    if (countdown > 0 || loading || !registeredFirebaseUser) return;
    setLoading(true);
    setErr("");
    try {
      await sendEmailVerification(registeredFirebaseUser);
      setCountdown(60);
    } catch (x: any) {
      console.error("Resend verification error:", x);
      setErr(translateFirebaseError(x.code || x.message, lang));
    } finally {
      setLoading(false);
    }
  }

  // Check Email Verification Status
  async function handleCheckVerification() {
    if (!registeredFirebaseUser) return;
    setLoading(true);
    setErr("");

    try {
      await registeredFirebaseUser.reload();
      if (!registeredFirebaseUser.emailVerified) {
        setErr(
          lang === "bn"
            ? "ইমেইল এখনও ভেরিফাই করা হয়নি! আপনার ইনবক্স অথবা স্প্যাম ফোল্ডারে পাঠানো লিঙ্কে ক্লিক করে ভেরিফিকেশন সম্পন্ন করুন, তারপর এই বোতামে চাপুন।"
            : "Email is not yet verified! Please check your inbox or spam folder, click the link, and try again."
        );
        return;
      }

      // Email is verified! Obtain fresh ID token and register in backend
      const idToken = await registeredFirebaseUser.getIdToken(true);
      const res = await post<{ token: string; user: any; is_admin: boolean }>("/auth/firebase-login", {
        idToken,
        name: name.trim(),
        email: email.trim(),
        bkash_number: bkashNumber.trim(),
        bkash_type: bkashType,
        page_name: pageName.trim(),
        role: "seller",
      });

      await login(res.token, res.user, res.is_admin);
      router.replace(res.is_admin ? "/admin" : "/dashboard");
    } catch (x: any) {
      console.error("Verification confirmation error:", x);
      setErr(x.message || translateFirebaseError(x.code || x.message, lang));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-12 px-4 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{t("createAccount")}</h1>
        <p className="text-sm text-neutral-500">{t("createAccountSub")}</p>
      </div>

      {step === "register" && (
        <div className="space-y-6">
          {/* Continue with Google */}
          <div className="box p-5 space-y-4">
            <button
              type="button"
              onClick={handleGoogleSignUp}
              disabled={loading}
              className="btn-outline w-full py-2.5 flex items-center justify-center gap-3 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition font-medium text-sm text-neutral-800 dark:text-neutral-200"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{t("continueWithGoogle")}</span>
            </button>
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="border-t border-neutral-300 dark:border-neutral-700 w-full"></div>
            <span className="bg-white dark:bg-black px-3 text-xs uppercase font-medium text-neutral-400 absolute">
              {t("orWithEmail")}
            </span>
          </div>

          {/* Email + Password Form */}
          <form onSubmit={handleEmailSignUp} className="box p-6 space-y-4">
            <div>
              <label htmlFor="reg-name-input">{t("fullName")}</label>
              <input
                id="reg-name-input"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("fullNamePlaceholder")}
              />
            </div>

            <div>
              <label htmlFor="reg-email-input">
                {lang === "bn" ? "ইমেইল ঠিকানা" : "Email Address"}
              </label>
              <input
                id="reg-email-input"
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@mail.com"
                className="font-mono"
              />
            </div>

            <div>
              <label htmlFor="reg-password-input">{t("password")}</label>
              <input
                id="reg-password-input"
                required
                type="password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("passwordPlaceholder")}
                className="font-mono"
              />
              <span className="text-xs text-neutral-500 mt-1 block">
                {lang === "bn" ? "কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দিন" : "At least 6 characters"}
              </span>
            </div>

            {/* bKash Number Input with Validation */}
            <div>
              <label htmlFor="reg-bkash-input">{t("bkashNumber")}</label>
              <div className="relative">
                <input
                  id="reg-bkash-input"
                  required
                  inputMode="tel"
                  placeholder="01XXXXXXXXX"
                  value={bkashNumber}
                  onChange={(e) => {
                    setBkashNumber(e.target.value.replace(/\s+/g, ""));
                    if (err) setErr("");
                  }}
                  className="font-mono"
                />
              </div>
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-neutral-500">{t("bkashNumberHelp")}</span>
                {bkashNumber.trim() && (
                  <span
                    className={`font-mono font-semibold ${
                      isBkashValid ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
                    }`}
                  >
                    {isBkashValid ? (lang === "bn" ? "✓ সঠিক" : "✓ Valid") : (lang === "bn" ? "✗ ভুল ফরম্যাট" : "✗ Invalid")}
                  </span>
                )}
              </div>
            </div>

            {/* bKash Account Type Dropdown */}
            <div>
              <label htmlFor="reg-bkash-type">{t("bkashType")}</label>
              <select
                id="reg-bkash-type"
                value={bkashType}
                onChange={(e) => setBkashType(e.target.value as any)}
              >
                <option value="Personal">{t("bkashPersonal")}</option>
                <option value="Merchant">{t("bkashMerchant")}</option>
                <option value="Agent">{t("bkashAgent")}</option>
              </select>
            </div>

            <div>
              <label htmlFor="reg-page-name-input">{t("shopOrgNameOptional")}</label>
              <input
                id="reg-page-name-input"
                value={pageName}
                onChange={(e) => setPageName(e.target.value)}
                placeholder={t("shopOrgPlaceholder")}
              />
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
                  <span>{lang === "bn" ? "অ্যাকাউন্ট তৈরি হচ্ছে..." : "Creating Account..."}</span>
                </span>
              ) : (
                lang === "bn" ? "অ্যাকাউন্ট তৈরি করুন" : "Register Account"
              )}
            </button>

            <div className="pt-2 text-center text-xs text-neutral-500 border-t border-neutral-200 dark:border-neutral-800">
              <Link href="/login" className="text-accent font-semibold hover:underline">
                {t("alreadyHaveAccount")}
              </Link>
            </div>
          </form>
        </div>
      )}

      {/* Step: Google Complete Profile */}
      {step === "google-complete-profile" && (
        <form onSubmit={handleGoogleCompleteProfile} className="box p-6 space-y-5">
          <div className="border-b border-neutral-200 dark:border-neutral-800 pb-3 space-y-1">
            <span className="text-xs uppercase font-bold text-accent">{t("completeProfile")}</span>
            <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
              {lang === "bn" ? "বিকাশ অ্যাকাউন্টের তথ্য যুক্ত করুন" : "Add bKash Account Details"}
            </h2>
            <p className="text-xs text-neutral-500">{t("completeProfileSub")}</p>
          </div>

          <div className="p-3 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs space-y-1">
            <div>
              <span className="text-neutral-500">{lang === "bn" ? "নাম:" : "Name:"}</span>{" "}
              <strong>{name || googleUser?.displayName || "Google User"}</strong>
            </div>
            <div>
              <span className="text-neutral-500">{lang === "bn" ? "ইমেইল:" : "Email:"}</span>{" "}
              <span className="font-mono">{email || googleUser?.email}</span>
            </div>
          </div>

          {/* bKash Number */}
          <div>
            <label htmlFor="google-bkash-number">{t("bkashNumber")}</label>
            <input
              id="google-bkash-number"
              required
              inputMode="tel"
              placeholder="01XXXXXXXXX"
              value={bkashNumber}
              onChange={(e) => {
                setBkashNumber(e.target.value.replace(/\s+/g, ""));
                if (err) setErr("");
              }}
              className="font-mono"
            />
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-neutral-500">{t("bkashNumberHelp")}</span>
              {bkashNumber.trim() && (
                <span
                  className={`font-mono font-semibold ${
                    isBkashValid ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
                  }`}
                >
                  {isBkashValid ? (lang === "bn" ? "✓ সঠিক" : "✓ Valid") : (lang === "bn" ? "✗ ভুল ফরম্যাট" : "✗ Invalid")}
                </span>
              )}
            </div>
          </div>

          {/* bKash Account Type */}
          <div>
            <label htmlFor="google-bkash-type">{t("bkashType")}</label>
            <select
              id="google-bkash-type"
              value={bkashType}
              onChange={(e) => setBkashType(e.target.value as any)}
            >
              <option value="Personal">{t("bkashPersonal")}</option>
              <option value="Merchant">{t("bkashMerchant")}</option>
              <option value="Agent">{t("bkashAgent")}</option>
            </select>
          </div>

          <div>
            <label htmlFor="google-page-name">{t("shopOrgNameOptional")}</label>
            <input
              id="google-page-name"
              value={pageName}
              onChange={(e) => setPageName(e.target.value)}
              placeholder={t("shopOrgPlaceholder")}
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
                setStep("register");
                setGoogleUser(null);
              }}
              className="btn-ghost w-1/3"
            >
              {t("cancel")}
            </button>
            <button type="submit" disabled={loading || !isBkashValid} className="btn w-2/3">
              {loading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/60 border-t-white animate-spin"></span>
                  <span>{lang === "bn" ? "সংরক্ষণ করা হচ্ছে..." : "Saving..."}</span>
                </span>
              ) : (
                lang === "bn" ? "প্রোফাইল সম্পন্ন করুন" : "Complete Profile"
              )}
            </button>
          </div>
        </form>
      )}

      {/* Step: Email Verification Required */}
      {step === "verify-email" && (
        <div className="box p-6 space-y-5">
          <div className="text-center space-y-2 border-b border-neutral-200 dark:border-neutral-800 pb-4">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 text-xl font-bold">
              ✉
            </div>
            <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
              {t("emailVerificationRequired")}
            </h2>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              {lang === "bn" ? (
                <>
                  আপনার ইমেইল <strong className="text-neutral-900 dark:text-neutral-100 font-mono">{email}</strong>-এ একটি ভেরিফিকেশন লিঙ্ক পাঠানো হয়েছে। ইনবক্স অথবা স্প্যাম ফোল্ডার চেক করে লিঙ্কে ক্লিক করুন।
                </>
              ) : (
                <>
                  A verification link was sent to <strong className="text-neutral-900 dark:text-neutral-100 font-mono">{email}</strong>. Please click the link to verify your account.
                </>
              )}
            </p>
          </div>

          {err && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
              {err}
            </div>
          )}

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleCheckVerification}
              disabled={loading}
              className="btn w-full py-2.5"
            >
              {loading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/60 border-t-white animate-spin"></span>
                  <span>{lang === "bn" ? "যাচাই করা হচ্ছে..." : "Checking..."}</span>
                </span>
              ) : (
                t("checkVerificationStatus")
              )}
            </button>

            <div className="flex items-center justify-between text-xs pt-2">
              <button
                type="button"
                onClick={() => {
                  setStep("register");
                  setRegisteredFirebaseUser(null);
                }}
                className="text-neutral-500 hover:underline"
              >
                {lang === "bn" ? "← তথ্য সংশোধন করুন" : "← Edit info"}
              </button>

              {countdown > 0 ? (
                <span className="text-neutral-400 font-mono">
                  {lang === "bn" ? `আবার পাঠান: ${countdown} সে.` : `Resend in ${countdown}s`}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleResendVerificationEmail}
                  disabled={loading}
                  className="text-accent font-semibold hover:underline"
                >
                  {t("resendVerificationEmail")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
