export type Lang = "en" | "bn";

export function translateActor(actor: string, lang: Lang): string {
  if (lang !== "bn") return (actor || "").toUpperCase();
  const a = (actor || "").toLowerCase();
  if (a === "buyer") return "ক্রেতা";
  if (a === "seller") return "বিক্রেতা";
  if (a === "courier") return "কুরিয়ার";
  if (a === "admin") return "অ্যাডমিন";
  if (a === "system") return "সিস্টেম";
  return actor ? actor.toUpperCase() : "";
}

export function translateDealType(type: string, lang: Lang): string {
  if (lang !== "bn") return (type || "").toUpperCase();
  const t = (type || "").toLowerCase();
  if (t === "product") return "পণ্য";
  if (t === "rental") return "বাড়িভাড়া";
  if (t === "service") return "সার্ভিস";
  return (type || "").toUpperCase();
}

export function translateTimelineNote(note: string, lang: Lang): string {
  if (lang !== "bn" || !note) return note;

  const n = note.trim();

  // Pattern: Deal created by [Name] (optional . Waiting for buyer escrow payment.)
  const mCreated = n.match(/^Deal created by\s+(.+?)(?:\.\s*Waiting for buyer escrow payment\.?)?$/i);
  if (mCreated) {
    let creator = mCreated[1].replace(/^seller\s+/i, "").trim();
    if (creator.toLowerCase() === "seller") creator = "বিক্রেতা";
    if (/Waiting for buyer escrow payment/i.test(n)) {
      return `${creator} কর্তৃক ডিল তৈরি হয়েছে। ক্রেতার এসক্রো পেমেন্টের অপেক্ষায়।`;
    }
    return `${creator} কর্তৃক ডিল তৈরি হয়েছে`;
  }

  // Pattern: Buyer opened deal link. Awaiting escrow payment.
  if (/^Buyer opened deal link\.\s*Awaiting escrow payment/i.test(n)) {
    return "ক্রেতা ডিল লিংক খুলেছেন। এসক্রো পেমেন্টের অপেক্ষায়।";
  }

  // Pattern: Buyer deposited [Amount] BDT into escrow via [Method]. TrxID: [TrxID], Sender: [Sender]
  const mPaidFull = n.match(/^Buyer deposited\s+([\d,]+)\s*BDT into escrow via\s+(.+?)\.\s*TrxID:\s*([^\s,]+),\s*Sender:\s*([^\s,]+)/i);
  if (mPaidFull) {
    const formattedAmount = Number(mPaidFull[1].replace(/,/g, "")).toLocaleString();
    return `${mPaidFull[2]} এর মাধ্যমে ক্রেতা ${formattedAmount} টাকা এসক্রোতে জমা দিয়েছেন। TrxID: ${mPaidFull[3]}, প্রেরক: ${mPaidFull[4]}`;
  }

  // Pattern: Buyer deposited [Amount] BDT into escrow via [Method].
  const mPaidSimple = n.match(/^Buyer deposited\s+([\d,]+)\s*BDT into escrow via\s+(.+?)\./i);
  if (mPaidSimple) {
    const formattedAmount = Number(mPaidSimple[1].replace(/,/g, "")).toLocaleString();
    return `${mPaidSimple[2]} এর মাধ্যমে ক্রেতা ${formattedAmount} টাকা এসক্রোতে জমা দিয়েছেন।`;
  }

  // Pattern: Dispatched via [Courier] (Tracking ID: [ID])
  const mDispatched = n.match(/^Dispatched via\s+([^\(]+)\s*\(Tracking ID:\s*([^\)]+)\)/i);
  if (mDispatched) {
    return `${mDispatched[1].trim()} এর মাধ্যমে পার্সেল পাঠানো হয়েছে (ট্র্যাকিং আইডি: ${mDispatched[2].trim()})`;
  }

  // Pattern: Dispatched via manual courier "[Name]" (Phone: [Phone], Tracking: [Tracking]). Consignment slip submitted for admin audit.
  const mManualDisp = n.match(/^Dispatched via manual courier\s*"([^"]+)"\s*\(Phone:\s*([^,]+),\s*Tracking:\s*([^\)]+)\)\.\s*Consignment slip submitted for admin audit\./i);
  if (mManualDisp) {
    return `ম্যানুয়াল কুরিয়ার "${mManualDisp[1]}" (ফোন: ${mManualDisp[2].trim()}, ট্র্যাকিং: ${mManualDisp[3].trim()}) এর মাধ্যমে পাঠানো হয়েছে। রসিদের ছবি অ্যাডমিন নিরীক্ষার অধীনে রয়েছে।`;
  }

  // Pattern: Courier marked parcel delivered. 24-hour auto-release countdown started. Buyer has 24 hours to inspect item and confirm receipt.
  if (/^Courier marked parcel delivered/i.test(n)) {
    return "কুরিয়ার পার্সেল ডেলিভারি নিশ্চিত করেছে। ২৪ ঘণ্টার অটো-রিলিজ কাউন্টডাউন শুরু হয়েছে। ক্রেতার পণ্য যাচাই করে রসিদ নিশ্চিত করতে ২৪ ঘণ্টা সময় রয়েছে।";
  }

  // Pattern: Courier tracking update: [Status]
  const mCourierTrack = n.match(/^Courier tracking update:\s*(.+)/i);
  if (mCourierTrack) {
    return `কুরিয়ার ট্র্যাকিং আপডেট: ${translateCourierStatus(mCourierTrack[1].trim(), lang)}`;
  }

  // Pattern: Return courier status: [Status]
  const mReturnTrack = n.match(/^Return courier status:\s*(.+)/i);
  if (mReturnTrack) {
    return `রিটার্ন কুরিয়ার স্ট্যাটাস: ${translateCourierStatus(mReturnTrack[1].trim(), lang)}`;
  }

  // Pattern: Buyer confirmed receipt...
  if (/^Buyer confirmed receipt with unboxing proof\.\s*Money released to seller\./i.test(n)) {
    return "ক্রেতা আনবক্সিং প্রমাণসহ পণ্য পেয়ে রসিদ নিশ্চিত করেছেন। টাকা বিক্রেতার অ্যাকাউন্টে হস্তান্তর করা হয়েছে।";
  }
  if (/^Buyer confirmed receipt\.\s*Money released to seller\./i.test(n)) {
    return "ক্রেতা পণ্য পেয়ে রসিদ নিশ্চিত করেছেন। টাকা বিক্রেতার অ্যাকাউন্টে হস্তান্তর করা হয়েছে।";
  }

  // Pattern: 24-hour confirmation window expired. Escrow funds auto-released to seller.
  if (/^24-hour confirmation window expired\.\s*Escrow funds auto-released to seller\./i.test(n)) {
    return "২৪ ঘণ্টার নিশ্চিতকরণ সময় উত্তীর্ণ হয়েছে। এসক্রো তহবিল স্বয়ংক্রিয়ভাবে বিক্রেতাকে হস্তান্তর করা হয়েছে।";
  }

  // Pattern: Buyer refused parcel at doorstep...
  if (/^Buyer refused parcel at doorstep/i.test(n)) {
    return "ক্রেতা দরজায় পার্সেল নিতে অস্বীকৃতি জানিয়েছেন। শিপিং চার্জ ক্ষতিপূরণ বিক্রেতাকে দেওয়া হয়েছে এবং বাকি টাকা ক্রেতাকে ফেরত দেওয়া হয়েছে।";
  }

  // Pattern: Buyer requested return: [Reason]...
  const mReturnReq = n.match(/^Buyer requested return:\s*(.+?)\.\s*Auto-release countdown stopped\./i);
  if (mReturnReq) {
    return `ক্রেতা রিটার্ন চেয়েছেন: ${mReturnReq[1]}। অটো-রিলিজ কাউন্টডাউন স্থগিত করা হয়েছে।`;
  }

  // Pattern: Buyer dispatched return via [Courier] (Tracking ID: [ID])
  const mReturnDisp = n.match(/^Buyer dispatched return via\s+([^\(]+)\s*\(Tracking ID:\s*([^\)]+)\)/i);
  if (mReturnDisp) {
    return `ক্রেতা ${mReturnDisp[1].trim()} (ট্র্যাকিং আইডি: ${mReturnDisp[2].trim()}) এর মাধ্যমে রিটার্ন পার্সেল পাঠিয়েছেন।`;
  }

  // Pattern: Return item received. Buyer refunded [Amount] BDT (deductions: [Deduction] BDT return fee).
  const mReturnRecv = n.match(/^Return item received\.\s*Buyer refunded\s+([\d,]+)\s*BDT(?:\s*\(deductions:\s*([\d,]+)\s*BDT return fee\))?/i);
  if (mReturnRecv) {
    const refund = mReturnRecv[1];
    const deduction = mReturnRecv[2];
    if (deduction) {
      return `রিটার্ন পার্সেল বিক্রেতা বুঝে পেয়েছেন। ক্রেতাকে ${refund} টাকা রিফান্ড প্রদান করা হয়েছে (কাটতি: ${deduction} টাকা রিটার্ন ফি)।`;
    }
    return `রিটার্ন পার্সেল বিক্রেতা বুঝে পেয়েছেন। ক্রেতাকে ${refund} টাকা রিফান্ড প্রদান করা হয়েছে।`;
  }

  // Pattern: Seller did not ship within agreed deadline. Buyer fully refunded.
  if (/^Seller did not ship within agreed deadline\.\s*Buyer fully refunded\./i.test(n)) {
    return "নির্ধারিত সময়সীমার মধ্যে বিক্রেতা পণ্য না পাঠানোয় ক্রেতাকে সম্পূর্ণ রিফান্ড প্রদান করা হয়েছে।";
  }

  // Pattern: Manual courier slip marked [status] by admin.
  const mSlip = n.match(/^Manual courier slip marked\s+(\w+)\s+by admin\./i);
  if (mSlip) {
    const st = mSlip[1].toLowerCase() === "approved" ? "অনুমোদন" : "প্রত্যাখ্যান";
    return `অ্যাডমিন ম্যানুয়াল কুরিয়ার স্লিপ ${st} করেছেন।`;
  }

  // Pattern: Dispute opened by [Party]: [Reason]
  const mDisputeOpen = n.match(/^Dispute opened by\s+(.+?):\s*(.+)/i);
  if (mDisputeOpen) {
    const party = mDisputeOpen[1].toLowerCase() === "buyer" ? "ক্রেতা" : "বিক্রেতা";
    return `${party} কর্তৃক বিরোধ দায়ের: ${mDisputeOpen[2]}`;
  }

  // Pattern: Admin decided in favor of buyer: [Notes]
  const mDisputeUpheld = n.match(/^Admin decided in favor of buyer:\s*(.+)/i);
  if (mDisputeUpheld) {
    return `অ্যাডমিন ক্রেতার পক্ষে সিদ্ধান্ত দিয়েছেন: ${mDisputeUpheld[1]}`;
  }

  // Pattern: Admin rejected dispute: [Notes]
  const mDisputeRej = n.match(/^Admin rejected dispute:\s*(.+)/i);
  if (mDisputeRej) {
    return `অ্যাডমিন বিরোধ খারিজ করেছেন: ${mDisputeRej[1]}`;
  }

  // Pattern: Admin force released funds to seller. Notes: [Notes]
  const mForceRel = n.match(/^Admin force released funds to seller\.\s*Notes:\s*(.+)/i);
  if (mForceRel) {
    return `অ্যাডমিন বিক্রেতাকে তহবিল হস্তান্তর করেছেন। নোট: ${mForceRel[1]}`;
  }

  // Pattern: Admin force refunded deal to buyer. Notes: [Notes]
  const mForceRef = n.match(/^Admin force refunded deal to buyer\.\s*Notes:\s*(.+)/i);
  if (mForceRef) {
    return `অ্যাডমিন ক্রেতাকে রিফান্ড প্রদান করেছেন। নোট: ${mForceRef[1]}`;
  }

  return note;
}

