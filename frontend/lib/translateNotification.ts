export type Lang = "en" | "bn";

const TITLE_TRANSLATIONS: Record<string, string> = {
  "Deal Ready for Payment": "পেমেন্টের জন্য ডিল প্রস্তুত",
  "Parcel Delivered": "পার্সেল ডেলিভারি সম্পন্ন",
  "New Dispute Filed": "নতুন বিরোধ দায়ের করা হয়েছে",
  "Escrow Payment Confirmed": "এসক্রো পেমেন্ট নিশ্চিত হয়েছে",
  "Buyer Paid – Ship Parcel Now": "বায়ার পেমেন্ট সম্পন্ন – পার্সেল শিপ করুন",
  "Parcel Shipped": "পার্সেল পাঠানো হয়েছে",
  "Parcel Delivered – 24h Review Window": "পার্সেল ডেলিভারি – ২৪ ঘণ্টার রিভিউ উইন্ডো",
  "Delivery Confirmed": "ডেলিভারি নিশ্চিত হয়েছে",
  "Order Refused – Refund Processed": "অর্ডার প্রত্যাখ্যান – রিফান্ড সম্পন্ন",
  "Order Refused": "অর্ডার প্রত্যাখ্যান করা হয়েছে",
  "Deal Completed": "ডিল সফলভাবে সম্পন্ন হয়েছে",
  "Funds Released to Seller": "বিক্রেতার নিকট তহবিল হস্তান্তর",
  "Return Requested": "রিটার্ন অনুরোধ জমা হয়েছে",
  "Return Requested by Buyer": "বায়ার রিটার্ন অনুরোধ করেছেন",
  "Return Shipment Recorded": "রিটার্ন শিপমেন্ট রেকর্ড করা হয়েছে",
  "Return Package Dispatched": "রিটার্ন পার্সেল পাঠানো হয়েছে",
  "Return Refund Processed": "রিটার্ন রিফান্ড প্রক্রিয়া সম্পন্ন",
  "Return Complete": "রিটার্ন সম্পন্ন",
  "Dispute Under Review": "বিরোধ পর্যালোচনাধীন",
  "Dispute Alert": "বিরোধের সতর্কতা",
  "Dispute Decision": "বিরোধের সিদ্ধান্ত",
  "Auto-Refund: Seller Dispatch Timeout": "অটো-রিফান্ড: পার্সেল শিপিং সময় উত্তীর্ণ",
  "Auto-Release: Delivery Confirmation Timeout": "অটো-রিলিজ: ডেলিভারি কনফার্মেশন সময় উত্তীর্ণ",
  "PakkaDeal Update": "পাক্কাডিল আপডেট",
};

/**
 * Translates notification title and message based on the active language
 */
