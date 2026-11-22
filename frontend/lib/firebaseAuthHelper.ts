export const BKASH_REGEX = /^01[3-9]\d{8}$/;

export function validateBkashNumber(phone: string): boolean {
  return BKASH_REGEX.test((phone || "").trim());
}

export function formatBdPhoneNumber(input: string): { e164: string; local: string; isValid: boolean } {
  let cleaned = input.trim().replace(/[\s-]/g, "");

  // If user entered +8801XXXXXXXXX
  if (cleaned.startsWith("+8801")) {
    const local = cleaned.slice(3); // 01XXXXXXXXX
    return { e164: cleaned, local, isValid: BKASH_REGEX.test(local) };
  }

  // If user entered 8801XXXXXXXXX
  if (cleaned.startsWith("8801")) {
    const local = cleaned.slice(2);
    return { e164: `+${cleaned}`, local, isValid: BKASH_REGEX.test(local) };
  }

  // If user entered 01XXXXXXXXX
  if (cleaned.startsWith("01")) {
    return { e164: `+88${cleaned}`, local: cleaned, isValid: BKASH_REGEX.test(cleaned) };
  }

  // If user entered 1XXXXXXXXX (10 digits missing leading 0)
  if (/^[3-9]\d{8}$/.test(cleaned)) {
    const local = `01${cleaned.slice(-9)}`;
    return { e164: `+88${local}`, local, isValid: BKASH_REGEX.test(local) };
  }

  return { e164: cleaned, local: cleaned, isValid: false };
}

export function translateFirebaseError(errCode: string, lang: string = "bn"): string {
  const code = (errCode || "").toLowerCase();

  if (lang === "bn") {
    // Google & Email auth specific
    if (code.includes("email-already-in-use")) {
      return "এই ইমেইলটি দিয়ে ইতিমধ্যে অ্যাকাউন্ট তৈরি করা আছে। অনুগ্রহ করে লগইন করুন।";
    }
    if (code.includes("wrong-password") || code.includes("invalid-credential")) {
      return "ভুল ইমেইল বা পাসওয়ার্ড প্রদান করেছেন। আবার চেষ্টা করুন।";
    }
    if (code.includes("user-not-found")) {
      return "এই ইমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি। অনুগ্রহ করে রেজিস্টার করুন।";
    }
    if (code.includes("weak-password")) {
      return "পাসওয়ার্ড খুবই দুর্বল। কমপক্ষে ৬টি অক্ষর বা সংখ্যা ব্যবহার করুন।";
    }
    if (code.includes("invalid-email")) {
      return "ইমেইল ফরম্যাট সঠিক নয়। সঠিক ইমেইল ঠিকানা লিখুন।";
    }
    if (code.includes("popup-closed-by-user")) {
      return "Google সাইন-ইন উইন্ডো বন্ধ করা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।";
    }
    if (code.includes("popup-blocked")) {
      return "ব্রাউজারে পপআপ ব্লক করা আছে। অনুগ্রহ করে পপআপ অনুমোদন করে আবার চেষ্টা করুন।";
    }
    if (code.includes("account-exists-with-different-credential")) {
      return "এই ইমেইলটি অন্য সাইন-ইন পদ্ধতির সাথে যুক্ত রয়েছে।";
    }
    if (code.includes("operation-not-allowed")) {
      return "Firebase Console-এ এই সাইন-ইন পদ্ধতি সক্রিয় করা নেই। Authentication -> Sign-in method-এ গিয়ে Google বা Email/Password সক্রিয় করুন।";
    }
    if (code.includes("unauthorized-domain")) {
      return "এই ডোমেইনটি Firebase-এ অনুমোদিত নয়। Firebase Console -> Authentication -> Settings -> Authorized domains-এ ডোমেইনটি যুক্ত করুন।";
    }
    if (code.includes("missing-config") || code.includes("invalid-api-key") || code.includes("api-key-not-valid")) {
      return "Firebase কনফিগারেশন মিসিং! অনুগ্রহ করে frontend/.env ফাইলে আপনার Firebase ক্রেডেনশিয়াল বসান।";
    }
    if (code.includes("too-many-requests")) {
      return "অনেক বেশিবার চেষ্টা করা হয়েছে। নিরাপত্তার স্বার্থে কিছুক্ষণ পর পুনরায় চেষ্টা করুন।";
    }
    if (code.includes("network-request-failed")) {
      return "ইন্টারনেট সংযোগে সমস্যা হয়েছে। আপনার ইন্টারনেট কানেকশন চেক করুন।";
    }
    return `ত্রুটি ঘটেছে (${errCode})। অনুগ্রহ করে আবার চেষ্টা করুন।`;
  }

  // English fallback
  if (code.includes("email-already-in-use")) {
    return "This email is already in use. Please sign in instead.";
  }
  if (code.includes("wrong-password") || code.includes("invalid-credential")) {
    return "Invalid email or password. Please try again.";
  }
  if (code.includes("user-not-found")) {
    return "No user found with this email. Please register first.";
  }
  if (code.includes("weak-password")) {
    return "Password is too weak. Please use at least 6 characters.";
  }
  if (code.includes("invalid-email")) {
    return "Please enter a valid email address.";
  }
  if (code.includes("popup-closed-by-user")) {
    return "Google sign-in popup was closed before finishing.";
  }
  if (code.includes("popup-blocked")) {
    return "Popup was blocked by your browser. Please allow popups and try again.";
  }
  if (code.includes("operation-not-allowed")) {
    return "Sign-in provider is disabled. Please enable it in Firebase Console -> Authentication -> Sign-in method.";
  }
  if (code.includes("unauthorized-domain")) {
    return "This domain is not authorized. Add it to Firebase Console -> Authentication -> Settings -> Authorized domains.";
  }
  if (code.includes("too-many-requests")) {
    return "Too many requests. Please wait a moment and try again.";
  }
  if (code.includes("network-request-failed")) {
    return "Network error. Please check your internet connection.";
  }
  return `Error (${errCode}). Please try again.`;
}
