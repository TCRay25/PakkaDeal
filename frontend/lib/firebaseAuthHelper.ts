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
  if (lang === "bn") {
    switch (errCode) {
      case "auth/invalid-phone-number":
        return "মোবাইল নম্বরের ফরম্যাটটি সঠিক নয়। অনুগ্রহ করে ০১XXXXXXXXX ফরম্যাটে লিখুন।";
      case "auth/missing-phone-number":
        return "মোবাইল নম্বর প্রদান করুন।";
      case "auth/quota-exceeded":
        return "এসএমএস প্রেরণের দৈনিক কোটা শেষ হয়ে গেছে। অনুগ্রহ করে কিছুক্ষণ পর চেষ্টা করুন।";
      case "auth/too-many-requests":
        return "অনেক বেশিবার চেষ্টা করা হয়েছে। নিরাপত্তার স্বার্থে কিছুক্ষণ পর পুনরায় চেষ্টা করুন।";
      case "auth/invalid-verification-code":
        return "ভুল ওটিপি কোড লিখেছেন। এসএমএসে আসা সঠিক ৬-সংখ্যার কোডটি দিন।";
      case "auth/code-expired":
        return "ওটিপি কোডটির মেয়াদ উত্তীর্ণ হয়ে গেছে। অনুগ্রহ করে 'OTP আবার পাঠান' চাপুন।";
      case "auth/captcha-check-failed":
        return "reCAPTCHA যাচাইকরণ সম্পন্ন হয়নি। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।";
      case "auth/network-request-failed":
        return "ইন্টারনেট সংযোগে সমস্যা হয়েছে। আপনার ইন্টারনেট কানেকশন চেক করুন।";
      case "auth/invalid-app-credential":
        return "Firebase কনফিগারেশন ত্রুটি। Firebase Console-এ ডোমেইন অনুমোদিত আছে কিনা যাচাই করুন।";
      default:
        return "একটি ত্রুটি ঘটেছে। অনুগ্রহ করে আবার চেষ্টা করুন।";
    }
  }

  switch (errCode) {
    case "auth/invalid-phone-number":
      return "Invalid phone number format. Please enter in 01XXXXXXXXX format.";
    case "auth/missing-phone-number":
      return "Please enter a phone number.";
    case "auth/quota-exceeded":
      return "SMS quota exceeded. Please try again later.";
    case "auth/too-many-requests":
      return "Too many requests. Please wait a moment and try again.";
    case "auth/invalid-verification-code":
      return "Invalid verification code. Please check the 6-digit code.";
    case "auth/code-expired":
      return "Verification code has expired. Please request a new code.";
    case "auth/captcha-check-failed":
      return "reCAPTCHA verification failed. Please refresh the page and try again.";
    case "auth/network-request-failed":
      return "Network connection issue. Please check your internet connection.";
    case "auth/invalid-app-credential":
      return "Firebase configuration error. Please verify authorized domains in Firebase Console.";
    default:
      return "An error occurred. Please try again.";
  }
}
