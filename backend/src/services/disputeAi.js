import { config } from "../config.js";

const DAMAGED = ["damage", "broken", "cracked", "shattered", "torn", "defect", "faulty", "ভাঙ্গা", "ভাঙা", "ফাটা", "ছেঁড়া", "নষ্ট", "ত্রুটি", "কাজ করে না"];
const WRONG = ["wrong", "different", "fake", "replica", "counterfeit", "color", "model", "ভুল", "অন্য", "নকল", "অমিল", "কালার মিল নাই", "অন্য মডেল"];
const MISSING = ["missing", "incomplete", "empty", "নাই", "নেই", "অর্ধেক", "হারিয়ে গেছে"];

function byKeyword(reason) {
  const r = (reason || "").toLowerCase();
  if (DAMAGED.some((k) => r.includes(k))) return "damaged";
  if (WRONG.some((k) => r.includes(k))) return "wrong_item";
  if (MISSING.some((k) => r.includes(k))) return "missing_parts";
  return "other";
}

async function viaGemini(reason, product, photo, mime) {
  const prompt = `You are an AI Dispute Resolution Assistant for PakkaDeal Bangladesh escrow platform.
Product listed: "${product}".
Buyer complaint / reason: "${reason}".
Inspect the photo and return strict JSON with no markdown backticks:
{"category":"damaged|wrong_item|missing_parts|other","match":true|false,"summary":"One clear sentence in English or Bangla summarizing the physical evidence","recommendation":"uphold|review|reject"}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mime || "image/jpeg", data: photo.toString("base64") } }
        ]
      }]
    }),
  });

  if (!res.ok) throw new Error("Gemini API returned " + res.status);
  const text = (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || "";
  const cleaned = text.replace(/```json|```/gi, "").trim();
  return JSON.parse(cleaned);
}

export async function analyze({ reason, product, photo, mime }) {
  let category = byKeyword(reason);
  let summary = `Category: ${category}. Photo ${photo ? "evidence attached" : "not provided"}. Manual review advised.`;
  let recommendation = photo && category !== "other" ? "uphold" : "review";

  if (photo && config.geminiKey) {
    try {
      const r = await viaGemini(reason, product, photo, mime);
      category = r.category || category;
      summary = r.summary || summary;
      recommendation = r.recommendation || (r.match ? "uphold" : "review");
    } catch (err) {
      console.warn("Gemini dispute analysis failed, used keyword fallback:", err.message);
    }
  }

  return { category, summary, recommendation };
}