export function translateNotification(
  rawTitle: string,
  rawMessage: string,
  lang: Lang
): { title: string; message: string } {
  if (lang !== "bn") {
    return { title: rawTitle, message: rawMessage };
  }

  // 1. Title Translation
  const cleanTitle = (rawTitle || "").trim();
  const title = TITLE_TRANSLATIONS[cleanTitle] || cleanTitle;

  // 2. Message Translation with Pattern Matching
  let msg = (rawMessage || "").trim();

  // Pattern: [Seller] created deal [Code]. Please deposit into escrow to secure your order.
  const mCreated = msg.match(/^(.+?)\s+created deal\s+([A-Za-z0-9_-]+)\.\s*Please deposit into escrow to secure your order\./i);
  if (mCreated) {
    return {
      title,
      message: `${mCreated[1]} #${mCreated[2]} ডিল তৈরি করেছেন। আপনার অর্ডার নিশ্চিত করতে অনুগ্রহ করে এসক্রোতে টাকা জমা দিন।`,
    };
  }

  // Pattern: Your order [Code] has been delivered by [Courier] Courier. Please inspect and confirm receipt within [Hours] hours.
  const mDeliveredSeed = msg.match(/^Your order\s+([A-Za-z0-9_-]+)\s+has been delivered by\s+(.+?)\s+Courier\.\s*Please inspect and confirm receipt within\s+(\d+)\s+hours\./i);
  if (mDeliveredSeed) {
    return {
      title,
      message: `${mDeliveredSeed[2]} কুরিয়ারের মাধ্যমে আপনার #${mDeliveredSeed[1]} অর্ডার ডেলিভারি হয়েছে। অনুগ্রহ করে ${mDeliveredSeed[3]} ঘণ্টার মধ্যে পণ্য যাচাই করে রসিদ নিশ্চিত করুন।`,
    };
  }

  // Pattern: Buyer [Name] filed a dispute on deal [Code] ([Reason]). Review required.
  const mDisputeSeed = msg.match(/^Buyer\s+(.+?)\s+filed a dispute on deal\s+([A-Za-z0-9_-]+)\s*\((.+?)\)\.\s*Review required\./i);
  if (mDisputeSeed) {
    return {
      title,
      message: `ক্রেতা ${mDisputeSeed[1]} #${mDisputeSeed[2]} ডিলে একটি বিরোধ দায়ের করেছেন (${mDisputeSeed[3]})। পর্যালোচনার প্রয়োজন।`,
    };
  }

  // Pattern: PakkaDeal: Payment confirmed ([Amount] BDT) for deal #[Code]. TrxID: [TrxID]. Funds are safely held in PakkaDeal Escrow Vault.
  const mPay = msg.match(/Payment confirmed\s*\(([\d,]+)\s*BDT\)\s*for deal\s*#?([A-Za-z0-9_-]+)\.\s*TrxID:\s*([A-Za-z0-9_-]+)\.\s*Funds are safely held in PakkaDeal Escrow Vault\./i);
  if (mPay) {
    return {
      title,
      message: `পাক্কাডিল: #${mPay[2]} ডিলের পেমেন্ট (${mPay[1]} টাকা) নিশ্চিত হয়েছে। TrxID: ${mPay[3]}। তহবিল পাক্কাডিল এসক্রো ভল্টে সম্পূর্ণ সুরক্ষিত আছে।`,
    };
  }

  // Pattern: PakkaDeal: Buyer has paid [Amount] BDT into escrow for deal #[Code]. Buyer has paid, you can ship now within [Hours] hours.
  const mBuyerPaid = msg.match(/Buyer has paid\s*([\d,]+)\s*BDT into escrow for deal\s*#?([A-Za-z0-9_-]+)\.\s*Buyer has paid,\s*you can ship now within\s*(\d+)\s*hours\./i);
  if (mBuyerPaid) {
    return {
      title,
      message: `পাক্কাডিল: বায়ার #${mBuyerPaid[2]} ডিলের জন্য এসক্রোতে ${mBuyerPaid[1]} টাকা জমা দিয়েছেন। আপনি আগামী ${mBuyerPaid[3]} ঘণ্টার মধ্যে পার্সেলটি পাঠিয়ে ট্র্যাকিং যুক্ত করুন।`,
    };
  }

  // Pattern: PakkaDeal #[Code]: Parcel dispatched with [Courier] ([Tracking]). Track shipment online.
  const mShipped = msg.match(/PakkaDeal\s*#?([A-Za-z0-9_-]+):\s*Parcel dispatched with\s*([^\(]+)\s*\(([^\)]+)\)\.\s*Track shipment online\./i);
  if (mShipped) {
    return {
      title,
      message: `পাক্কাডিল #${mShipped[1]}: ${mShipped[2].trim()} (${mShipped[3].trim()}) এর মাধ্যমে পার্সেল পাঠানো হয়েছে। অনলাইনে শিপমেন্ট ট্র্যাক করতে পারবেন।`,
    };
  }

  // Pattern: PakkaDeal #[Code]: Delivered! Please inspect item and confirm receipt in your dashboard within 24 hours before automatic fund release.
  const mDelivered24 = msg.match(/PakkaDeal\s*#?([A-Za-z0-9_-]+):\s*Delivered!\s*Please inspect item and confirm receipt in your dashboard within\s*(\d+)\s*hours before automatic fund release\./i);
  if (mDelivered24) {
    return {
      title,
      message: `পাক্কাডিল #${mDelivered24[1]}: পার্সেল ডেলিভারি সম্পন্ন! স্বয়ংক্রিয় তহবিল রিলিজের পূর্বে ${mDelivered24[2]} ঘণ্টার মধ্যে পণ্য যাচাই করে রসিদ নিশ্চিত করুন।`,
    };
  }

  // Pattern: PakkaDeal #[Code]: Courier confirmed delivery to buyer. 24-hour confirmation countdown is now active.
  const mCourierDeliv = msg.match(/PakkaDeal\s*#?([A-Za-z0-9_-]+):\s*Courier confirmed delivery to buyer\.\s*(\d+)-hour confirmation countdown is now active\./i);
  if (mCourierDeliv) {
    return {
      title,
      message: `পাক্কাডিল #${mCourierDeliv[1]}: কুরিয়ার ক্রেতার নিকট ডেলিভারি নিশ্চিত করেছে। ${mCourierDeliv[2]} ঘণ্টার নিশ্চিতকরণ কাউন্টডাউন সক্রিয় হয়েছে।`,
    };
  }

  // Pattern: PakkaDeal #[Code]: Order refused at doorstep. Refund of [Amount] BDT processed after delivery charges.
  const mRefusedRefund = msg.match(/PakkaDeal\s*#?([A-Za-z0-9_-]+):\s*Order refused at doorstep\.\s*Refund of\s*([\d,]+)\s*BDT processed after delivery charges\./i);
  if (mRefusedRefund) {
    return {
      title,
      message: `পাক্কাডিল #${mRefusedRefund[1]}: দরজায় পার্সেল গ্রহণে অস্বীকৃতি জানানো হয়েছে। ডেলিভারি চার্জ বাদ দিয়ে বাকি ${mRefusedRefund[2]} টাকা রিফান্ড প্রক্রিয়া সম্পন্ন হয়েছে।`,
    };
  }

  // Pattern: PakkaDeal #[Code]: Order refused at doorstep. Shipping charge compensation ([Amount] BDT) released to your account.
  const mRefusedSeller = msg.match(/PakkaDeal\s*#?([A-Za-z0-9_-]+):\s*Order refused at doorstep\.\s*Shipping charge compensation\s*\(([\d,]+)\s*BDT\)\s*released to your account\./i);
  if (mRefusedSeller) {
    return {
      title,
      message: `পাক্কাডিল #${mRefusedSeller[1]}: দরজায় পার্সেল গ্রহণে অস্বীকৃতি জানানো হয়েছে। শিপিং চার্জ ক্ষতিপূরণ (${mRefusedSeller[2]} টাকা) আপনার অ্যাকাউন্টে জমা হয়েছে।`,
    };
  }

  // Pattern: PakkaDeal #[Code]: Deal successfully completed. Thank you for using PakkaDeal Escrow!
  const mCompleted = msg.match(/PakkaDeal\s*#?([A-Za-z0-9_-]+):\s*Deal successfully completed\.\s*Thank you for using PakkaDeal Escrow!/i);
  if (mCompleted) {
    return {
      title,
      message: `পাক্কাডিল #${mCompleted[1]}: ডিল সফলভাবে সম্পন্ন হয়েছে। পাক্কাডিল এসক্রো ব্যবহারের জন্য আপনাকে ধন্যবাদ!`,
    };
  }

  // Pattern: PakkaDeal #[Code]: [Payout] BDT released to your account (minus [Fee] BDT platform fee).
  const mPayout = msg.match(/PakkaDeal\s*#?([A-Za-z0-9_-]+):\s*([\d,]+)\s*BDT released to your account\s*\(minus\s*([\d,]+)\s*BDT platform fee\)\./i);
  if (mPayout) {
    return {
      title,
      message: `পাক্কাডিল #${mPayout[1]}: প্ল্যাটফর্ম ফি (${mPayout[3]} টাকা) বাদে ${mPayout[2]} টাকা আপনার অ্যাকাউন্টে হস্তান্তর করা হয়েছে।`,
    };
  }

  // Pattern: PakkaDeal #[Code]: Return request submitted. Please ship item back to seller and input return tracking ID.
  const mReturnReq = msg.match(/PakkaDeal\s*#?([A-Za-z0-9_-]+):\s*Return request submitted\.\s*Please ship item back to seller and input return tracking ID\./i);
  if (mReturnReq) {
    return {
      title,
      message: `পাক্কাডিল #${mReturnReq[1]}: রিটার্ন অনুরোধ জমা হয়েছে। দয়া করে পণ্যটি বিক্রেতার ঠিকানায় ফেরত পাঠিয়ে ট্র্যাকিং আইডি প্রদান করুন।`,
    };
  }

  // Pattern: PakkaDeal #[Code]: Buyer requested return ([Reason]). Auto-release paused. Awaiting buyer return shipment.
  const mReturnSeller = msg.match(/PakkaDeal\s*#?([A-Za-z0-9_-]+):\s*Buyer requested return\s*\((.+?)\)\.\s*Auto-release paused\.\s*Awaiting buyer return shipment\./i);
  if (mReturnSeller) {
    return {
      title,
      message: `পাক্কাডিল #${mReturnSeller[1]}: বায়ার রিটার্ন চেয়েছেন (${mReturnSeller[2]})। অটো-রিলিজ স্থগিত রাখা হয়েছে। বায়ারের রিটার্ন শিপমেন্টের অপেক্ষা করা হচ্ছে।`,
    };
  }

  // Pattern: PakkaDeal #[Code]: Return shipment recorded ([Courier] [Tracking]). Seller will inspect on arrival.
  const mReturnRecorded = msg.match(/PakkaDeal\s*#?([A-Za-z0-9_-]+):\s*Return shipment recorded\s*\((.+?)\)\.\s*Seller will inspect on arrival\./i);
  if (mReturnRecorded) {
    return {
      title,
      message: `পাক্কাডিল #${mReturnRecorded[1]}: রিটার্ন শিপমেন্ট রেকর্ড করা হয়েছে (${mReturnRecorded[2]})। পার্সেল পৌঁছানোর পর বিক্রেতা তা যাচাই করবেন।`,
    };
  }

  // Pattern: PakkaDeal #[Code]: Buyer dispatched return package via [Courier] ([Tracking]). Please confirm receipt upon arrival.
  const mReturnDispatched = msg.match(/PakkaDeal\s*#?([A-Za-z0-9_-]+):\s*Buyer dispatched return package via\s*([^\(]+)\s*\(([^\)]+)\)\.\s*Please confirm receipt upon arrival\./i);
  if (mReturnDispatched) {
    return {
      title,
      message: `পাক্কাডিল #${mReturnDispatched[1]}: বায়ার ${mReturnDispatched[2].trim()} (${mReturnDispatched[3].trim()}) এর মাধ্যমে রিটার্ন পার্সেল পাঠিয়েছেন। হাতে পেলে দয়া করে রসিদ নিশ্চিত করুন।`,
    };
  }

  // Pattern: PakkaDeal #[Code]: Return verified. [Amount] BDT refunded to you.
  const mReturnRefund = msg.match(/PakkaDeal\s*#?([A-Za-z0-9_-]+):\s*Return verified\.\s*([\d,]+)\s*BDT refunded to you\./i);
  if (mReturnRefund) {
    return {
      title,
      message: `পাক্কাডিল #${mReturnRefund[1]}: রিটার্ন যাচাই সম্পন্ন হয়েছে। আপনার নিকট ${mReturnRefund[2]} টাকা রিফান্ড প্রদান করা হয়েছে।`,
    };
  }

  // Pattern: PakkaDeal #[Code]: Return parcel delivery confirmed. Deal concluded.
  const mReturnDone = msg.match(/PakkaDeal\s*#?([A-Za-z0-9_-]+):\s*Return parcel delivery confirmed\.\s*Deal concluded\./i);
  if (mReturnDone) {
    return {
      title,
      message: `পাক্কাডিল #${mReturnDone[1]}: রিটার্ন পার্সেল ডেলিভারি নিশ্চিত হয়েছে। ডিলের লেনদেন সমাপ্ত।`,
    };
  }

  // Pattern: PakkaDeal #[Code]: Dispute submitted for admin review. Escrow funds remain frozen.
  const mDisputeFrozen = msg.match(/PakkaDeal\s*#?([A-Za-z0-9_-]+):\s*Dispute submitted for admin review\.\s*Escrow funds remain frozen\./i);
  if (mDisputeFrozen) {
    return {
      title,
      message: `পাক্কাডিল #${mDisputeFrozen[1]}: বিরোধ পর্যালোচনার জন্য অ্যাডমিনের নিকট জমা হয়েছে। এসক্রো তহবিল স্থগিত রাখা হয়েছে।`,
    };
  }

  // Pattern: PakkaDeal #[Code]: Buyer reported an issue. PakkaDeal admin will review evidence before funds move.
  const mDisputeAlert = msg.match(/PakkaDeal\s*#?([A-Za-z0-9_-]+):\s*Buyer reported an issue\.\s*PakkaDeal admin will review evidence before funds move\./i);
  if (mDisputeAlert) {
    return {
      title,
      message: `পাক্কাডিল #${mDisputeAlert[1]}: ক্রেতা একটি সমস্যা রিপোর্ট করেছেন। তহবিল স্থানান্তরের পূর্বে অ্যাডমিন সমস্ত প্রমাণ পর্যালোচনা করবেন।`,
    };
  }

  // Pattern: PakkaDeal #[Code]: Other party confirmed completion. Please confirm in your dashboard to release funds.
  const mOtherParty = msg.match(/PakkaDeal\s*#?([A-Za-z0-9_-]+):\s*Other party confirmed completion\.\s*Please confirm in your dashboard to release funds\./i);
  if (mOtherParty) {
    return {
      title,
      message: `পাক্কাডিল #${mOtherParty[1]}: অপর পক্ষ কাজ সম্পন্ন নিশ্চিত করেছেন। তহবিল রিলিজের জন্য অনুগ্রহ করে আপনার ড্যাশবোর্ড থেকে নিশ্চিত করুন।`,
    };
  }

  // Pattern: PakkaDeal #[Code]: Administrative review completed. Funds released to seller.
  const mAdminRelease = msg.match(/PakkaDeal\s*#?([A-Za-z0-9_-]+):\s*Administrative review completed\.\s*Funds released to seller\./i);
  if (mAdminRelease) {
    return {
      title,
      message: `পাক্কাডিল #${mAdminRelease[1]}: প্রশাসনিক পর্যালোচনা সম্পন্ন হয়েছে। তহবিল বিক্রেতার নিকট হস্তান্তর করা হয়েছে।`,
    };
  }

  // Pattern: PakkaDeal #[Code]: Full refund of [Amount] BDT processed by admin.
  const mAdminRefund = msg.match(/PakkaDeal\s*#?([A-Za-z0-9_-]+):\s*Full refund of\s*([\d,]+)\s*BDT processed by admin\./i);
  if (mAdminRefund) {
    return {
      title,
      message: `পাক্কাডিল #${mAdminRefund[1]}: অ্যাডমিন পর্যালোচনার ভিত্তিতে সম্পূর্ণ ${mAdminRefund[2]} টাকা রিফান্ডের প্রক্রিয়া সম্পন্ন হয়েছে।`,
    };
  }

  // Pattern: PakkaDeal #[Code]: Dispute resolved via split. [Amount] BDT refunded to you.
  const mAdminSplit = msg.match(/PakkaDeal\s*#?([A-Za-z0-9_-]+):\s*Dispute resolved via split\.\s*([\d,]+)\s*BDT refunded to you\./i);
  if (mAdminSplit) {
    return {
      title,
      message: `পাক্কাডিল #${mAdminSplit[1]}: বিরোধ আপোসের মাধ্যমে মীমাংসিত হয়েছে। আপনাকে ${mAdminSplit[2]} টাকা ফেরত দেওয়া হয়েছে।`,
    };
  }

  // Pattern: PakkaDeal #[Code]: Dispute upheld. Full refund of [Amount] BDT processed.
  const mDisputeUpheld = msg.match(/PakkaDeal\s*#?([A-Za-z0-9_-]+):\s*Dispute upheld\.\s*Full refund of\s*([\d,]+)\s*BDT processed\./i);
  if (mDisputeUpheld) {
    return {
      title,
      message: `পাক্কাডিল #${mDisputeUpheld[1]}: বিরোধে ক্রেতার দাবি বহাল রাখা হয়েছে। সম্পূর্ণ ${mDisputeUpheld[2]} টাকা রিফান্ড করা হয়েছে।`,
    };
  }

  // Pattern: PakkaDeal #[Code]: Dispute reviewed and concluded in seller favor.
  const mDisputeSellerFavor = msg.match(/PakkaDeal\s*#?([A-Za-z0-9_-]+):\s*Dispute reviewed and concluded in seller favor\./i);
  if (mDisputeSellerFavor) {
    return {
      title,
      message: `পাক্কাডিল #${mDisputeSellerFavor[1]}: বিরোধ পর্যালোচনা শেষে বিক্রেতার পক্ষে নিষ্পত্তি করা হয়েছে।`,
    };
  }

  // Pattern: PakkaDeal #[Code]: Dispute dismissed. [Amount] BDT released to your account.
  const mDisputeDismissed = msg.match(/PakkaDeal\s*#?([A-Za-z0-9_-]+):\s*Dispute dismissed\.\s*([\d,]+)\s*BDT released to your account\./i);
  if (mDisputeDismissed) {
    return {
      title,
      message: `পাক্কাডিল #${mDisputeDismissed[1]}: বিরোধ খারিজ করা হয়েছে। ${mDisputeDismissed[2]} টাকা আপনার অ্যাকাউন্টে হস্তান্তর করা হয়েছে।`,
    };
  }

  return { title, message: msg };
}
