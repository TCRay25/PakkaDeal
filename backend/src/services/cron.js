import { checkAllTimeouts } from "./settle.js";
import { pollActiveShipments } from "./tracking.service.js";

let intervalId = null;

export function startCronJobs(intervalMs = 30000) {
  if (intervalId) return;

  console.log(`[CRON SERVICE] Starting background tasks (timer check & courier polling every ${intervalMs / 1000}s)`);

  // Run initial pass immediately
  runTasks();

  intervalId = setInterval(runTasks, intervalMs);
}

let isRunning = false;

async function runTasks() {
  if (isRunning) return;
  isRunning = true;
  try {
    // 1. Check auto-release 24-hour timers and shipping timeouts
    await checkAllTimeouts();

    // 2. Poll courier providers for active shipments
    await pollActiveShipments();
  } catch (err) {
    console.error("[CRON TASK ERROR]", err.message);
  } finally {
    isRunning = false;
  }
}

export function stopCronJobs() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
