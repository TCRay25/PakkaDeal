import { checkAllTimeouts, applyCourier } from "./settle.js";
import { pollActiveShipments } from "./courierService.js";

let intervalId = null;

export function startCronJobs(intervalMs = 30000) {
  if (intervalId) return;

  console.log(`[CRON SERVICE] Starting background tasks (timer check & courier polling every ${intervalMs / 1000}s)`);

  // Run initial pass immediately
  runTasks();

  intervalId = setInterval(runTasks, intervalMs);
}

async function runTasks() {
  try {
    // 1. Check auto-release 24-hour timers and shipping timeouts
    await checkAllTimeouts();

    // 2. Poll courier adapters for active shipments (Steadfast, Pathao, RedX, Paperfly)
    await pollActiveShipments(applyCourier);
  } catch (err) {
    console.error("[CRON TASK ERROR]", err.message);
  }
}

export function stopCronJobs() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
