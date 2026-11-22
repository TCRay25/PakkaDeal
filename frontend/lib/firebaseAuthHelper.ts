export function formatBdPhoneNumber(input: string): { e164: string; local: string; isValid: boolean } {
  let cleaned = input.trim().replace(/[\s-]/g, "");

  // If user entered +8801XXXXXXXXX
  if (cleaned.startsWith("+8801")) {
    const local = cleaned.slice(3); // 01XXXXXXXXX
    return { e164: cleaned, local, isValid: /^01[3-9]\d{8}$/.test(local) };
  }

  // If user entered 8801XXXXXXXXX
  if (cleaned.startsWith("8801")) {
    const local = cleaned.slice(2);
    return { e164: `+${cleaned}`, local, isValid: /^01[3-9]\d{8}$/.test(local) };
  }

  // If user entered 01XXXXXXXXX
  if (cleaned.startsWith("01")) {
    return { e164: `+88${cleaned}`, local: cleaned, isValid: /^01[3-9]\d{8}$/.test(cleaned) };
  }

  // If user entered 1XXXXXXXXX (10 digits missing leading 0)
  if (/^[3-9]\d{8}$/.test(cleaned)) {
    const local = `01${cleaned.slice(-9)}`;
    return { e164: `+88${local}`, local, isValid: /^01[3-9]\d{8}$/.test(local) };
  }

  return { e164: cleaned, local: cleaned, isValid: false };
}

export function translateFirebaseError(errCode: string, lang: string = "bn"): string {
  const code = (errCode || "").toLowerCase();

  if (lang === "bn") {
    if (code.includes("region enabled") || code.includes("region") || code.includes("sms unable to be sent")) {
      return "Firebase-এ বাংলাদেশ (+880) রিজিয়ন সক্রিয় করা নেই! Firebase Console -> Authentication -> Settings -> 'SMS region policy'-তে গিয়ে Bangladesh (+880) সিলেক্ট করে Allow করুন। অথবা 'Phone numbers for testing'-এ নম্বরটি সেভ করুন।";
    }
    if (code.includes("configuration-not-found")) {
      return "Firebase Console-এ Phone Authentication সক্রিয় করা নেই! অনুগ্রহ করে Firebase Console -> Build -> Authentication -> Sign-in method-এ গিয়ে 'Phone' চালু (Enable) করে Save করুন।";
    }
    if (code.includes("missing-config") || code.includes("invalid-api-key") || code.includes("api-key-not-valid")) {
      return "Firebase কনফিগারেশন মিসিং! অনুগ্রহ করে frontend/.env ফাইলে আপনার Firebase ক্রেডেনশিয়াল (NEXT_PUBLIC_FIREBASE_API_KEY ইত্যাদি) বসান।";
    }
    if (code.includes("operation-not-allowed")) {
      return "Firebase Console-এ Phone Sign-in সক্রিয় করা নেই। Authentication -> Sign-in method -> Phone Enable করুন।";
    }
    if (code.includes("unauthorized-domain")) {
      return "এই ডোমেইনটি Firebase-এ অনুমোদিত নয়। Firebase Console -> Authentication -> Settings -> Authorized Domains-এ ডোমেইন যুক্ত করুন।";
    }
    if (code.includes("invalid-phone-number")) {
      return "মোবাইল নম্বরের ফরম্যাটটি সঠিক নয়। অনুগ্রহ করে ০১XXXXXXXXX ফরম্যাটে লিখুন।";
    }
    if (code.includes("missing-phone-number")) {
      return "মোবাইল নম্বর প্রদান করুন।";
    }
    if (code.includes("quota-exceeded")) {
      return "এসএমএস প্রেরণের দৈনিক কোটা শেষ হয়ে গেছে। অনুগ্রহ করে কিছুক্ষণ পর চেষ্টা করুন।";
    }
    if (code.includes("too-many-requests")) {
      return "অনেক বেশিবার চেষ্টা করা হয়েছে। নিরাপত্তার স্বার্থে কিছুক্ষণ পর পুনরায় চেষ্টা করুন।";
    }
    if (code.includes("invalid-verification-code")) {
      return "ভুল ওটিপি কোড লিখেছেন। সঠিক ৬-সংখ্যার কোডটি দিন।";
    }
    if (code.includes("code-expired")) {
      return "ওটিপি কোডটির মেয়াদ উত্তীর্ণ হয়ে গেছে। অনুগ্রহ করে 'OTP আবার পাঠান' চাপুন।";
    }
    if (code.includes("captcha-check-failed")) {
      return "reCAPTCHA যাচাইকরণ সম্পন্ন হয়নি। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।";
    }
    if (code.includes("network-request-failed")) {
      return "ইন্টারনেট সংযোগে সমস্যা হয়েছে। আপনার ইন্টারনেট কানেকশন চেক করুন।";
    }
    if (code.includes("invalid-app-credential")) {
      return "Firebase কনফিগারেশন ত্রুটি। Firebase Console-এ ডোমেইন ও প্রজেক্ট সেটিংস যাচাই করুন।";
    }
    return `ত্রুটি ঘটেছে (${errCode})। অনুগ্রহ করে Firebase কনফিগারেশন চেক করে আবার চেষ্টা করুন।`;
  }

  if (code.includes("configuration-not-found")) {
    return "Phone Authentication is not enabled in Firebase Console! Please go to Firebase Console -> Build -> Authentication -> Sign-in method and Enable Phone provider.";
  }
  if (code.includes("missing-config") || code.includes("invalid-api-key") || code.includes("api-key-not-valid")) {
    return "Firebase configuration missing! Please add NEXT_PUBLIC_FIREBASE_API_KEY in frontend/.env.";
  }
  if (code.includes("operation-not-allowed")) {
    return "Phone provider is disabled. Please enable Phone in Firebase Console -> Authentication -> Sign-in method.";
  }
  if (code.includes("unauthorized-domain")) {
    return "This domain is not authorized. Add it to Firebase Console -> Authentication -> Settings -> Authorized domains.";
  }
  if (code.includes("invalid-phone-number")) {
    return "Invalid phone number format. Please enter in 01XXXXXXXXX format.";
  }
  if (code.includes("missing-phone-number")) {
    return "Please enter a phone number.";
  }
  if (code.includes("quota-exceeded")) {
    return "SMS quota exceeded. Please try again later.";
  }
  if (code.includes("too-many-requests")) {
    return "Too many requests. Please wait a moment and try again.";
  }
  if (code.includes("invalid-verification-code")) {
    return "Invalid verification code. Please check the 6-digit code.";
  }
  if (code.includes("code-expired")) {
    return "Verification code has expired. Please request a new code.";
  }
  if (code.includes("captcha-check-failed")) {
    return "reCAPTCHA verification failed. Please refresh the page and try again.";
  }
  if (code.includes("network-request-failed")) {
    return "Network connection issue. Please check your internet connection.";
  }
  if (code.includes("invalid-app-credential")) {
    return "Firebase configuration error. Please verify authorized domains in Firebase Console.";
  }
  return `Error (${errCode}). Please check your Firebase configuration and try again.`;
}
