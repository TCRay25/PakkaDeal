import { Router } from "express";
import { getPublicSettings } from "../services/settle.js";

const router = Router();

router.get("/public", async (_req, res) => {
  try {
    const settings = await getPublicSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", async (_req, res) => {
  try {
    const settings = await getPublicSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
