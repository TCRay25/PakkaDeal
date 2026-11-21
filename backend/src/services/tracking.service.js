import { q, one, isSqliteDb } from "../db.js";
import { couriers, getCourier } from "./couriers/index.js";
import { log, notify, notifySeller } from "./events.js";
import { applyCourier, completeReturn } from "./settle.js";

/**
 * Detect courier from tracking ID using patterns and heuristics
 * @param {string} trackingId
 */
export function detectCourier(trackingId) {
  const clean = String(trackingId || "").trim();
  if (!clean) {
    return {
      detectedCourier: null,
      detectionConfidence: 0,
      candidates: [],
    };
  }

  const candidates = [];

  for (const c of couriers) {
    if (c.code === "other") continue; // Exclude default fallback from top detect
    const res = c.detect(clean);
    if (res.matches && res.confidence > 0) {
      candidates.push({
        courier: c.name,
        code: c.code,
        confidence: res.confidence,
        patternName: res.patternName,
        hasApi: c.hasApi,
      });
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);

  const top = candidates[0] || null;
  const isAmbiguous = candidates.length > 1 && candidates[0].confidence - candidates[1].confidence < 15;

  return {
    detectedCourier: top ? top.courier : null,
    courierCode: top ? top.code : "other",
    detectionConfidence: top ? (isAmbiguous ? Math.min(top.confidence, 65) : top.confidence) : 0,
    isAmbiguous,
    candidates,
  };
}

/**
 * Fetch and normalize tracking information for a deal
 * @param {object} deal
 * @param {string} [source='api'] - 'api' | 'webhook' | 'manual'
 * @param {object} [externalPayload] - optional raw webhook payload
 */
export async function updateDealTracking(deal, source = "api", externalPayload = null) {
  const courierName = deal.courier_name || "Steadfast";
  const trackingId = deal.tracking_id;

  if (!trackingId) return null;

  const courier = getCourier(courierName);
  let rawData = externalPayload;

  if (!rawData && courier.hasApi) {
    try {
      rawData = await courier.track(trackingId);
      // Reset poll failures on success
      await q("update deals set poll_failure_count = 0, last_polled_at = CURRENT_TIMESTAMP where id = $1", [deal.id]);
    } catch (err) {
      console.warn(`[TRACKING SERVICE] Poll failed for deal #${deal.code} (${courierName} ${trackingId}):`, err.message);
      await q("update deals set poll_failure_count = poll_failure_count + 1, last_polled_at = CURRENT_TIMESTAMP where id = $1", [deal.id]);
      return null;
    }
  } else if (!rawData) {
    rawData = await courier.track(trackingId);
  }

  const normalized = courier.normalize(rawData, trackingId);
  const now = new Date().toISOString();

  // Save latest shipment tracking state on the deal
  await q(
    `update deals set
       standardized_status = $2,
       raw_courier_status = $3,
       current_location = $4,
       estimated_delivery_at = coalesce($5, estimated_delivery_at),
       last_tracking_update = $6,
       tracking_source = $7,
       updated_at = CURRENT_TIMESTAMP
     where id = $1`,
    [
      deal.id,
      normalized.standardizedStatus,
      normalized.originalStatus,
      normalized.currentLocation,
      normalized.estimatedDeliveryAt,
      normalized.lastUpdated || now,
      source,
    ]
  );

  // Store in tracking_events table if status or location progressed
  const lastEvent = await one(
    "select * from tracking_events where deal_id = $1 order by id desc limit 1",
    [deal.id]
  );

  const isDifferent =
    !lastEvent ||
    lastEvent.standardized_status !== normalized.standardizedStatus ||
    lastEvent.location !== normalized.currentLocation ||
    lastEvent.original_status !== normalized.originalStatus;

  if (isDifferent) {
    await q(
      `insert into tracking_events(
         deal_id, tracking_id, courier, standardized_status, original_status, location, note, occurred_at
       ) values($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        deal.id,
        trackingId,
        courier.name,
        normalized.standardizedStatus,
        normalized.originalStatus,
        normalized.currentLocation,
        normalized.isMock ? "[MOCK SIMULATION] Automated status update" : "Courier tracking milestone",
        normalized.lastUpdated || now,
      ]
    );
  }

  // Drive the Deal State Machine:
  // RULE: For manual-tracking deals, DELIVERED is NEVER set automatically.
  const isManual = !!deal.is_manual_courier || !courier.hasApi;

  if (normalized.standardizedStatus === "delivered" && !isManual) {
    // Verified automated delivery through API or webhook
    if (deal.status !== "delivered" && deal.status !== "released") {
      await applyCourier(deal, "delivered");
    }
  } else if (normalized.standardizedStatus === "returned") {
    if (deal.status !== "refunded") {
      await applyCourier(deal, "returned");
    }
  } else if (normalized.standardizedStatus === "delivery_failed") {
    await q(
      `update deals set outcome = 'delivery_failed', updated_at = CURRENT_TIMESTAMP where id = $1`,
      [deal.id]
    );
    await log(
      deal.id,
      "delivery_failed",
      `Courier reported delivery failed at ${normalized.currentLocation}. Customer unreachable or rescheduled.`,
      {
        fromStatus: deal.status,
        toStatus: deal.status,
        actor: "courier",
      }
    );
    await notify(
      deal.buyer_phone,
      `PakkaDeal #${deal.code}: Courier reported delivery attempt unsuccessful at your address. Rider will re-attempt or contact you.`,
      "Delivery Attempt Notice",
      deal.code
    );
    await notifySeller(
      deal.seller_id,
      `PakkaDeal #${deal.code}: Courier reported delivery attempt failed for buyer ${deal.buyer_phone}. Monitoring courier response.`,
      "Delivery Issue Alert",
      deal.code
    );
  } else if (
    ["picked_up", "in_transit", "destination_hub", "out_for_delivery"].includes(normalized.standardizedStatus)
  ) {
    if (deal.status === "shipped") {
      await q("update deals set status = 'in_transit', updated_at = CURRENT_TIMESTAMP where id = $1", [deal.id]);
    }
  }

  return normalized;
}

/**
 * Scheduled poller for active shipments with rate limiting, timeouts, and backoff
 */
export async function pollActiveShipments() {
  try {
    const cutoffClause = isSqliteDb()
      ? "datetime('now', '-15 minutes')"
      : "now() - interval '15 minutes'";

    const activeDeals = await q(`
      select * from deals
      where status in ('shipped', 'in_transit')
        and is_manual_courier = 0
        and tracking_id != ''
        and (
          last_polled_at is null
          or last_polled_at < ${cutoffClause}
        )
      order by coalesce(poll_failure_count, 0) asc, id desc
      limit 40
    `);

    for (const deal of activeDeals) {
      // Exponential backoff: if poll failures >= 5, only check once every 4 hours
      if (deal.poll_failure_count >= 5) {
        const lastPolled = deal.last_polled_at ? new Date(deal.last_polled_at).getTime() : 0;
        if (Date.now() - lastPolled < 4 * 3600 * 1000) {
          continue;
        }
      }

      await updateDealTracking(deal, "api");
      // Rate limiting: sleep 350ms between courier API calls
      await new Promise((r) => setTimeout(r, 350));
    }
  } catch (err) {
    console.error("[TRACKING POLLER ERROR]", err.message);
  }
}

/**
 * Retrieve normalized tracking timeline for a deal
 * @param {string|number} dealCodeOrId
 */
export async function getDealTrackingTimeline(dealCodeOrId) {
  const deal = await one(
    "select * from deals where code = $1 or id = $2",
    [String(dealCodeOrId), Number(dealCodeOrId) || 0]
  );
  if (!deal) return null;

  const courier = getCourier(deal.courier_name);
  const events = await q(
    `select id, deal_id, tracking_id, courier, standardized_status, original_status, location, note, occurred_at, created_at
     from tracking_events
     where deal_id = $1
     order by occurred_at asc, id asc`,
    [deal.id]
  );

  return {
    dealId: deal.id,
    dealCode: deal.code,
    product: deal.product,
    courierName: deal.courier_name,
    courierCode: courier.code,
    trackingId: deal.tracking_id,
    hasApi: courier.hasApi,
    manualTrackingUrl: courier.manualTrackingUrl,
    isManualCourier: !!deal.is_manual_courier,
    courierPhone: deal.courier_phone,
    detectionConfidence: deal.detection_confidence || 0,
    trackingSource: deal.tracking_source || "api",
    standardizedStatus: deal.standardized_status || "in_transit",
    rawCourierStatus: deal.raw_courier_status || deal.courier_status || "In transit",
    currentLocation: deal.current_location || (deal.is_manual_courier ? "Manual Courier" : "In Transit Hub"),
    estimatedDeliveryAt: deal.estimated_delivery_at || null,
    lastTrackingUpdate: deal.last_tracking_update || deal.updated_at,
    hasConsignmentSlip: !!deal.consignment_slip,
    manualAuditStatus: deal.manual_audit_status,
    events,
  };
}
