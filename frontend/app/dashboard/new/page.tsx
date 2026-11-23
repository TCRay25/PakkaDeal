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
  const { calculateFee, formatFeePercent } = useSettings();
  const router = useRouter();

  const [dealType, setDealType] = useState<"product" | "rental" | "service">("product");
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

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const charge = dealType === "product" ? Number(deliveryCharge) || 0 : 0;
  const sellerPayout = Number(price || 0) + charge;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);

    try {
      const res = await post("/deals", {
        deal_type: dealType,
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
              <div className="flex justify-between border-t border-neutral-300 dark:border-neutral-700 pt-2 font-bold text-base text-emerald-600 dark:text-emerald-400">
                <span>{lang === "bn" ? "আপনার মোট পাওনা:" : t("sellerPayout") + ":"}</span>
                <span className="font-mono">{sellerPayout.toLocaleString()} BDT</span>
              </div>
              <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 text-xs space-y-1.5 text-neutral-600 dark:text-neutral-400">
                <div className="flex justify-between items-center text-accent">
                  <span>{lang === "bn" ? `ক্রেতার এসক্রো চার্জ (${formatFeePercent(lang)}):` : `Buyer Escrow Fee (${formatFeePercent(lang)}):`}</span>
                  <span className="font-mono font-bold">+{calculateFee(sellerPayout).toLocaleString()} BDT</span>
                </div>
                <div className="flex justify-between items-center font-semibold text-neutral-800 dark:text-neutral-200">
                  <span>{lang === "bn" ? "ক্রেতার মোট ডিপোজিট:" : "Total Buyer Deposit:"}</span>
                  <span className="font-mono">{(sellerPayout + calculateFee(sellerPayout)).toLocaleString()} BDT</span>
                </div>
              </div>
            </div>

            <div className="p-3 border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
              <strong className="block">✓ {lang === "bn" ? "১০০% বিক্রেতা পাওনা (০% ফি)" : "100% Payout (0% Seller Fee)"}</strong>
              <p className="text-[11px] leading-relaxed">
                {lang === "bn"
                  ? "আপনার নির্ধারিত মূল্য থেকে কোনো প্ল্যাটফর্ম ফি কাটা হবে না। ডেলিভারি সম্পন্ন হলে আপনি সম্পূর্ণ টাকা বুঝে পাবেন। ক্রেতা পেমেন্টের সময় এসক্রো চার্জ বহন করবেন।"
                  : "0% fee is deducted from your payout. You will receive 100% of your listed price and delivery charge."}
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
