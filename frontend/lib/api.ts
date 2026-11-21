export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const getToken = () => (typeof window !== "undefined" ? localStorage.getItem("token") : null);

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const headers: Record<string, string> = isForm ? {} : { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(API + path, {
    ...init,
    headers: { ...headers, ...((init?.headers as any) || {}) },
    cache: "no-store",
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.detail || res.statusText || "Request failed");
  }

  return res.json();
}

export const post = (path: string, body?: unknown) =>
  api(path, {
    method: "POST",
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });

export const patch = (path: string, body?: unknown) =>
  api(path, {
    method: "PATCH",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export type Deal = {
  id: number;
  code: string;
  deal_type: "product" | "rental" | "service";
  seller_id: number;
  buyer_phone: string;
  buyer_name: string;
  address: string;
  area: string;
  product: string;
  details: string;
  price: number;
  delivery_charge: number;
  total_amount: number;
  fee_amount: number;
  fee_percent?: number;
  seller_payout: number;
  deposit: number;
  return_policy: "buyer_pays" | "seller_pays" | "no_returns";
  return_charge: number;
  status:
    | "created"
    | "payment_pending"
    | "held"
    | "shipped"
    | "in_transit"
    | "delivered"
    | "buyer_confirmed"
    | "return_requested"
    | "return_shipped"
    | "return_received"
    | "disputed"
    | "released"
    | "refunded"
    | "cancelled";
  outcome: string;
  courier_name: string;
  tracking_id: string;
  courier_status: string;
  return_courier_name: string;
  return_tracking_id: string;
  return_courier_status: string;
  seller_confirmed: number;
  buyer_confirmed: number;
  risk_score: number;
  risk_reasons: string;
  buyer_trust: number;
  ship_by: string | null;
  confirm_by: string | null;
  payment_method?: string;
  payment_sender?: string;
  payment_trx_id?: string;
  is_manual_courier?: number;
  courier_phone?: string;
  has_consignment_slip?: boolean;
  manual_audit_status?: string;
  detection_confidence?: number;
  tracking_source?: "api" | "webhook" | "manual";
  standardized_status?: string;
  raw_courier_status?: string;
  current_location?: string;
  estimated_delivery_at?: string | null;
  last_tracking_update?: string;
  poll_failure_count?: number;
  auto_release_at?: string | null;
  auto_release_paused?: number;
  has_unboxing_photo?: boolean;
  created_at: string;
  updated_at: string;
  page_name?: string;
  seller_name?: string;
  seller_phone?: string;
};

export type TrackingEvent = {
  id: number;
  deal_id: number;
  tracking_id: string;
  courier: string;
  standardized_status: string;
  original_status: string;
  location: string;
  note: string;
  occurred_at: string;
  created_at: string;
};

export type TrackingData = {
  dealId: number;
  dealCode: string;
  product: string;
  courierName: string;
  courierCode: string;
  trackingId: string;
  hasApi: boolean;
  manualTrackingUrl?: string | null;
  isManualCourier: boolean;
  courierPhone?: string;
  detectionConfidence: number;
  trackingSource: "api" | "webhook" | "manual";
  standardizedStatus: string;
  rawCourierStatus: string;
  currentLocation: string;
  estimatedDeliveryAt?: string | null;
  lastTrackingUpdate: string;
  hasConsignmentSlip: boolean;
  manualAuditStatus?: string;
  events: TrackingEvent[];
};

export type DealDetailResponse = {
  deal: Deal;
  seller: {
    id: number;
    name: string;
    phone: string;
    page_name: string;
    page_url: string;
    seller_trust: number;
  };
  buyer: {
    phone: string;
    name: string;
    trust_score: number;
    delivered: number;
    refused: number;
  };
  events: Array<{
    id: number;
    kind: string;
    from_status?: string;
    to_status?: string;
    actor?: string;
    note: string;
    created_at: string;
  }>;
  ledger: Array<{
    id: number;
    transaction_type: string;
    amount: number;
    party_phone: string;
    notes: string;
    created_at: string;
  }>;
  dispute: {
    id: number;
    reason: string;
    category: string;
    evidence_text: string;
    ai_summary: string;
    ai_recommendation: string;
    status: string;
    created_at: string;
  } | null;
  tracking?: TrackingData | null;
  me: {
    is_seller: boolean;
    is_buyer: boolean;
    is_admin: boolean;
  };
  escrow_accounts?: {
    bkash: string;
    nagad: string;
    rocket: string;
    bankName: string;
    bankAccount: string;
    instructions: string;
  };
};

export type Dispute = {
  id: number;
  deal_id: number;
  raised_by_phone: string;
  reason: string;
  category: string;
  evidence_text: string;
  ai_summary: string;
  ai_recommendation: string;
  admin_notes: string;
  status: "open" | "upheld" | "rejected";
  created_at: string;
  has_photo: boolean;
  deal_code: string;
  product: string;
  total_amount: number;
  price: number;
  delivery_charge: number;
  buyer_phone: string;
  buyer_name: string;
  seller_id: number;
  seller_name: string;
  page_name: string;
  seller_phone: string;
};

export type LedgerItem = {
  id: number;
  deal_id: number | null;
  transaction_type: "hold" | "payout_seller" | "refund_buyer" | "platform_fee" | "return_deduction";
  amount: number;
  party_phone: string;
  balance_after: number;
  notes: string;
  created_at: string;
  deal_code?: string;
  deal_product?: string;
};

export type NotificationItem = {
  id: number;
  phone: string;
  title: string;
  message: string;
  deal_code: string;
  is_read: number;
  created_at: string;
};

export type AdminOverview = {
  held_amount: number;
  held_count: number;
  released_amount: number;
  released_count: number;
  refunded_amount: number;
  refunded_count: number;
  fee_earned: number;
  total_deals: number;
  open_disputes: number;
  total_users: number;
  daily: Array<{
    day: string;
    deals: number;
    total_volume: number;
  }>;
};

export type SettingItem = {
  key: string;
  value: string;
  description: string;
};
