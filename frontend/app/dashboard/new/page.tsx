"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { post } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";

export default function CreateDealPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { calculateFee, formatFeePercent, minDeliveryDeposit } = useSettings();
  const router = useRouter();

  const [dealType, setDealType] = useState<"product" | "rental" | "service">("product");
  const [paymentMode, setPaymentMode] = useState<"delivery_only" | "full_payment">("delivery_only");
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [product, setProduct] = useState("");
  const [details, setDetails] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("Dhaka");
  const [price, setPrice] = useState<number>(3500);
  const [deliveryCharge, setDeliveryCharge] = useState<number>(100);
  const [returnPolicy, setReturnPolicy] = useState<"buyer_pays" | "seller_pays" | "no_returns">("buyer_pays");
  const [returnCharge, setReturnCharge] = useState<number>(100);
  const [courierName, setCourierName] = useState("Steadfast");
  const [trustedDiscountPercent, setTrustedDiscountPercent] = useState<number>(0);
  const [listingPhotos, setListingPhotos] = useState<{ file: File; preview: string }[]>([]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const charge = dealType === "product" ? Number(deliveryCharge) || 0 : 0;
  const isDeliveryOnly = dealType === "product" && paymentMode === "delivery_only";
  const rc = returnPolicy !== "no_returns" ? Number(returnCharge) || 0 : charge;
  const heldDeposit = isDeliveryOnly ? Math.max(charge + rc, minDeliveryDeposit) : Number(price || 0) + charge;
  const escrowFee = calculateFee(heldDeposit);
  const totalBuyerDeposit = heldDeposit + escrowFee;
  const codAmount = isDeliveryOnly ? Number(price || 0) : 0;
  const sellerPayout = Number(price || 0) + charge;

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selected = Array.from(e.target.files).slice(0, 3 - listingPhotos.length);
    const newItems = selected.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setListingPhotos((prev) => [...prev, ...newItems].slice(0, 3));
  };

  const removePhoto = (idx: number) => {
    setListingPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);

    try {
      const base64Photos = await Promise.all(
        listingPhotos.map(
          (item) =>
            new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(item.file);
            })
        )
      );

      const res = await post("/deals", {
        deal_type: dealType,
        payment_mode: dealType === "product" ? paymentMode : "full_payment",
        buyer_name: buyerName,
        buyer_phone: buyerPhone,
        product,
        details,
        address,
        area,
        price,
        delivery_charge: charge,
        return_policy: returnPolicy,
        return_charge: returnCharge,
        courier_name: courierName,
        trusted_discount_percent: isDeliveryOnly ? trustedDiscountPercent : 0,
        listing_photos: base64Photos,
      });

      router.push(`/deal/${res.code}`);
    } catch (x: any) {
      setErr(x.message || "Failed to create deal");
      setLoading(false);
    }
  }

  const isProfileComplete = Boolean(user?.bkash_number);

  return (
    <div className="max-w-4xl space-y-8">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("newDeal")}</h1>
        <p className="text-sm text-neutral-500">
          {t("newDealSub")}
        </p>
      </div>

      {!isProfileComplete && (
        <div className="box p-5 border-2 border-amber-500 bg-amber-500/10 space-y-3">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-sm">
            <span>⚠️</span>
            <span>{lang === "bn" ? "প্রোফাইল অসম্পূর্ণ: বিকাশ অ্যাকাউন্ট যুক্ত করা আবশ্যক" : "Profile Incomplete: bKash Account Required"}</span>
          </div>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            {lang === "bn"
              ? "এসক্রো ডিল তৈরি করার আগে অনুগ্রহ করে আপনার প্রোফাইলে বিকাশ অ্যাকাউন্ট নম্বর ও অ্যাকাউন্ট টাইপ যুক্ত করুন।"
              : "Before creating an escrow deal, you must add your bKash payout number and account type in your profile."}
          </p>
          <Link href="/dashboard/profile" className="btn text-xs inline-block py-2 px-4">
            {lang === "bn" ? "প্রোফাইল সম্পূর্ণ করুন →" : "Complete Profile →"}
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 space-y-6">
          {/* Deal Type Selection */}
          <div className="space-y-2">
            <label>{t("dealType")}</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { id: "product", label: t("productCourier") },
                { id: "rental", label: t("rentalAdvance") },
                { id: "service", label: t("serviceHandover") },
              ].map((dt) => (
                <button
                  key={dt.id}
                  type="button"
                  onClick={() => setDealType(dt.id as any)}
                  className={`p-3 text-left border text-xs font-semibold ${
                    dealType === dt.id
                      ? "border-accent bg-accent text-white"
                      : "border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-700 dark:text-neutral-300"
                  }`}
                >
                  {dt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Item details */}
          <div className="space-y-4">
            <div>
              <label htmlFor="deal-product-input">{t("product")}</label>
              <input
                id="deal-product-input"
                required
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder={
                  lang === "bn"
                    ? dealType === "product"
                      ? "যেমন: সোনি WH-1000XM5 হেডফোন"
                      : dealType === "rental"
                      ? "যেমন: ফ্ল্যাট ৪বি-এর জন্য ২ মাসের জামানত"
                      : "যেমন: ই-কমার্স ওয়েবসাইট ফ্রন্টএন্ড মাইলস্টোন"
                    : dealType === "product"
                    ? "e.g. Sony WH-1000XM5 Headphones"
                    : dealType === "rental"
                    ? "e.g. 2-Month Security Deposit for Studio 4B"
                    : "e.g. E-Commerce Website Frontend Milestone"
                }
              />
            </div>

            <div>
              <label htmlFor="deal-details-input">{t("details")}</label>
              <textarea
                id="deal-details-input"
                rows={3}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={
                  lang === "bn"
                    ? "পণ্যের অবস্থা, ওয়ারেন্টি, স্পেসিফিকেশন বা চুক্তির শর্তাবলী উল্লেখ করুন..."
                    : "Include condition, warranty, specifications, or agreed completion terms..."
                }
              />
            </div>
          </div>

          {/* Counterparty Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="buyer-name-input">{t("buyerName")}</label>
              <input
                id="buyer-name-input"
                required
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder={lang === "bn" ? "যেমন: নুসরাত জাহান" : "e.g. Nusrat Jahan"}
              />
            </div>
            <div>
              <label htmlFor="buyer-phone-input">{t("buyerPhone")}</label>
              <input
                id="buyer-phone-input"
                required
                inputMode="tel"
                value={buyerPhone}
                onChange={(e) => setBuyerPhone(e.target.value)}
                placeholder="01XXXXXXXXX"
                className="font-mono"
              />
            </div>
          </div>

          {/* Delivery or Handover Address */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="deal-address-input">{t("address")}</label>
              <input
                id="deal-address-input"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={lang === "bn" ? "বাড়ি, রোড, এলাকা, ল্যান্ডমার্ক" : "House, Road, Area, Landmark"}
              />
            </div>
            <div>
              <label htmlFor="deal-area-select">{t("area")}</label>
              <select id="deal-area-select" value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="Dhaka">{lang === "bn" ? "ঢাকা" : "Dhaka"}</option>
                <option value="Chattogram">{lang === "bn" ? "চট্টগ্রাম" : "Chattogram"}</option>
                <option value="Cumilla">{lang === "bn" ? "কুমিল্লা" : "Cumilla"}</option>
                <option value="Sylhet">{lang === "bn" ? "সিলেট" : "Sylhet"}</option>
                <option value="Rajshahi">{lang === "bn" ? "রাজশাহী" : "Rajshahi"}</option>
                <option value="Khulna">{lang === "bn" ? "খুলনা" : "Khulna"}</option>
                <option value="Barishal">{lang === "bn" ? "বরিশাল" : "Barishal"}</option>
                <option value="Rangpur">{lang === "bn" ? "রংপুর" : "Rangpur"}</option>
              </select>
            </div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="deal-price-input">{t("price")}</label>
              <input
                id="deal-price-input"
                required
                type="number"
                min={1}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value) || 0)}
                className="font-mono"
              />
            </div>
            {dealType === "product" && (
              <div>
                <label htmlFor="delivery-charge-input">{t("charge")}</label>
                <input
                  id="delivery-charge-input"
                  required
                  type="number"
                  min={0}
                  value={deliveryCharge}
                  onChange={(e) => setDeliveryCharge(Number(e.target.value) || 0)}
                  className="font-mono"
                />
              </div>
            )}
          </div>

          {/* Product-Specific Options */}
          {dealType === "product" && (
            <div className="box p-4 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-4">
              {/* Payment Mode Selector */}
              <div className="space-y-2">
                <label htmlFor="deal-payment-mode">{t("paymentMode")}</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMode("delivery_only")}
                    className={`p-3 text-left border text-xs font-semibold ${
                      paymentMode === "delivery_only"
                        ? "border-accent bg-accent text-white"
                        : "border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-700 dark:text-neutral-300"
                    }`}
                  >
                    <span className="block font-bold mb-1">{t("paymentModeDeliveryOnly")}</span>
                    <span className="block text-[11px] opacity-90 font-normal">
                      {t("paymentModeDeliveryOnlyDesc")}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMode("full_payment")}
                    className={`p-3 text-left border text-xs font-semibold ${
                      paymentMode === "full_payment"
                        ? "border-accent bg-accent text-white"
                        : "border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-700 dark:text-neutral-300"
                    }`}
                  >
                    <span className="block font-bold mb-1">{t("paymentModeFullPayment")}</span>
                    <span className="block text-[11px] opacity-90 font-normal">
                      {t("paymentModeFullPaymentDesc")}
                    </span>
                  </button>
                </div>

                {/* Minimum deposit warning if delivery charge is below min_delivery_deposit */}
                {paymentMode === "delivery_only" && charge < minDeliveryDeposit && (
                  <div className="p-3 border border-amber-500/40 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                    <span className="font-bold flex items-center gap-1.5">
                      ⚠️ {t("minDeliveryDepositWarningTitle")}
                    </span>
                    <p className="text-[11px] leading-relaxed">
                      {lang === "bn"
                        ? `ন্যূনতম ডেলিভারি ডিপোজিট ${minDeliveryDeposit} টাকা। আপনার নির্ধারিত ডেলিভারি চার্জ (${charge} টাকা) এর চেয়ে কম হওয়ায় রিটার্ন ও ডেলিভারি খরচের সুরক্ষার্থে ক্রেতা এসক্রোতে ${minDeliveryDeposit} টাকা জমা করবেন।`
                        : `The platform minimum delivery deposit is ${minDeliveryDeposit} BDT. Since your delivery charge (${charge} BDT) is below this, the buyer will deposit ${minDeliveryDeposit} BDT into escrow to ensure return shipping coverage.`}
                    </p>
                  </div>
                )}

                {/* Challenge 1A: Offer reduced deposit to trusted buyers */}
                {paymentMode === "delivery_only" && (
                  <div className="p-3 border border-neutral-200 dark:border-neutral-800 bg-neutral-100/50 dark:bg-neutral-800/30 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <label htmlFor="trusted-discount-slider" className="font-semibold text-neutral-800 dark:text-neutral-200 cursor-pointer">
                        🛡️ {t("offerReducedDeposit")}
                      </label>
                      <span className="font-mono font-bold text-accent px-2 py-0.5 border border-accent/30 bg-accent/10">
                        {trustedDiscountPercent}%
                      </span>
                    </div>
                    <input
                      id="trusted-discount-slider"
                      type="range"
                      min={0}
                      max={70}
                      step={5}
                      value={trustedDiscountPercent}
                      onChange={(e) => setTrustedDiscountPercent(Number(e.target.value) || 0)}
                      className="w-full accent-accent cursor-pointer"
                    />
                    <p className="text-[11px] text-neutral-500">
                      {t("trustedDiscountHelp")}
                    </p>
                  </div>
                )}

                {/* Challenge 2: Listing Evidence Photos (1-3 photos) */}
                <div className="space-y-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                      📷 {t("listingPhotos")}
                    </label>
                    <span className="text-[11px] text-neutral-500 font-mono">
                      {listingPhotos.length}/3
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    {t("listingPhotosHelp")}
                  </p>
                  <div className="flex flex-wrap gap-2 items-center">
                    {listingPhotos.map((item, idx) => (
                      <div key={idx} className="relative w-16 h-16 border border-neutral-300 dark:border-neutral-700 overflow-hidden group">
                        <img src={item.preview} alt={`Listing photo ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(idx)}
                          className="absolute inset-0 bg-black/60 text-white font-bold opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs transition"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {listingPhotos.length < 3 && (
                      <label className="w-16 h-16 border-2 border-dashed border-neutral-300 dark:border-neutral-700 hover:border-accent flex flex-col items-center justify-center text-xs text-neutral-500 cursor-pointer transition">
                        <span className="text-base leading-none">+</span>
                        <span className="text-[9px]">Upload</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          multiple
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="courier-name-select">{t("courierName")}</label>
                  <select
                    id="courier-name-select"
                    value={courierName}
                    onChange={(e) => setCourierName(e.target.value)}
                  >
                    <option value="Steadfast">Steadfast Courier</option>
                    <option value="Pathao">Pathao Courier</option>
                    <option value="RedX">RedX Logistics</option>
                    <option value="Paperfly">Paperfly</option>
                    <option value="eCourier">eCourier</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="return-policy-select">{t("returnPolicy")}</label>
                  <select
                    id="return-policy-select"
                    value={returnPolicy}
                    onChange={(e) => setReturnPolicy(e.target.value as any)}
                  >
                    <option value="buyer_pays">{t("returnBuyerPays")}</option>
                    <option value="seller_pays">{t("returnSellerPays")}</option>
                    <option value="no_returns">{t("returnNone")}</option>
                  </select>
                </div>
              </div>

              {returnPolicy !== "no_returns" && (
                <div>
                  <label htmlFor="return-charge-input">{t("returnCharge")}</label>
                  <input
                    id="return-charge-input"
                    type="number"
                    min={0}
                    value={returnCharge}
                    onChange={(e) => setReturnCharge(Number(e.target.value) || 0)}
                    className="font-mono text-sm"
                  />
                  <span className="text-xs text-neutral-500 mt-1 block">
                    {t("returnChargeHelp")}
                  </span>
                </div>
              )}
            </div>
          )}

          {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}

          <button type="submit" disabled={loading || !isProfileComplete} className="btn w-full py-3 text-base">
            {!isProfileComplete
              ? (lang === "bn" ? "প্রোফাইলে বিকাশ নম্বর যোগ করুন" : "Complete Profile to Create Deal")
              : loading
              ? t("loading")
              : t("createDealBtn")}
          </button>
        </div>

        {/* Live Financial Summary */}
        <div className="lg:col-span-5 space-y-4">
          <div className="box p-5 border-2 border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 space-y-4 sticky top-20">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-neutral-800 pb-2">
              {t("escrowSummaryPreview")}
            </h3>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">{t("agreedItemPrice")}:</span>
                <span className="font-mono font-medium">{price.toLocaleString()} BDT</span>
              </div>
              {dealType === "product" && (
                <div className="flex justify-between">
                  <span className="text-neutral-500">{t("deliveryChargeLabel")}:</span>
                  <span className="font-mono font-medium">{charge.toLocaleString()} BDT</span>
                </div>
              )}

              {/* Breakdown for Buyer */}
              <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 text-xs space-y-2">
                <div className="font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                  {t("payNowIntoEscrow")}:
                </div>
                <div className="flex justify-between items-center text-neutral-600 dark:text-neutral-400 pl-2">
                  <span>{isDeliveryOnly ? (lang === "bn" ? "ডেলিভারি ডিপোজিট (হোল্ড):" : "Delivery Deposit (Held):") : (lang === "bn" ? "পণ্য + ডেলিভারি:" : "Product + Shipping:")}</span>
                  <span className="font-mono font-medium">{heldDeposit.toLocaleString()} BDT</span>
                </div>
                <div className="flex justify-between items-center text-accent pl-2">
                  <span>{lang === "bn" ? `এসক্রো ফি (${formatFeePercent(lang)}):` : `Escrow Fee (${formatFeePercent(lang)}):`}</span>
                  <span className="font-mono font-bold">+{escrowFee.toLocaleString()} BDT</span>
                </div>
                <div className="flex justify-between items-center font-bold text-neutral-900 dark:text-neutral-100 pl-2 pt-1 border-t border-dashed border-neutral-300 dark:border-neutral-700">
                  <span>{lang === "bn" ? "ক্রেতার মোট অগ্রিম জমা:" : "Total Buyer Escrow Deposit:"}</span>
                  <span className="font-mono text-accent font-extrabold">{totalBuyerDeposit.toLocaleString()} BDT</span>
                </div>

                {isDeliveryOnly && codAmount > 0 && (
                  <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 space-y-1">
                    <div className="font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                      {t("payCashOnDelivery")}:
                    </div>
                    <div className="flex justify-between items-center font-bold text-neutral-800 dark:text-neutral-200 pl-2">
                      <span>{lang === "bn" ? "ডোরস্টেপে কুরিয়ারকে প্রদেয়:" : "Due to Courier (COD):"}</span>
                      <span className="font-mono font-bold">{codAmount.toLocaleString()} BDT</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Seller Payout */}
              <div className="flex justify-between border-t border-neutral-300 dark:border-neutral-700 pt-3 font-bold text-base text-emerald-600 dark:text-emerald-400">
                <span>{lang === "bn" ? "আপনার মোট পাওনা:" : t("sellerPayout") + ":"}</span>
                <span className="font-mono">{sellerPayout.toLocaleString()} BDT</span>
              </div>
            </div>

            <div className="p-3 border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
              <strong className="block">✓ {lang === "bn" ? "সম্পূর্ণ পাওনা নিশ্চয়তা" : "Full Payout Guarantee"}</strong>
              <p className="text-[11px] leading-relaxed">
                {lang === "bn"
                  ? isDeliveryOnly
                    ? "ডেলিভারি সম্পন্ন হলে কুরিয়ার থেকে পণ্যের মূল্য এবং এসক্রো থেকে ডেলিভারি ডিপোজিট বুঝে পাবেন। এসক্রো ফি ক্রেতা বহন করেন।"
                    : "ডেলিভারি সম্পন্ন হলে আপনি সম্পূর্ণ টাকা বুঝে পাবেন। এসক্রো ফি ক্রেতা বহন করেন।"
                  : isDeliveryOnly
                    ? "Upon delivery, collect the product price from courier COD and receive the delivery deposit from escrow. Escrow fees are paid by the buyer."
                    : "You will receive your full agreed payout upon successful delivery. Platform escrow fees are paid by the buyer."}
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