export function translateLedgerType(type: string, lang: Lang): string {
  if (lang !== "bn") return (type || "").toUpperCase();
  const t = (type || "").toLowerCase();
  if (t === "hold") return "হোল্ড (জমা)";
  if (t === "payout_seller") return "সেলার পে-আউট";
  if (t === "refund_buyer") return "বায়ার রিফান্ড";
  if (t === "platform_fee") return "সার্ভিস ফি";
  return (type || "").toUpperCase();
}

export function translateLedgerNote(note: string, lang: Lang): string {
  if (lang !== "bn" || !note) return note;

  const n = note.trim();

  // Pattern: Escrow hold funded via [Method] (Sender: [Sender], TrxID: [TrxID])
  const mHold = n.match(/^Escrow hold funded via\s+(.+?)\s*\(Sender:\s*([^,]+),\s*TrxID:\s*([^\)]+)\)/i);
  if (mHold) {
    return `${mHold[1]} এর মাধ্যমে এসক্রো তহবিল জমা হয়েছে (প্রেরক: ${mHold[2].trim()}, TrxID: ${mHold[3].trim()})`;
  }

  // Pattern: Seller payout for deal #[Code]
  const mPayout = n.match(/^Seller payout for deal\s*#?([A-Za-z0-9_-]+)/i);
  if (mPayout) {
    return `#${mPayout[1]} ডিলের জন্য বিক্রেতার পে-আউট`;
  }

  // Pattern: Platform service fee for deal #[Code]
  const mFee = n.match(/^Platform service fee for (?:deal\s*)?#?([A-Za-z0-9_-]+)/i);
  if (mFee) {
    return `#${mFee[1]} ডিলের জন্য প্ল্যাটফর্ম সার্ভিস ফি`;
  }

  // Pattern: Delivery & return shipping compensation for refused order #[Code]
  const mRefusedPayout = n.match(/^Delivery & return shipping compensation for refused order\s*#?([A-Za-z0-9_-]+)/i);
  if (mRefusedPayout) {
    return `প্রত্যাখ্যাত #${mRefusedPayout[1]} অর্ডারের ডেলিভারি ও রিটার্ন ক্ষতিপূরণ বাবদ বিক্রেতাকে পে-আউট`;
  }

  // Pattern: Refund after delivery deductions for refused order #[Code]
  const mRefusedRefund = n.match(/^Refund after delivery deductions for refused order\s*#?([A-Za-z0-9_-]+)/i);
  if (mRefusedRefund) {
    return `প্রত্যাখ্যাত #${mRefusedRefund[1]} অর্ডারের ডেলিভারি ফি বাদে ক্রেতাকে রিফান্ড`;
  }

  // Pattern: Refund to buyer after return received for #[Code]
  const mReturnRefund = n.match(/^Refund to buyer after return received for\s*#?([A-Za-z0-9_-]+)/i);
  if (mReturnRefund) {
    return `রিটার্ন পার্সেল প্রাপ্তির পর #${mReturnRefund[1]} ডিলের জন্য ক্রেতাকে রিফান্ড`;
  }

  // Pattern: Admin force released funds for #[Code]. Reason: [Reason]
  const mAdminRel = n.match(/^Admin force released funds for\s*#?([A-Za-z0-9_-]+)\.\s*Reason:\s*(.+)/i);
  if (mAdminRel) {
    return `#${mAdminRel[1]} ডিলের প্রশাসনিক রিলিজ। কারণ: ${mAdminRel[2]}`;
  }

  // Pattern: Admin force refunded buyer for #[Code]. Reason: [Reason]
  const mAdminRef = n.match(/^Admin force refunded buyer for\s*#?([A-Za-z0-9_-]+)\.\s*Reason:\s*(.+)/i);
  if (mAdminRef) {
    return `#${mAdminRef[1]} ডিলের প্রশাসনিক রিফান্ড। কারণ: ${mAdminRef[2]}`;
  }

  return note;
}

export function translateTrackingNote(note: string, lang: Lang): string {
  if (lang !== "bn" || !note) return note;
  if (/\[MOCK SIMULATION\] Automated status update/i.test(note)) {
    return "[মক সিমুলেশন] স্বয়ংক্রিয় স্ট্যাটাস আপডেট";
  }
  if (/Courier tracking milestone/i.test(note)) {
    return "কুরিয়ার ট্র্যাকিং মাইলফলক";
  }
  return note;
}

export function translateCourierStatus(status: string, lang: Lang): string {
  if (lang !== "bn") return status || "";
  const s = (status || "").toLowerCase().replace(/[\s-]/g, "_");
  if (s === "in_transit" || s === "intransit") return "ইন-ট্রানজিট (পথে আছে)";
  if (s === "picked_up" || s === "pickedup") return "সংগ্রহ সম্পন্ন";
  if (s === "delivered") return "ডেলিভারি সম্পন্ন";
  if (s === "refused") return "প্রত্যাখ্যাত";
  if (s === "returned") return "রিটার্ন সম্পন্ন";
  if (s === "out_for_delivery") return "ডেলিভারির জন্য চলমান";
  if (s === "order_created") return "অর্ডার বুকিং সম্পন্ন";
  if (s === "cancelled") return "বাতিল";
  if (s === "lost") return "হারিয়ে গেছে";
  return status;
}
