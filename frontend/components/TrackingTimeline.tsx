"use client";
import React from "react";
import { TrackingData, Deal, API } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { translateTrackingNote, translateCourierStatus } from "@/lib/translateTimeline";

interface TrackingTimelineProps {
  tracking?: TrackingData | null;
  deal?: Deal | null;
  onViewSlip?: () => void;
}

export default function TrackingTimeline({
  tracking,
  deal,
  onViewSlip,
}: TrackingTimelineProps) {
  const { t, lang } = useI18n();

  if (!tracking && !deal?.tracking_id) {
    return null;
  }

  const courierName = tracking?.courierName || deal?.courier_name || "Steadfast";
  const trackingId = tracking?.trackingId || deal?.tracking_id || "";
  const isManual = tracking?.isManualCourier ?? (deal?.is_manual_courier === 1 || courierName.toLowerCase() === "other");
  const confidence = tracking?.detectionConfidence ?? deal?.detection_confidence ?? 0;
  const source = tracking?.trackingSource || deal?.tracking_source || "api";
  const standardizedStatus = tracking?.standardizedStatus || deal?.standardized_status || "in_transit";
  const rawStatus = tracking?.rawCourierStatus || deal?.raw_courier_status || deal?.courier_status || "In Transit";
  const currentLocation = tracking?.currentLocation || deal?.current_location || (isManual ? "Manual Dispatch" : "In Transit Hub");
  const estimatedDelivery = tracking?.estimatedDeliveryAt || deal?.estimated_delivery_at;
  const lastUpdated = tracking?.lastTrackingUpdate || deal?.last_tracking_update || deal?.updated_at;
  const events = tracking?.events || [];
  const manualTrackingUrl = tracking?.manualTrackingUrl;
  const hasSlip = tracking?.hasConsignmentSlip || deal?.has_consignment_slip;

  const getStatusLabel = (status: string) => {
    const key = `trackStatus_${status.toLowerCase()}`;
    // @ts-ignore
    return t(key) || status.replace(/_/g, " ").toUpperCase();
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "delivered":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
      case "delivery_failed":
      case "returned":
        return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30";
      case "out_for_delivery":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
      case "destination_hub":
      case "in_transit":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30";
      case "picked_up":
      case "order_created":
      default:
        return "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border-neutral-500/30";
    }
  };

  return (
    <div className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 rounded-none p-5 space-y-5">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center font-bold text-sm tracking-wider uppercase">
            {courierName.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-neutral-900 dark:text-neutral-100">
                {courierName}
              </span>
              {confidence > 0 && (
                <span className="text-xs px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-300 dark:border-neutral-700">
                  {confidence}% {lang === "bn" ? "ম্যাচ" : "Match"}
                </span>
              )}
              {isManual ? (
                <span className="text-xs px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-medium">
                  {lang === "bn" ? "অফলাইন কুরিয়ার" : "Manual Courier"}
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 font-medium">
                  {source === "webhook" ? (lang === "bn" ? "ওয়েবহুক লাইভ" : "Webhook Live") : (lang === "bn" ? "এপিআই ভেরিফায়েড" : "API Verified")}
                </span>
              )}
            </div>
            <p className="text-xs font-mono text-neutral-500 mt-0.5">
              ID: <span className="text-neutral-800 dark:text-neutral-200 font-semibold">{trackingId}</span>
            </p>
          </div>
        </div>

        {/* Current Standardized Status & Raw Status */}
        <div className="flex flex-col items-end gap-1">
          <span
            className={`text-xs uppercase tracking-wider font-semibold px-2.5 py-1 border ${getStatusColor(
              standardizedStatus
            )}`}
          >
            {getStatusLabel(standardizedStatus)}
          </span>
          <span className="text-[11px] text-neutral-500">
            {t("rawCourierStatus")}: <span className="italic">{translateCourierStatus(rawStatus, lang)}</span>
          </span>
        </div>
      </div>

      {/* Manual Courier Safety Callout */}
      {isManual && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border-l-4 border-amber-500 p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              ⚠️ <strong>{t("manualCourierWarning")}</strong>
            </p>
            {manualTrackingUrl && (
              <a
                href={`${manualTrackingUrl}${encodeURIComponent(trackingId)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline shrink-0"
              >
                {t("openCourierSite")} ↗
              </a>
            )}
          </div>
          {(deal?.courier_phone || tracking?.courierPhone) && (
            <p className="text-xs text-amber-800 dark:text-amber-300">
              📞 {lang === "bn" ? "কুরিয়ার হেল্পলাইন" : "Courier Helpline"}:{" "}
              <span className="font-mono font-semibold">
                {deal?.courier_phone || tracking?.courierPhone}
              </span>
            </p>
          )}
          {hasSlip && onViewSlip && (
            <button
              onClick={onViewSlip}
              type="button"
              className="text-xs underline text-amber-800 dark:text-amber-300 hover:text-amber-900"
            >
              📄 {t("viewConsignmentSlip")}
            </button>
          )}
        </div>
      )}

      {/* Quick Location & Delivery Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-3 text-xs">
        <div>
          <span className="text-neutral-500 block">{t("currentLocation")}</span>
          <span className="font-semibold text-neutral-800 dark:text-neutral-200">
            {currentLocation}
          </span>
        </div>
        <div>
          <span className="text-neutral-500 block">{t("estimatedDelivery")}</span>
          <span className="font-semibold text-neutral-800 dark:text-neutral-200">
            {estimatedDelivery ? new Date(estimatedDelivery).toLocaleDateString() : (lang === "bn" ? "নির্ধারিত হয়নি" : "Standard 24-48h")}
          </span>
        </div>
        <div>
          <span className="text-neutral-500 block">{t("lastUpdated")}</span>
          <span className="font-mono text-neutral-700 dark:text-neutral-300">
            {lastUpdated ? new Date(lastUpdated).toLocaleString() : "Just now"}
          </span>
        </div>
      </div>

      {/* Vertical Stepper Timeline */}
      <div className="space-y-3 pt-2">
        <h4 className="text-xs uppercase tracking-wider font-bold text-neutral-500">
          {t("trackingTimeline")} ({events.length} {lang === "bn" ? "ইভেন্ট" : "events"})
        </h4>

        {events.length === 0 ? (
          <div className="text-xs text-neutral-500 py-3 italic">
            {lang === "bn"
              ? "কুরিয়ার সিস্টেম থেকে কোনো বিস্তারিত ট্র্যাকিং ইভেন্ট এখনও প্রাপ্ত হয়নি।"
              : "No granular tracking milestones recorded yet."}
          </div>
        ) : (
          <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[2px] before:bg-neutral-200 dark:before:bg-neutral-800">
            {events.map((evt, idx) => {
              const isLatest = idx === events.length - 1;
              return (
                <div key={evt.id || idx} className="relative group">
                  {/* Step indicator node */}
                  <div
                    className={`absolute -left-6 top-1 w-4 h-4 rounded-none border ${
                      isLatest
                        ? "bg-primary border-primary ring-2 ring-primary/20"
                        : "bg-white dark:bg-neutral-900 border-neutral-400 dark:border-neutral-600"
                    }`}
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                        {getStatusLabel(evt.standardized_status)}
                      </span>
                      {evt.original_status && evt.original_status !== evt.standardized_status && (
                        <span className="text-[11px] text-neutral-500 font-mono">
                          ({evt.original_status})
                        </span>
                      )}
                      {evt.location && (
                        <span className="text-[11px] px-1.5 py-0.2 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                          📍 {evt.location}
                        </span>
                      )}
                    </div>
                    {evt.note && (
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                        {translateTrackingNote(evt.note, lang)}
                      </p>
                    )}
                    <span className="text-[11px] font-mono text-neutral-400 block mt-1">
                      {evt.occurred_at ? new Date(evt.occurred_at).toLocaleString() : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
