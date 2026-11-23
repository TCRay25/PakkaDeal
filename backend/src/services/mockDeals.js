import { q, one, initDb } from "../db.js";

export async function seed50MockDeals({ force = false } = {}) {
  await initDb();
  if (!force) {
    const existing = Number((await one("select count(*) as cnt from deals where code like 'PK-MOCK-%'"))?.cnt || 0);
    if (existing >= 50) {
      return { skipped: true, count: existing };
    }
  }
  console.log("Checking users and preparing mock data...");

  // Ensure sellers exist
  const existingSellers = await q("select id, phone, name from users where role='seller'");
  let sellerMap = {};
  for (const s of existingSellers) {
    sellerMap[s.phone] = s.id;
  }

  // Create additional realistic sellers if not present
  const extraSellers = [
    { phone: "01711223344", name: "Rahim Chowdhury", page_name: "Gadget Corner BD", page_url: "https://facebook.com/gadgetcornerbd", trust: 95 },
    { phone: "01811223344", name: "Tanvir Ahmed", page_name: "Dhaka Fashion Hub", page_url: "https://facebook.com/dhakafashion", trust: 85 },
    { phone: "01911223344", name: "Kamal Hossain (Landlord)", page_name: "Dhanmondi Rentals & Studio", page_url: "https://facebook.com/dhanmondirentals", trust: 90 },
    { phone: "01710112233", name: "Sajid Mahmud", page_name: "TechZone Bangladesh", page_url: "https://facebook.com/techzonebd", trust: 92 },
    { phone: "01810112233", name: "Sabrina Sultana", page_name: "Ananya Silk & Craft", page_url: "https://facebook.com/ananyas COMMERCIAL", trust: 88 },
    { phone: "01910112233", name: "Mahfuzur Rahman", page_name: "Smart Living Rentals", page_url: "https://facebook.com/smartlivingrentals", trust: 89 },
    { phone: "01610112233", name: "Hasibul Hasan", page_name: "DevCraft Freelance Studio", page_url: "https://facebook.com/devcraftstudio", trust: 94 },
  ];

  for (const s of extraSellers) {
    if (!sellerMap[s.phone]) {
      const inserted = await one(
        `insert into users(phone, name, role, page_name, page_url, bkash_number, bkash_type, bkash_verified, seller_trust, buyer_trust)
         values($1, $2, 'seller', $3, $4, $1, 'Merchant', 1, $5, 75) returning id`,
        [s.phone, s.name, s.page_name, s.page_url, s.trust]
      );
      sellerMap[s.phone] = inserted.id;
    }
  }

  // Ensure demo buyers exist
  const extraBuyers = [
    { phone: "01755667788", name: "Nusrat Jahan", trust: 92 },
    { phone: "01655667788", name: "Arifur Rahman", trust: 65 },
    { phone: "01955667788", name: "Farhan Kabir", trust: 78 },
    { phone: "01722334455", name: "Sadia Islam", trust: 88 },
    { phone: "01822334455", name: "Shakil Ahmed", trust: 82 },
    { phone: "01922334455", name: "Mehedi Hasan", trust: 74 },
    { phone: "01622334455", name: "Tanjila Akter", trust: 91 },
    { phone: "01522334455", name: "Zubair Hossain", trust: 70 },
    { phone: "01733445566", name: "Rashed Karim", trust: 85 },
    { phone: "01833445566", name: "Tahmina Rahman", trust: 90 },
    { phone: "01933445566", name: "Nabil Chowdhury", trust: 80 },
  ];

  let buyerMap = {};
  for (const b of extraBuyers) {
    const existing = await one("select id from users where phone=$1", [b.phone]);
    if (!existing) {
      const ins = await one(
        `insert into users(phone, name, role, bkash_number, bkash_type, bkash_verified, buyer_trust, seller_trust)
         values($1, $2, 'buyer', $1, 'Personal', 1, $3, 70) returning id`,
        [b.phone, b.name, b.trust]
      );
      buyerMap[b.phone] = ins.id;
    } else {
      buyerMap[b.phone] = existing.id;
    }
    const stat = await one("select phone from buyer_stats where phone=$1", [b.phone]);
    if (!stat) {
      await q("insert into buyer_stats(phone, delivered, refused, disputes, trust_score) values($1, 5, 0, 0, $2)", [b.phone, b.trust]);
    }
  }

  // Delete previously generated PK-MOCK-% deals if any to ensure clean idempotent run
  const oldMockDeals = await q("select id, code from deals where code like 'PK-MOCK-%'");
  if (oldMockDeals && oldMockDeals.length > 0) {
    console.log(`Cleaning up ${oldMockDeals.length} existing PK-MOCK-* deals...`);
    for (const om of oldMockDeals) {
      await q("delete from disputes where deal_id=$1", [om.id]);
      await q("delete from tracking_events where deal_id=$1", [om.id]);
      await q("delete from deal_events where deal_id=$1", [om.id]);
      await q("delete from ledger where deal_id=$1", [om.id]);
      await q("delete from notifications where deal_code=$1", [om.code]);
      await q("delete from deals where id=$1", [om.id]);
    }
  }

  // 50 structured mock deal definitions
  const rawDeals = [
    // --- 1. CREATED (4 deals) ---
    {
      code: "PK-MOCK-01",
      deal_type: "product",
      seller_phone: "01711223344",
      buyer_phone: "01755667788",
      buyer_name: "Nusrat Jahan",
      address: "House 24, Road 7, Dhanmondi, Dhaka",
      area: "Dhaka",
      product: "Apple iPhone 15 (128GB Black) Factory Unlocked",
      details: "Brand new intact box with 1-year Apple international warranty.",
      price: 92000,
      delivery_charge: 120,
      return_policy: "buyer_pays",
      status: "created",
      courier_name: "Steadfast",
      risk_score: 12,
      risk_reasons: "High value electronics; high trust buyer",
      buyer_trust: 92,
      payment_method: "bKash",
      days_ago: 1,
    },
    {
      code: "PK-MOCK-02",
      deal_type: "product",
      seller_phone: "01811223344",
      buyer_phone: "01722334455",
      buyer_name: "Sadia Islam",
      address: "Flat 3A, House 12, Road 4, Sector 3, Uttara, Dhaka",
      area: "Dhaka",
      product: "Custom Handcrafted Teak Wood Dining Chair (Set of 4)",
      details: "Seasoned Chittagong Teak wood, matte lacquer finish with premium velvet upholstery.",
      price: 28000,
      delivery_charge: 500,
      return_policy: "seller_pays",
      status: "created",
      courier_name: "Manual Courier",
      is_manual_courier: 1,
      risk_score: 18,
      risk_reasons: "Bulky furniture item via manual transport",
      buyer_trust: 88,
      payment_method: "bKash",
      days_ago: 1,
    },
    {
      code: "PK-MOCK-03",
      deal_type: "rental",
      seller_phone: "01911223344",
      buyer_phone: "01822334455",
      buyer_name: "Shakil Ahmed",
      address: "House 15, Block B, Mirpur 2, Dhaka",
      area: "Dhaka",
      product: "Modern 2-Bed Sublet Advance Deposit (Mirpur 2)",
      details: "Two-bedroom sublet advance booking. 1 month advance deposit, key handover on December 1st.",
      price: 18000,
      delivery_charge: 0,
      return_policy: "buyer_pays",
      status: "created",
      courier_name: "Manual Courier",
      risk_score: 10,
      risk_reasons: "Standard residential sublet deposit",
      buyer_trust: 82,
      payment_method: "Bank Transfer",
      days_ago: 2,
    },
    {
      code: "PK-MOCK-04",
      deal_type: "service",
      seller_phone: "01610112233",
      buyer_phone: "01655667788",
      buyer_name: "Arifur Rahman",
      address: "Banani 11, Dhaka",
      area: "Dhaka",
      product: "Figma to React Tailwind Dashboard UI Milestone",
      details: "Conversion of 12 responsive dashboard screens with dark mode support and component documentation.",
      price: 22000,
      delivery_charge: 0,
      return_policy: "buyer_pays",
      status: "created",
      courier_name: "Manual Courier",
      risk_score: 15,
      risk_reasons: "Software milestone contract",
      buyer_trust: 65,
      payment_method: "bKash",
      days_ago: 2,
    },

    // --- 2. PAYMENT_PENDING (4 deals) ---
    {
      code: "PK-MOCK-05",
      deal_type: "product",
      seller_phone: "01710112233",
      buyer_phone: "01922334455",
      buyer_name: "Mehedi Hasan",
      address: "Holding 42, GEC Circle, Chattogram",
      area: "Chattogram",
      product: "Sony PlayStation 5 Slim Disc Edition + 2 DualSense Controllers",
      details: "CFI-2000 model, Japanese region intact box with God of War Ragnarok bundle.",
      price: 68000,
      delivery_charge: 200,
      return_policy: "buyer_pays",
      status: "payment_pending",
      courier_name: "Steadfast",
      risk_score: 22,
      risk_reasons: "High value gaming console; outside Dhaka shipping",
      buyer_trust: 74,
      payment_method: "bKash",
      payment_status: "pending",
      days_ago: 3,
    },
    {
      code: "PK-MOCK-06",
      deal_type: "product",
      seller_phone: "01810112233",
      buyer_phone: "01622334455",
      buyer_name: "Tanjila Akter",
      address: "House 9, Road 18, Block D, Bashundhara R/A, Dhaka",
      area: "Dhaka",
      product: "Designer Pure Silk Jamdani Saree (Emerald Green 84 Count)",
      details: "Authentic Narayanganj handloom woven silk Jamdani with golden zari floral motifs.",
      price: 16500,
      delivery_charge: 100,
      return_policy: "seller_pays",
      status: "payment_pending",
      courier_name: "Pathao",
      risk_score: 10,
      risk_reasons: "High trust verified buyer",
      buyer_trust: 91,
      payment_method: "Nagad",
      payment_status: "pending",
      days_ago: 2,
    },
    {
      code: "PK-MOCK-07",
      deal_type: "rental",
      seller_phone: "01910112233",
      buyer_phone: "01522334455",
      buyer_name: "Zubair Hossain",
      address: "House 31, Road 4, Sector 11, Uttara, Dhaka",
      area: "Dhaka",
      product: "Bachelor Studio Security Deposit (Uttara Sector 11)",
      details: "Furnished bachelor studio security advance. Fully tiled with generator backup and Wi-Fi.",
      price: 25000,
      delivery_charge: 0,
      return_policy: "buyer_pays",
      status: "payment_pending",
      courier_name: "Manual Courier",
      risk_score: 14,
      risk_reasons: "Rental escrow advance",
      buyer_trust: 70,
      payment_method: "Bank Transfer",
      payment_status: "pending",
      days_ago: 2,
    },
    {
      code: "PK-MOCK-08",
      deal_type: "service",
      seller_phone: "01610112233",
      buyer_phone: "01733445566",
      buyer_name: "Rashed Karim",
      address: "Gulshan 1, Dhaka",
      area: "Dhaka",
      product: "E-Commerce SEO Audit & PageSpeed Optimization Milestone",
      details: "Full technical SEO audit, Core Web Vitals score 90+ on mobile, and structured schema implementation.",
      price: 15000,
      delivery_charge: 0,
      return_policy: "buyer_pays",
      status: "payment_pending",
      courier_name: "Manual Courier",
      risk_score: 12,
      risk_reasons: "Standard service milestone",
      buyer_trust: 85,
      payment_method: "bKash",
      payment_status: "pending",
      days_ago: 3,
    },

    // --- 3. HELD (Escrow Secured) (6 deals) ---
    {
      code: "PK-MOCK-09",
      deal_type: "product",
      seller_phone: "01711223344",
      buyer_phone: "01755667788",
      buyer_name: "Nusrat Jahan",
      address: "House 18, Road 27, Dhanmondi, Dhaka",
      area: "Dhaka",
      product: "Apple MacBook Air M2 (16GB RAM, 512GB SSD) Space Gray",
      details: "Factory sealed Apple official warranty unit. Cycle count 0.",
      price: 135000,
      delivery_charge: 150,
      return_policy: "buyer_pays",
      status: "held",
      courier_name: "Steadfast",
      risk_score: 8,
      risk_reasons: "High value escrow; 100% verified buyer history",
      buyer_trust: 92,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 4,
    },
    {
      code: "PK-MOCK-10",
      deal_type: "product",
      seller_phone: "01710112233",
      buyer_phone: "01833445566",
      buyer_name: "Tahmina Rahman",
      address: "House 45, Road 11, Banani, Dhaka",
      area: "Dhaka",
      product: "Logitech MX Master 3S Wireless Mouse + Keychron Q1 Pro",
      details: "Ergonomic Bluetooth combo set for software engineers. Brown tactile switches.",
      price: 26500,
      delivery_charge: 100,
      return_policy: "seller_pays",
      status: "held",
      courier_name: "Pathao",
      risk_score: 11,
      risk_reasons: "Standard office electronics combo",
      buyer_trust: 90,
      payment_method: "Nagad",
      payment_status: "confirmed",
      days_ago: 3,
    },
    {
      code: "PK-MOCK-11",
      deal_type: "product",
      seller_phone: "01811223344",
      buyer_phone: "01933445566",
      buyer_name: "Nabil Chowdhury",
      address: "House 7, Road 3, Block G, Halishahar, Chattogram",
      area: "Chattogram",
      product: "Aarong Handloom Men's Premium Silk Panjabi Set",
      details: "Size 42 with matching raw silk pajama and embroidered collar.",
      price: 9800,
      delivery_charge: 130,
      return_policy: "buyer_pays",
      status: "held",
      courier_name: "RedX",
      risk_score: 14,
      risk_reasons: "Clothing shipment to Chattogram",
      buyer_trust: 80,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 4,
    },
    {
      code: "PK-MOCK-12",
      deal_type: "product",
      seller_phone: "01710112233",
      buyer_phone: "01955667788",
      buyer_name: "Farhan Kabir",
      address: "Plot 12, Road 5, Sector 4, Uttara, Dhaka",
      area: "Dhaka",
      product: "Gree 1.5 Ton Inverter Air Conditioner (GP-18C)",
      details: "Official Gree Bangladesh warranty card, copper condenser, free 10-feet copper pipe included.",
      price: 58000,
      delivery_charge: 600,
      return_policy: "buyer_pays",
      status: "held",
      courier_name: "Manual Courier",
      is_manual_courier: 1,
      risk_score: 16,
      risk_reasons: "Heavy home appliance; manual delivery team",
      buyer_trust: 78,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 4,
    },
    {
      code: "PK-MOCK-13",
      deal_type: "rental",
      seller_phone: "01911223344",
      buyer_phone: "01722334455",
      buyer_name: "Sadia Islam",
      address: "Apartment 6B, Road 2, Banani DOHS, Dhaka",
      area: "Dhaka",
      product: "2-Month Advance Deposit for Furnished Studio (Banani DOHS)",
      details: "Secure residential building. Terms: 60-day notice, biometric gate pass, key handover upon inspection.",
      price: 45000,
      delivery_charge: 0,
      return_policy: "buyer_pays",
      status: "held",
      courier_name: "Manual Courier",
      risk_score: 9,
      risk_reasons: "High-trust dual confirmation rental deal",
      buyer_trust: 88,
      payment_method: "Bank Transfer",
      payment_status: "confirmed",
      days_ago: 5,
    },
    {
      code: "PK-MOCK-14",
      deal_type: "service",
      seller_phone: "01610112233",
      buyer_phone: "01822334455",
      buyer_name: "Shakil Ahmed",
      address: "Karwan Bazar, Dhaka",
      area: "Dhaka",
      product: "Full-Stack Next.js 15 & Supabase SaaS MVP Development",
      details: "Phase 1 Milestone: Multi-tenant database design, Google Auth, Stripe/bKash webhooks, and billing dashboard.",
      price: 50000,
      delivery_charge: 0,
      return_policy: "buyer_pays",
      status: "held",
      courier_name: "Manual Courier",
      risk_score: 13,
      risk_reasons: "Service milestone held in escrow vault",
      buyer_trust: 82,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 5,
    },

    // --- 4. SHIPPED (5 deals) ---
    {
      code: "PK-MOCK-15",
      deal_type: "product",
      seller_phone: "01711223344",
      buyer_phone: "01655667788",
      buyer_name: "Arifur Rahman",
      address: "House 22, Kandirpar, Cumilla",
      area: "Cumilla",
      product: "Canon EOS R50 Mirrorless Camera with 18-45mm Kit Lens",
      details: "Intact box with original battery, charger, strap, and 64GB SanDisk Extreme SD card.",
      price: 76000,
      delivery_charge: 150,
      return_policy: "buyer_pays",
      status: "shipped",
      courier_name: "Steadfast",
      tracking_id: "ST-882101",
      courier_status: "in_transit",
      risk_score: 15,
      risk_reasons: "Courier dispatch confirmed",
      buyer_trust: 65,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 6,
    },
    {
      code: "PK-MOCK-16",
      deal_type: "product",
      seller_phone: "01710112233",
      buyer_phone: "01622334455",
      buyer_name: "Tanjila Akter",
      address: "House 5, Road 9, Dhanmondi, Dhaka",
      area: "Dhaka",
      product: "Anker Prime 20,000mAh 200W Power Bank (A1336)",
      details: "Official Anker Bangladesh warranty with smart digital display and dual USB-C PD 3.1.",
      price: 13500,
      delivery_charge: 80,
      return_policy: "seller_pays",
      status: "shipped",
      courier_name: "Pathao",
      tracking_id: "PT-773412",
      courier_status: "picked_up",
      risk_score: 8,
      risk_reasons: "Low risk standard gadget order",
      buyer_trust: 91,
      payment_method: "Nagad",
      payment_status: "confirmed",
      days_ago: 5,
    },
    {
      code: "PK-MOCK-17",
      deal_type: "product",
      seller_phone: "01811223344",
      buyer_phone: "01922334455",
      buyer_name: "Mehedi Hasan",
      address: "Shop 14, City Center, Zindabazar, Sylhet",
      area: "Sylhet",
      product: "Apex Genuine Leather Formal Derby Shoes (Black Size 42)",
      details: "Full-grain calfskin leather, cushioned orthopedic insole with wooden heel finish.",
      price: 5490,
      delivery_charge: 120,
      return_policy: "buyer_pays",
      status: "shipped",
      courier_name: "eCourier",
      tracking_id: "EC-552190",
      courier_status: "picked_up",
      risk_score: 12,
      risk_reasons: "Footwear delivery to Sylhet",
      buyer_trust: 74,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 6,
    },
    {
      code: "PK-MOCK-18",
      deal_type: "product",
      seller_phone: "01711223344",
      buyer_phone: "01733445566",
      buyer_name: "Rashed Karim",
      address: "House 88, Road 15, Block D, Mirpur 12, Dhaka",
      area: "Dhaka",
      product: "Samsung Odyssey G7 27-inch 240Hz 1ms Gaming Monitor",
      details: "1000R curved QLED panel with G-Sync and HDR600. Triple bubble-wrapped.",
      price: 64000,
      delivery_charge: 250,
      return_policy: "buyer_pays",
      status: "shipped",
      courier_name: "Paperfly",
      tracking_id: "PF-991204",
      courier_status: "in_transit",
      risk_score: 14,
      risk_reasons: "Fragile monitor transit",
      buyer_trust: 85,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 6,
    },
    {
      code: "PK-MOCK-19",
      deal_type: "product",
      seller_phone: "01810112233",
      buyer_phone: "01522334455",
      buyer_name: "Zubair Hossain",
      address: "Alupatty Mor, Boalia, Rajshahi",
      area: "Rajshahi",
      product: "Manual Courier: Handcrafted Brass Decor Collection",
      details: "Traditional brass tea set and decorative peacock wall piece dispatched via Sundarban Paribahan parcel branch.",
      price: 11200,
      delivery_charge: 150,
      return_policy: "buyer_pays",
      status: "shipped",
      courier_name: "Sundarban",
      tracking_id: "SB-341908",
      courier_status: "in_transit",
      is_manual_courier: 1,
      risk_score: 19,
      risk_reasons: "Manual parcel slip verified by seller",
      buyer_trust: 70,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 5,
    },

    // --- 5. IN_TRANSIT (6 deals) ---
    {
      code: "PK-MOCK-20",
      deal_type: "product",
      seller_phone: "01711223344",
      buyer_phone: "01755667788",
      buyer_name: "Nusrat Jahan",
      address: "House 52, Road 11, Dhanmondi, Dhaka",
      area: "Dhaka",
      product: "Bose QuietComfort Ultra Noise-Cancelling Wireless Headphones",
      details: "Black color, spatial audio, sealed box with international serial verification.",
      price: 43500,
      delivery_charge: 100,
      return_policy: "buyer_pays",
      status: "in_transit",
      courier_name: "Steadfast",
      tracking_id: "ST-883490",
      courier_status: "in_transit",
      risk_score: 9,
      risk_reasons: "In transit to Dhanmondi hub",
      buyer_trust: 92,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 7,
    },
    {
      code: "PK-MOCK-21",
      deal_type: "product",
      seller_phone: "01710112233",
      buyer_phone: "01833445566",
      buyer_name: "Tahmina Rahman",
      address: "House 3, Road 4, Sector 7, Uttara, Dhaka",
      area: "Dhaka",
      product: "DJI Mini 3 Pro Drone with Smart RC Screen Controller",
      details: "Sub-249g drone with Fly More Kit Plus batteries and hard waterproof carrying case.",
      price: 98000,
      delivery_charge: 200,
      return_policy: "seller_pays",
      status: "in_transit",
      courier_name: "Pathao",
      tracking_id: "PT-994123",
      courier_status: "in_transit",
      risk_score: 13,
      risk_reasons: "High value drone in transit",
      buyer_trust: 90,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 8,
    },
    {
      code: "PK-MOCK-22",
      deal_type: "product",
      seller_phone: "01711223344",
      buyer_phone: "01933445566",
      buyer_name: "Nabil Chowdhury",
      address: "Agrabad Commercial Area, Chattogram",
      area: "Chattogram",
      product: "Apple iPad Air 5th Gen (M1, 64GB Wi-Fi Starlight) + Apple Pencil 2",
      details: "Intact box combo pack with magnetic folio smart case.",
      price: 72000,
      delivery_charge: 150,
      return_policy: "buyer_pays",
      status: "in_transit",
      courier_name: "RedX",
      tracking_id: "RX-441209",
      courier_status: "in_transit",
      risk_score: 16,
      risk_reasons: "Chittagong central hub transit",
      buyer_trust: 80,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 8,
    },
    {
      code: "PK-MOCK-23",
      deal_type: "product",
      seller_phone: "01710112233",
      buyer_phone: "01722334455",
      buyer_name: "Sadia Islam",
      address: "House 19, Road 8, Gulshan 2, Dhaka",
      area: "Dhaka",
      product: "Garmin Forerunner 265 GPS Running Smartwatch (Black/Aqua)",
      details: "AMOLED touchscreen display with multi-band GNSS and training readiness metrics.",
      price: 49000,
      delivery_charge: 100,
      return_policy: "seller_pays",
      status: "in_transit",
      courier_name: "Steadfast",
      tracking_id: "ST-774910",
      courier_status: "in_transit",
      risk_score: 10,
      risk_reasons: "Rider assigned for delivery",
      buyer_trust: 88,
      payment_method: "Nagad",
      payment_status: "confirmed",
      days_ago: 7,
    },
    {
      code: "PK-MOCK-24",
      deal_type: "product",
      seller_phone: "01711223344",
      buyer_phone: "01822334455",
      buyer_name: "Shakil Ahmed",
      address: "House 12, Road 5, Mohammadpur, Dhaka",
      area: "Dhaka",
      product: "Xiaomi Mijia Robot Vacuum Cleaner Pro (LDS Laser Navigation)",
      details: "Auto-mop washing and suction dock with 4000Pa cyclone motor.",
      price: 36000,
      delivery_charge: 200,
      return_policy: "buyer_pays",
      status: "in_transit",
      courier_name: "Paperfly",
      tracking_id: "PF-551982",
      courier_status: "in_transit",
      risk_score: 12,
      risk_reasons: "Smart home appliance in transit",
      buyer_trust: 82,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 7,
    },
    {
      code: "PK-MOCK-25",
      deal_type: "product",
      seller_phone: "01810112233",
      buyer_phone: "01622334455",
      buyer_name: "Tanjila Akter",
      address: "KDA Avenue, Shibbari Mor, Khulna",
      area: "Khulna",
      product: "Kashmir Pure Pashmina Shawl (Hand-embroidered Sozni Work)",
      details: "100% cashmere wool certified pashmina with intricate floral sozni needlework border.",
      price: 19500,
      delivery_charge: 140,
      return_policy: "buyer_pays",
      status: "in_transit",
      courier_name: "SA Paribahan",
      tracking_id: "SAP-901823",
      courier_status: "in_transit",
      is_manual_courier: 1,
      risk_score: 15,
      risk_reasons: "Inter-district courier to Khulna",
      buyer_trust: 91,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 8,
    },

    // --- 6. DELIVERED (72-hour Inspection Window Active) (6 deals) ---
    {
      code: "PK-MOCK-26",
      deal_type: "product",
      seller_phone: "01711223344",
      buyer_phone: "01655667788",
      buyer_name: "Arifur Rahman",
      address: "Block C, House 22, Kandirpar, Cumilla",
      area: "Cumilla",
      product: "Samsung Galaxy S24 Ultra (512GB Titanium Gray)",
      details: "Snapdragon 8 Gen 3, S-Pen included, BTRC approved official unit.",
      price: 148000,
      delivery_charge: 150,
      return_policy: "buyer_pays",
      status: "delivered",
      courier_name: "Steadfast",
      tracking_id: "ST-991205",
      courier_status: "delivered",
      risk_score: 14,
      risk_reasons: "72-hour buyer inspection timer running",
      buyer_trust: 65,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 9,
    },
    {
      code: "PK-MOCK-27",
      deal_type: "product",
      seller_phone: "01710112233",
      buyer_phone: "01955667788",
      buyer_name: "Farhan Kabir",
      address: "Road 12, Sector 7, Uttara, Dhaka",
      area: "Dhaka",
      product: "Keychron K2 V2 Wireless Mechanical Keyboard (Gateron Brown)",
      details: "Mac & Windows layout support with RGB backlight and aluminum frame.",
      price: 9200,
      delivery_charge: 100,
      return_policy: "seller_pays",
      status: "delivered",
      courier_name: "Pathao",
      tracking_id: "PT-662391",
      courier_status: "delivered",
      risk_score: 9,
      risk_reasons: "Delivered to buyer doorstep",
      buyer_trust: 78,
      payment_method: "Nagad",
      payment_status: "confirmed",
      days_ago: 9,
    },
    {
      code: "PK-MOCK-28",
      deal_type: "product",
      seller_phone: "01711223344",
      buyer_phone: "01755667788",
      buyer_name: "Nusrat Jahan",
      address: "House 14, Road 5, Dhanmondi, Dhaka",
      area: "Dhaka",
      product: "Amazon Kindle Paperwhite 11th Gen (16GB Agave Green) with Cover",
      details: "6.8-inch 300 ppi glare-free display with adjustable warm light and waterproof fabric case.",
      price: 18500,
      delivery_charge: 100,
      return_policy: "buyer_pays",
      status: "delivered",
      courier_name: "Steadfast",
      tracking_id: "ST-881204",
      courier_status: "delivered",
      risk_score: 7,
      risk_reasons: "High trust buyer inspection active",
      buyer_trust: 92,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 10,
    },
    {
      code: "PK-MOCK-29",
      deal_type: "product",
      seller_phone: "01710112233",
      buyer_phone: "01722334455",
      buyer_name: "Sadia Islam",
      address: "House 4, Road 18, Block A, Banani, Dhaka",
      area: "Dhaka",
      product: "Dell UltraSharp 27-inch 4K USB-C Hub Monitor (U2723QE)",
      details: "IPS Black technology, 98% DCI-P3, 90W power delivery USB-C connection.",
      price: 74000,
      delivery_charge: 200,
      return_policy: "buyer_pays",
      status: "delivered",
      courier_name: "RedX",
      tracking_id: "RX-882319",
      courier_status: "delivered",
      risk_score: 11,
      risk_reasons: "Premium display delivered; awaiting confirmation",
      buyer_trust: 88,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 10,
    },
    {
      code: "PK-MOCK-30",
      deal_type: "product",
      seller_phone: "01711223344",
      buyer_phone: "01822334455",
      buyer_name: "Shakil Ahmed",
      address: "Nasirabad Housing Society, Chattogram",
      area: "Chattogram",
      product: "Nintendo Switch OLED Model with Zelda Tears of the Kingdom",
      details: "White joy-con edition with 64GB internal storage and glass screen protector pre-applied.",
      price: 37500,
      delivery_charge: 150,
      return_policy: "seller_pays",
      status: "delivered",
      courier_name: "Pathao",
      tracking_id: "PT-441908",
      courier_status: "delivered",
      risk_score: 13,
      risk_reasons: "Delivered to Chattogram customer",
      buyer_trust: 82,
      payment_method: "Nagad",
      payment_status: "confirmed",
      days_ago: 11,
    },
    {
      code: "PK-MOCK-31",
      deal_type: "product",
      seller_phone: "01710112233",
      buyer_phone: "01833445566",
      buyer_name: "Tahmina Rahman",
      address: "House 8, Road 12, Gulshan 1, Dhaka",
      area: "Dhaka",
      product: "Marshall Stanmore III Bluetooth Home Speaker (Brown Vintage)",
      details: "Authentic Marshall soundstage with Bluetooth 5.2 and RCA input.",
      price: 42000,
      delivery_charge: 150,
      return_policy: "buyer_pays",
      status: "delivered",
      courier_name: "Steadfast",
      tracking_id: "ST-551029",
      courier_status: "delivered",
      risk_score: 10,
      risk_reasons: "Delivered; auto-release scheduled in 24h",
      buyer_trust: 90,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 10,
    },

    // --- 7. RELEASED (Completed & Paid Out to Seller) (7 deals) ---
    {
      code: "PK-MOCK-32",
      deal_type: "product",
      seller_phone: "01711223344",
      buyer_phone: "01755667788",
      buyer_name: "Nusrat Jahan",
      address: "House 10, Road 6, Dhanmondi, Dhaka",
      area: "Dhaka",
      product: "ASUS ROG Zephyrus G14 Gaming Laptop (Ryzen 9 / RTX 4060)",
      details: "14-inch ROG Nebula OLED 120Hz display with 32GB LPDDR5X and 1TB PCIe 4.0 SSD.",
      price: 185000,
      delivery_charge: 200,
      return_policy: "buyer_pays",
      status: "released",
      outcome: "buyer_confirmed",
      courier_name: "Steadfast",
      tracking_id: "ST-772910",
      courier_status: "delivered",
      seller_confirmed: 1,
      buyer_confirmed: 1,
      risk_score: 8,
      risk_reasons: "Successfully completed deal; buyer confirmed satisfaction",
      buyer_trust: 92,
      payment_method: "bKash",
      payment_status: "confirmed",
      payout_status: "paid",
      days_ago: 15,
    },
    {
      code: "PK-MOCK-33",
      deal_type: "product",
      seller_phone: "01710112233",
      buyer_phone: "01933445566",
      buyer_name: "Nabil Chowdhury",
      address: "House 14, Road 1, Block A, Chandgaon, Chattogram",
      area: "Chattogram",
      product: "Sony WH-1000XM4 Wireless Noise Cancelling Headphones (Silver)",
      details: "LDAC audio support with multi-point connection and hard travel case.",
      price: 29500,
      delivery_charge: 120,
      return_policy: "buyer_pays",
      status: "released",
      outcome: "auto_released",
      courier_name: "Pathao",
      tracking_id: "PT-339102",
      courier_status: "delivered",
      seller_confirmed: 1,
      buyer_confirmed: 0,
      risk_score: 11,
      risk_reasons: "Auto-released after 72-hour window elapsed without dispute",
      buyer_trust: 80,
      payment_method: "bKash",
      payment_status: "confirmed",
      payout_status: "paid",
      days_ago: 16,
    },
    {
      code: "PK-MOCK-34",
      deal_type: "product",
      seller_phone: "01711223344",
      buyer_phone: "01722334455",
      buyer_name: "Sadia Islam",
      address: "Flat 4A, House 29, Road 9A, Dhanmondi, Dhaka",
      area: "Dhaka",
      product: "DeLonghi Dedica Deluxe Espresso Machine (EC685M Metal)",
      details: "15-bar professional pump with manual milk frother and stainless steel tamper.",
      price: 23500,
      delivery_charge: 150,
      return_policy: "seller_pays",
      status: "released",
      outcome: "buyer_confirmed",
      courier_name: "Steadfast",
      tracking_id: "ST-440192",
      courier_status: "delivered",
      seller_confirmed: 1,
      buyer_confirmed: 1,
      risk_score: 9,
      risk_reasons: "Smooth transaction completed",
      buyer_trust: 88,
      payment_method: "Nagad",
      payment_status: "confirmed",
      payout_status: "paid",
      days_ago: 18,
    },
    {
      code: "PK-MOCK-35",
      deal_type: "product",
      seller_phone: "01811223344",
      buyer_phone: "01655667788",
      buyer_name: "Arifur Rahman",
      address: "House 3, Kandirpar, Cumilla",
      area: "Cumilla",
      product: "Lotto Original Running Shoes + Sports Gym Duffel Bag Combo",
      details: "Size 43 breathable mesh sports sneakers with 40L waterproof gym duffel.",
      price: 4800,
      delivery_charge: 100,
      return_policy: "buyer_pays",
      status: "released",
      outcome: "buyer_confirmed",
      courier_name: "eCourier",
      tracking_id: "EC-119204",
      courier_status: "delivered",
      seller_confirmed: 1,
      buyer_confirmed: 1,
      risk_score: 12,
      risk_reasons: "Buyer confirmed product matches listing",
      buyer_trust: 65,
      payment_method: "bKash",
      payment_status: "confirmed",
      payout_status: "paid",
      days_ago: 20,
    },
    {
      code: "PK-MOCK-36",
      deal_type: "rental",
      seller_phone: "01911223344",
      buyer_phone: "01755667788",
      buyer_name: "Nusrat Jahan",
      address: "Flat 5A, House 12, Road 9/A, Dhanmondi, Dhaka",
      area: "Dhaka",
      product: "3-Month Advance Security Deposit for Flat 5A (Dhanmondi)",
      details: "3-bedroom luxury family flat. Both tenant and landlord signed rental agreement and exchanged keys.",
      price: 60000,
      delivery_charge: 0,
      return_policy: "buyer_pays",
      status: "released",
      outcome: "both_confirmed",
      courier_name: "Manual Courier",
      seller_confirmed: 1,
      buyer_confirmed: 1,
      risk_score: 8,
      risk_reasons: "Dual confirmation handover successfully completed",
      buyer_trust: 92,
      payment_method: "Bank Transfer",
      payment_status: "confirmed",
      payout_status: "paid",
      days_ago: 22,
    },
    {
      code: "PK-MOCK-37",
      deal_type: "rental",
      seller_phone: "01910112233",
      buyer_phone: "01822334455",
      buyer_name: "Shakil Ahmed",
      address: "House 28, Road 2, Block C, Bashundhara R/A, Dhaka",
      area: "Dhaka",
      product: "Sublet Room Advance Booking (Bashundhara R/A Block C)",
      details: "Attached bath, south-facing bachelor sublet. Handover confirmed by both parties.",
      price: 14000,
      delivery_charge: 0,
      return_policy: "buyer_pays",
      status: "released",
      outcome: "both_confirmed",
      courier_name: "Manual Courier",
      seller_confirmed: 1,
      buyer_confirmed: 1,
      risk_score: 10,
      risk_reasons: "Dual confirmation successful",
      buyer_trust: 82,
      payment_method: "bKash",
      payment_status: "confirmed",
      payout_status: "paid",
      days_ago: 24,
    },
    {
      code: "PK-MOCK-38",
      deal_type: "service",
      seller_phone: "01610112233",
      buyer_phone: "01733445566",
      buyer_name: "Rashed Karim",
      address: "Motijheel C/A, Dhaka",
      area: "Dhaka",
      product: "Flutter Android & iOS Mobile App Bugfix & UI Redesign Milestone",
      details: "Fixed payment crash issues, updated navigation drawer, and deployed staging build to TestFlight & Play Console.",
      price: 35000,
      delivery_charge: 0,
      return_policy: "buyer_pays",
      status: "released",
      outcome: "both_confirmed",
      courier_name: "Manual Courier",
      seller_confirmed: 1,
      buyer_confirmed: 1,
      risk_score: 10,
      risk_reasons: "Client accepted milestones; code merged and verified",
      buyer_trust: 85,
      payment_method: "bKash",
      payment_status: "confirmed",
      payout_status: "paid",
      days_ago: 25,
    },

    // --- 8. DISPUTED (Dispute Queue with AI analysis) (4 deals) ---
    {
      code: "PK-MOCK-39",
      deal_type: "product",
      seller_phone: "01711223344",
      buyer_phone: "01955667788",
      buyer_name: "Farhan Kabir",
      address: "House 32, Road 14, Sector 13, Uttara, Dhaka",
      area: "Dhaka",
      product: "Apple AirPods Pro 2nd Gen USB-C (Claimed Replica)",
      details: "Claimed original Apple AirPods Pro. Buyer reports device does not connect to Apple Find My.",
      price: 24500,
      delivery_charge: 100,
      return_policy: "buyer_pays",
      status: "disputed",
      courier_name: "Steadfast",
      tracking_id: "ST-661209",
      courier_status: "delivered",
      risk_score: 35,
      risk_reasons: "Buyer claims counterfeit product",
      buyer_trust: 78,
      payment_method: "bKash",
      payment_status: "confirmed",
      dispute_reason: "Product is counterfeit / replica. Serial number on case does not match firmware, and Apple Find My refuses to sync.",
      dispute_category: "counterfeit",
      dispute_evidence: "High-resolution photos of charging case font mismatch and iOS diagnostic error screenshot.",
      ai_summary: "AI Analysis: Serial number typography and hinge build show high divergence from genuine Apple hardware specs. High probability of Grade-A replica.",
      ai_recommendation: "uphold",
      days_ago: 12,
    },
    {
      code: "PK-MOCK-40",
      deal_type: "product",
      seller_phone: "01710112233",
      buyer_phone: "01655667788",
      buyer_name: "Arifur Rahman",
      address: "Kandirpar, Cumilla",
      area: "Cumilla",
      product: "HP Laser 107w Wireless Monochrome Printer (Damaged in Transit)",
      details: "Brand new printer. Buyer unboxed to find output paper tray completely shattered.",
      price: 17800,
      delivery_charge: 150,
      return_policy: "seller_pays",
      status: "disputed",
      courier_name: "Pathao",
      tracking_id: "PT-901823",
      courier_status: "delivered",
      risk_score: 28,
      risk_reasons: "Transit physical damage dispute",
      buyer_trust: 65,
      payment_method: "Nagad",
      payment_status: "confirmed",
      dispute_reason: "Printer arrived physically damaged. The front paper tray is cracked and rollers are misaligned.",
      dispute_category: "damaged",
      dispute_evidence: "Unboxing video clip and photo showing cracked plastic housing and broken tray hinges.",
      ai_summary: "AI Analysis: Image clearly depicts structural stress fracture on front paper guide consistent with heavy courier impact.",
      ai_recommendation: "uphold",
      days_ago: 13,
    },
    {
      code: "PK-MOCK-41",
      deal_type: "product",
      seller_phone: "01811223344",
      buyer_phone: "01622334455",
      buyer_name: "Tanjila Akter",
      address: "House 21, Road 7, Dhanmondi, Dhaka",
      area: "Dhaka",
      product: "Dyson Supersonic Hair Dryer (Wrong Color & Opened Box Delivered)",
      details: "Ordered Iron/Fuchsia brand new unit. Received Prussian Blue opened demo unit.",
      price: 44000,
      delivery_charge: 100,
      return_policy: "buyer_pays",
      status: "disputed",
      courier_name: "Steadfast",
      tracking_id: "ST-331092",
      courier_status: "delivered",
      risk_score: 30,
      risk_reasons: "Wrong specification / opened product delivered",
      buyer_trust: 91,
      payment_method: "bKash",
      payment_status: "confirmed",
      dispute_reason: "I ordered an intact Iron/Fuchsia model, but seller delivered a Prussian Blue opened box with scratches.",
      dispute_category: "wrong_item",
      dispute_evidence: "Unboxing photo showing opened seal, incorrect colorway, and missing magnetic nozzle attachments.",
      ai_summary: "AI Analysis: Photo confirms Prussian Blue model delivered vs. Iron/Fuchsia invoice. Packaging seal shows clear prior peeling.",
      ai_recommendation: "uphold",
      days_ago: 14,
    },
    {
      code: "PK-MOCK-42",
      deal_type: "service",
      seller_phone: "01610112233",
      buyer_phone: "01522334455",
      buyer_name: "Zubair Hossain",
      address: "Rajshahi Sadar, Rajshahi",
      area: "Rajshahi",
      product: "Custom WordPress WooCommerce Theme Customization",
      details: "Integration of custom checkout flow and SMS gateway. Seller unresponsive for 7 days past deadline.",
      price: 18000,
      delivery_charge: 0,
      return_policy: "buyer_pays",
      status: "disputed",
      courier_name: "Manual Courier",
      risk_score: 40,
      risk_reasons: "Freelancer unresponsiveness after milestone deadline",
      buyer_trust: 70,
      payment_method: "bKash",
      payment_status: "confirmed",
      dispute_reason: "Seller stopped responding after receiving escrow hold. No commits submitted to Git repo for over 7 days past delivery date.",
      dispute_category: "service_incomplete",
      dispute_evidence: "GitHub repository commit log showing zero updates and WhatsApp chat screenshots with unread messages.",
      ai_summary: "AI Analysis: Repository commit activity ceased 8 days prior. Milestone deliverables remain unsubmitted according to contract specification.",
      ai_recommendation: "uphold",
      days_ago: 14,
    },

    // --- 9. RETURN_REQUESTED (2 deals) ---
    {
      code: "PK-MOCK-43",
      deal_type: "product",
      seller_phone: "01811223344",
      buyer_phone: "01833445566",
      buyer_name: "Tahmina Rahman",
      address: "House 15, Road 2, Block B, Niketan, Gulshan, Dhaka",
      area: "Dhaka",
      product: "Nike Air Jordan 1 Retro High OG (Size Mismatch)",
      details: "Ordered EU 43 (US 9.5). Seller shipped EU 41. Return request initiated by buyer.",
      price: 18500,
      delivery_charge: 100,
      return_policy: "seller_pays",
      return_charge: 100,
      status: "return_requested",
      courier_name: "Steadfast",
      tracking_id: "ST-229103",
      courier_status: "delivered",
      risk_score: 18,
      risk_reasons: "Return request submitted with photo proof",
      buyer_trust: 90,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 15,
    },
    {
      code: "PK-MOCK-44",
      deal_type: "product",
      seller_phone: "01710112233",
      buyer_phone: "01922334455",
      buyer_name: "Mehedi Hasan",
      address: "Chawkbazar, Chattogram",
      area: "Chattogram",
      product: "Philips Digital Air Fryer XL (Defective Heating Coil)",
      details: "Rapid air technology 4.1L fryer. Machine powers on but heating coil fails to ignite.",
      price: 14500,
      delivery_charge: 150,
      return_policy: "buyer_pays",
      return_charge: 150,
      status: "return_requested",
      courier_name: "Pathao",
      tracking_id: "PT-881204",
      courier_status: "delivered",
      risk_score: 20,
      risk_reasons: "Buyer requested return within 72h window",
      buyer_trust: 74,
      payment_method: "Nagad",
      payment_status: "confirmed",
      days_ago: 16,
    },

    // --- 10. RETURN_SHIPPED (2 deals) ---
    {
      code: "PK-MOCK-45",
      deal_type: "product",
      seller_phone: "01711223344",
      buyer_phone: "01755667788",
      buyer_name: "Nusrat Jahan",
      address: "House 40, Road 4A, Dhanmondi, Dhaka",
      area: "Dhaka",
      product: "BenQ PD2705Q 27-inch 2K QHD Designer Monitor",
      details: "Returned due to persistent vertical red line across IPS panel. Return parcel in transit to seller.",
      price: 46000,
      delivery_charge: 200,
      return_policy: "seller_pays",
      return_charge: 200,
      status: "return_shipped",
      courier_name: "Steadfast",
      tracking_id: "ST-110294",
      courier_status: "delivered",
      return_courier_name: "Steadfast",
      return_tracking_id: "RET-ST-55291",
      return_courier_status: "in_transit",
      risk_score: 15,
      risk_reasons: "Return parcel on transit back to seller",
      buyer_trust: 92,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 18,
    },
    {
      code: "PK-MOCK-46",
      deal_type: "product",
      seller_phone: "01811223344",
      buyer_phone: "01933445566",
      buyer_name: "Nabil Chowdhury",
      address: "Lalkhan Bazar, Chattogram",
      area: "Chattogram",
      product: "Men's Italian Wool Slim-fit 2-Piece Blazer Suit",
      details: "Custom tailored suit with incorrect shoulder width delivered. Returning via Pathao Courier.",
      price: 12500,
      delivery_charge: 120,
      return_policy: "buyer_pays",
      return_charge: 120,
      status: "return_shipped",
      courier_name: "Pathao",
      tracking_id: "PT-551029",
      courier_status: "delivered",
      return_courier_name: "Pathao",
      return_tracking_id: "RET-PT-77124",
      return_courier_status: "in_transit",
      risk_score: 14,
      risk_reasons: "Return shipment dispatched by buyer",
      buyer_trust: 80,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 19,
    },

    // --- 11. RETURN_RECEIVED (1 deal) ---
    {
      code: "PK-MOCK-47",
      deal_type: "product",
      seller_phone: "01710112233",
      buyer_phone: "01822334455",
      buyer_name: "Shakil Ahmed",
      address: "House 20, Road 5, Mohammadpur, Dhaka",
      area: "Dhaka",
      product: "GoPro HERO 12 Black Action Camera",
      details: "Damaged lens returned by buyer. Seller received and verified physical return parcel at warehouse.",
      price: 41000,
      delivery_charge: 120,
      return_policy: "seller_pays",
      return_charge: 120,
      status: "return_received",
      courier_name: "Steadfast",
      tracking_id: "ST-882310",
      courier_status: "delivered",
      return_courier_name: "Steadfast",
      return_tracking_id: "RET-ST-99012",
      return_courier_status: "delivered",
      risk_score: 12,
      risk_reasons: "Return package received by seller; awaiting final refund settlement",
      buyer_trust: 82,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 21,
    },

    // --- 12. REFUNDED (2 deals) ---
    {
      code: "PK-MOCK-48",
      deal_type: "product",
      seller_phone: "01811223344",
      buyer_phone: "01655667788",
      buyer_name: "Arifur Rahman",
      address: "Kandirpar, Cumilla",
      area: "Cumilla",
      product: "Bata Men's Oxford Formal Shoes (Doorstep Refusal)",
      details: "Buyer refused parcel at doorstep due to crushed courier packaging. Return fee settled from escrow deposit.",
      price: 4200,
      delivery_charge: 100,
      return_policy: "buyer_pays",
      return_charge: 100,
      status: "refunded",
      outcome: "doorstep_refusal",
      courier_name: "Steadfast",
      tracking_id: "ST-441209",
      courier_status: "refused",
      risk_score: 25,
      risk_reasons: "Doorstep refusal settled; shipping refunded to seller and balance returned to buyer",
      buyer_trust: 65,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 22,
    },
    {
      code: "PK-MOCK-49",
      deal_type: "product",
      seller_phone: "01711223344",
      buyer_phone: "01722334455",
      buyer_name: "Sadia Islam",
      address: "House 6, Road 14, Dhanmondi, Dhaka",
      area: "Dhaka",
      product: "Vintage Mechanical Record Player & Turntable",
      details: "Seller failed to ship within 48-hour deadline. Automatic 100% refund executed to buyer's bKash account.",
      price: 16500,
      delivery_charge: 120,
      return_policy: "buyer_pays",
      status: "refunded",
      outcome: "seller_unresponsive",
      courier_name: "Steadfast",
      risk_score: 20,
      risk_reasons: "Auto-refunded due to seller shipping timeout",
      buyer_trust: 88,
      payment_method: "bKash",
      payment_status: "confirmed",
      days_ago: 23,
    },

    // --- 13. CANCELLED (1 deal) ---
    {
      code: "PK-MOCK-50",
      deal_type: "product",
      seller_phone: "01710112233",
      buyer_phone: "01522334455",
      buyer_name: "Zubair Hossain",
      address: "Kazihata, Rajshahi",
      area: "Rajshahi",
      product: "DJI Osmo Pocket 3 Creator Combo (Out of Stock)",
      details: "Seller discovered supplier inventory shortage before buyer completed payment. Deal safely cancelled.",
      price: 69000,
      delivery_charge: 150,
      return_policy: "buyer_pays",
      status: "cancelled",
      outcome: "seller_cancelled",
      courier_name: "Steadfast",
      risk_score: 10,
      risk_reasons: "Cancelled before payment",
      buyer_trust: 70,
      payment_method: "bKash",
      days_ago: 24,
    },
  ];

  console.log(`Ready to insert ${rawDeals.length} mock deals into the database...`);

  let insertedCount = 0;

  for (const d of rawDeals) {
    const sellerId = sellerMap[d.seller_phone] || 2;
    const buyerId = buyerMap[d.buyer_phone] || null;
    const totalAmount = d.price + (d.delivery_charge || 0);
    const feePercent = 1.0;
    const feeAmount = Math.max(Math.round((totalAmount * feePercent) / 100), 10);
    const sellerPayout = totalAmount - feeAmount;

    // Deposit is held for held, shipped, in_transit, delivered, released, disputed, return_*, refunded
    const isFunded = [
      "held",
      "shipped",
      "in_transit",
      "delivered",
      "released",
      "disputed",
      "return_requested",
      "return_shipped",
      "return_received",
      "refunded",
    ].includes(d.status);

    const deposit = isFunded ? totalAmount : 0;

    // Realistic timestamp math
    const daysAgo = d.days_ago || 5;
    const createdAt = new Date(Date.now() - daysAgo * 24 * 3600 * 1000).toISOString().replace("T", " ").substring(0, 19);
    const updatedAt = new Date(Date.now() - (daysAgo - 1) * 24 * 3600 * 1000).toISOString().replace("T", " ").substring(0, 19);
    const shipBy = new Date(Date.now() - (daysAgo - 2) * 24 * 3600 * 1000).toISOString().replace("T", " ").substring(0, 19);
    const confirmBy = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().replace("T", " ").substring(0, 19);

    const paymentTrxId = isFunded ? `TX${d.payment_method.slice(0, 2).toUpperCase()}${Math.random().toString(36).substring(2, 8).toUpperCase()}` : "";
    const payoutTrxId = d.status === "released" ? `PO-${Math.random().toString(36).substring(2, 9).toUpperCase()}` : "";
    const payoutAt = d.status === "released" ? updatedAt : null;

    const row = await one(
      `insert into deals(
        code, deal_type, seller_id, buyer_phone, buyer_name, buyer_id, address, area, product, details,
        price, delivery_charge, total_amount, fee_amount, fee_percent, seller_payout, deposit,
        return_policy, return_charge, status, outcome, courier_name, tracking_id, courier_status,
        return_courier_name, return_tracking_id, return_courier_status,
        seller_confirmed, buyer_confirmed, risk_score, risk_reasons, buyer_trust,
        ship_by, confirm_by, payment_method, payment_sender, payment_trx_id, payment_amount,
        payment_status, payout_status, payout_trx_id, payout_at, is_manual_courier,
        created_at, updated_at
      ) values(
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23, $24,
        $25, $26, $27,
        $28, $29, $30, $31, $32,
        $33, $34, $35, $36, $37, $38,
        $39, $40, $41, $42, $43,
        $44, $45
      ) returning id`,
      [
        d.code,
        d.deal_type,
        sellerId,
        d.buyer_phone,
        d.buyer_name,
        buyerId,
        d.address,
        d.area || "Dhaka",
        d.product,
        d.details || "",
        d.price,
        d.delivery_charge || 0,
        totalAmount,
        feeAmount,
        feePercent,
        sellerPayout,
        deposit,
        d.return_policy || "buyer_pays",
        d.return_charge || 0,
        d.status,
        d.outcome || "",
        d.courier_name || "Steadfast",
        d.tracking_id || "",
        d.courier_status || "",
        d.return_courier_name || "",
        d.return_tracking_id || "",
        d.return_courier_status || "",
        d.seller_confirmed || 0,
        d.buyer_confirmed || 0,
        d.risk_score || 10,
        d.risk_reasons || "Standard verified deal",
        d.buyer_trust || 75,
        shipBy,
        confirmBy,
        d.payment_method || "bKash",
        isFunded ? d.buyer_phone : "",
        paymentTrxId,
        isFunded ? totalAmount : 0,
        d.payment_status || (isFunded ? "confirmed" : "none"),
        d.payout_status || (d.status === "released" ? "paid" : "none"),
        payoutTrxId,
        payoutAt,
        d.is_manual_courier ? 1 : 0,
        createdAt,
        updatedAt,
      ]
    );

    const dealId = row.id;
    insertedCount++;

    // 1. Insert Deal Events (Progression History)
    await q(
      `insert into deal_events(deal_id, kind, from_status, to_status, actor, note, created_at)
       values($1, 'created', '', 'created', 'seller', $2, $3)`,
      [dealId, `Deal #${d.code} created for ${d.product}`, createdAt]
    );

    if (d.status === "payment_pending") {
      await q(
        `insert into deal_events(deal_id, kind, from_status, to_status, actor, note, created_at)
         values($1, 'payment_pending', 'created', 'payment_pending', 'buyer', 'Buyer opened deal link and initiated payment review', $2)`,
        [dealId, updatedAt]
      );
    }

    if (isFunded) {
      await q(
        `insert into deal_events(deal_id, kind, from_status, to_status, actor, note, created_at)
         values($1, 'paid', 'created', 'held', 'buyer', $2, $3)`,
        [dealId, `Buyer deposited ${totalAmount} BDT via ${d.payment_method} Escrow Vault (TrxID: ${paymentTrxId})`, createdAt]
      );

      // Ledger entry for Escrow Hold
      await q(
        `insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes, created_at)
         values($1, 'hold', $2, $3, $2, $4, $5)`,
        [dealId, totalAmount, d.buyer_phone, `Escrow hold funded for ${d.product}`, createdAt]
      );
    }

    if (["shipped", "in_transit", "delivered", "released", "disputed", "return_requested", "return_shipped", "return_received"].includes(d.status)) {
      await q(
        `insert into deal_events(deal_id, kind, from_status, to_status, actor, note, created_at)
         values($1, 'shipped', 'held', 'shipped', 'seller', $2, $3)`,
        [dealId, `Dispatched via ${d.courier_name} Courier (Tracking: ${d.tracking_id || "N/A"})`, updatedAt]
      );

      // Tracking checkpoints
      if (d.tracking_id) {
        await q(
          `insert into tracking_events(deal_id, tracking_id, courier, standardized_status, original_status, location, note, occurred_at, created_at)
           values($1, $2, $3, 'picked_up', 'Picked Up', 'Tejgaon Merchant Hub, Dhaka', 'Parcel picked up from merchant', $4, $4)`,
          [dealId, d.tracking_id, d.courier_name, createdAt]
        );
      }
    }

    if (["in_transit", "delivered", "released", "disputed", "return_requested", "return_shipped", "return_received"].includes(d.status)) {
      if (d.tracking_id) {
        await q(
          `insert into tracking_events(deal_id, tracking_id, courier, standardized_status, original_status, location, note, occurred_at, created_at)
           values($1, $2, $3, 'in_transit', 'In Transit', 'Central Sorting Hub, Tejgaon', 'Transferred between transit hubs', $4, $4)`,
          [dealId, d.tracking_id, d.courier_name, updatedAt]
        );
      }
    }

    if (["delivered", "released", "disputed", "return_requested", "return_shipped", "return_received"].includes(d.status)) {
      await q(
        `insert into deal_events(deal_id, kind, from_status, to_status, actor, note, created_at)
         values($1, 'delivered', 'in_transit', 'delivered', 'courier', $2, $3)`,
        [dealId, `Delivered to recipient. 72-hour inspection window activated.`, updatedAt]
      );

      if (d.tracking_id) {
        await q(
          `insert into tracking_events(deal_id, tracking_id, courier, standardized_status, original_status, location, note, occurred_at, created_at)
           values($1, $2, $3, 'delivered', 'Delivered', '${d.area} Delivery Point', 'Successfully delivered to recipient', $4, $4)`,
          [dealId, d.tracking_id, d.courier_name, updatedAt]
        );
      }
    }

    if (d.status === "released") {
      await q(
        `insert into deal_events(deal_id, kind, from_status, to_status, actor, note, created_at)
         values($1, 'released', 'delivered', 'released', 'system', $2, $3)`,
        [dealId, `Funds released: ${sellerPayout} BDT paid to seller (${d.seller_phone}), ${feeAmount} BDT platform fee collected`, updatedAt]
      );

      // Ledger: payout & fee
      await q(
        `insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes, created_at)
         values($1, 'payout_seller', $2, $3, $4, $5, $6)`,
        [dealId, sellerPayout, d.seller_phone, feeAmount, `Payout to seller for deal ${d.code} (${payoutTrxId})`, updatedAt]
      );
      await q(
        `insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes, created_at)
         values($1, 'platform_fee', $2, 'system', 0, $3, $4)`,
        [dealId, feeAmount, `1% platform fee for deal ${d.code}`, updatedAt]
      );
    }

    if (d.status === "disputed" || d.dispute_reason) {
      await q(
        `insert into deal_events(deal_id, kind, from_status, to_status, actor, note, created_at)
         values($1, 'disputed', 'delivered', 'disputed', 'buyer', $2, $3)`,
        [dealId, `Dispute filed by buyer: ${d.dispute_reason}`, updatedAt]
      );

      await q(
        `insert into disputes(
          deal_id, raised_by_phone, reason, category, evidence_text, ai_summary, ai_recommendation, status, created_at
        ) values($1, $2, $3, $4, $5, $6, $7, 'open', $8)`,
        [
          dealId,
          d.buyer_phone,
          d.dispute_reason || "Item not as described",
          d.dispute_category || "damaged",
          d.dispute_evidence || "Evidence photos submitted by customer via mobile upload",
          d.ai_summary || "AI Analysis: Photo inspection completed. Anomaly detected in delivered parcel.",
          d.ai_recommendation || "uphold",
          updatedAt,
        ]
      );
    }

    if (d.status === "return_requested") {
      await q(
        `insert into deal_events(deal_id, kind, from_status, to_status, actor, note, created_at)
         values($1, 'return_requested', 'delivered', 'return_requested', 'buyer', 'Buyer requested return. Awaiting return shipping dispatch.', $2)`,
        [dealId, updatedAt]
      );
    }

    if (d.status === "return_shipped") {
      await q(
        `insert into deal_events(deal_id, kind, from_status, to_status, actor, note, created_at)
         values($1, 'return_shipped', 'return_requested', 'return_shipped', 'buyer', $2, $3)`,
        [dealId, `Return package dispatched via ${d.return_courier_name} (Tracking: ${d.return_tracking_id})`, updatedAt]
      );
    }

    if (d.status === "return_received") {
      await q(
        `insert into deal_events(deal_id, kind, from_status, to_status, actor, note, created_at)
         values($1, 'return_received', 'return_shipped', 'return_received', 'seller', 'Seller inspected and confirmed receipt of returned parcel.', $2)`,
        [dealId, updatedAt]
      );
    }

    if (d.status === "refunded") {
      await q(
        `insert into deal_events(deal_id, kind, from_status, to_status, actor, note, created_at)
         values($1, 'refunded', 'held', 'refunded', 'system', $2, $3)`,
        [dealId, `Refund executed: ${totalAmount} BDT returned to buyer's bKash account`, updatedAt]
      );

      await q(
        `insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes, created_at)
         values($1, 'refund_buyer', $2, $3, 0, $4, $5)`,
        [dealId, totalAmount, d.buyer_phone, `Refund returned to buyer for ${d.code}`, updatedAt]
      );
    }

    if (d.status === "cancelled") {
      await q(
        `insert into deal_events(deal_id, kind, from_status, to_status, actor, note, created_at)
         values($1, 'cancelled', 'created', 'cancelled', 'seller', 'Deal cancelled by seller before buyer payment.', $2)`,
        [dealId, updatedAt]
      );
    }

    // Notifications for Buyer & Seller
    await q(
      `insert into notifications(phone, title, message, deal_code, is_read, created_at)
       values($1, 'Deal Update: ' || $2, $3, $2, 0, $4)`,
      [d.buyer_phone, d.code, `Status updated to ${d.status.toUpperCase()} for ${d.product}`, updatedAt]
    );
  }

  console.log(`\nSUCCESS: Successfully seeded ${insertedCount} realistic mock deals across all different phases!`);
  return { success: true, count: insertedCount };
}
