# PakkaDeal (পাক্কাডিল)

> **No fake orders. No fake sellers. Real escrow trust for Bangladesh.**

PakkaDeal is a complete trust-and-escrow platform designed for Bangladesh. When two parties make a deal (Buyer & Seller for online shopping, Tenant & Landlord for rental advance, or Client & Freelancer for service milestones), the buyer deposits the full amount into PakkaDeal's merchant escrow. PakkaDeal locks the funds until the promised product is received and inspected, or until both parties confirm handover. Only then is the seller paid (minus a 2% platform fee). This stops fake sellers, fake advance payment scams, and fake order refusals at the doorstep.

---

## Architecture

- **Backend**: Node.js + Express + PostgreSQL (Render / Supabase compatible) with automatic zero-config **local SQLite fallback** (`node:sqlite`). Runs out of the box without requiring local Postgres installation!
- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind CSS with pure square aesthetic (`border-radius: 0`), Hind Siliguri typography, Dark/Light modes, and bilingual i18n (বাংলা / English).
- **Admin Panel**: Dedicated multi-view administrative dashboard at `/admin` (KPIs, All Deals, Multimodal AI Dispute Queue, User Trust Management, Financial Ledger, Notification Log, and System Parameters).

---

## Quick Local Setup

### 1. Backend

```bash
cd backend
npm install
npm run dev
# Running on http://localhost:8000
```

> **Note on Database**: If `DATABASE_URL` is provided (e.g. Supabase or local PostgreSQL), it connects via PostgreSQL pool. If PostgreSQL is offline or unavailable, the backend automatically and seamlessly initializes an embedded SQLite database at `backend/data/pakkadeal.sqlite` and seeds complete demo data!

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
# Running on http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Demo Accounts

All accounts use the demo verification OTP: **`123456`**.

| Role | Mobile Number | Name / Description |
|---|---|---|
| **Seller** | `01711223344` | Rahim Chowdhury (*Gadget Corner BD*, Score: 95/100) |
| **Seller / Landlord** | `01911223344` | Kamal Hossain (*Dhanmondi Rentals*, Score: 90/100) |
| **Buyer (Verified)** | `01755667788` | Nusrat Jahan (High Trust, Score: 92/100) |
| **Buyer (New)** | `01655667788` | Arifur Rahman (Score: 65/100) |
| **Admin** | `01700000000` | PakkaDeal Official Support (Full Access to `/admin`) |

---

## Three Escrow Flows

### A. Product Deal (Courier Delivery)
1. **Seller Creates Deal**: Specifies product, price, delivery charge, return policy, and buyer mobile number.
2. **Buyer Escrow Deposit**: Buyer opens deal link and deposits total funds via bKash/Nagad mock gateway. Status becomes **Funds Held**.
3. **Seller Ships**: Seller inputs consignment tracking ID (Steadfast/Pathao/RedX). Status becomes **Shipped**.
4. **Courier Delivery & Inspection Window**:
   - Courier webhook reports `delivered`.
   - Buyer receives a **72-hour confirmation window**.
   - Buyer inspects item and clicks **Confirm Received** $\rightarrow$ Funds released to seller minus 2% fee.
   - If buyer takes no action, funds auto-release after 72 hours.
   - If buyer refuses parcel at doorstep, seller is compensated delivery + return charges from escrow deposit; buyer receives the refund balance.
   - If seller fails to dispatch within 48 hours, buyer receives an automatic full refund.

### B. Fair Return Flow
- Seller defines who pays return shipping (`buyer_pays` or `seller_pays`) when creating the deal.
- If wrong/damaged product is delivered, buyer uploads unboxing photo and explanation.
- Multimodal AI inspects the photo against the product listing and generates an objective summary and recommendation.
- When return is approved, buyer inputs return tracking ID. Escrow balances are settled upon confirmed return delivery.

### C. Rental & Service Deals (Dual Confirmation Handover)
- Used for apartment advance deposits, freelance development milestones, and in-person exchanges.
- No third-party courier tracking: funds are released **only when BOTH parties** click **Confirm Handover**.
- If a dispute or non-delivery occurs, either party can escalate to the Admin dispute queue.

---

## Financial Ledger & Money Rules

- **Deterministic Code Execution**: AI never moves money. Payouts and refunds strictly follow deterministic code rules in `backend/src/services/settle.js`.
- **Platform Fee**: Configurable in Admin Settings, default 2% (minimum 10 BDT), deducted only upon successful deal completion.
- **Ledger Audit**: Every hold, payout, refund, and fee deduction is recorded in the append-only `ledger` table and viewable under `/dashboard/wallet` and `/admin/ledger`.
- **Regulatory Notice**: For production launch in Bangladesh, all customer funds must be held in regulated custodial escrow accounts under Bangladesh Bank guidelines with licensed commercial banks and Payment Service Providers (PSPs). The demo uses a sandbox simulation.

---

## Deployment Guide

### Deploying Backend to Render
1. Create a **New Web Service** on Render and connect this repository.
2. Root Directory: `backend`
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Environment Variables:
   - `DATABASE_URL`: Your Supabase or Render Postgres connection string.
   - `SECRET_KEY`: Long random string for JWT signatures.
   - `CORS_ORIGINS`: Your Vercel frontend URL (e.g. `https://your-frontend.vercel.app`).
   - `ADMIN_PHONES`: `01700000000`
   - `WEBHOOK_KEY`: `demo-webhook-key`
   - `GEMINI_API_KEY`: *(Optional)* for Gemini Multimodal photo dispute analysis.

### Deploying Frontend to Vercel
1. Import repository on Vercel.
2. Root Directory: `frontend`
3. Framework Preset: `Next.js`
4. Environment Variables:
   - `NEXT_PUBLIC_API_URL`: Your Render backend service URL.
