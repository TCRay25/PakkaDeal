import { Router } from "express";
import { q, one } from "../db.js";
import { auth } from "../http.js";

const router = Router();
router.use(auth);

router.get("/", async (req, res) => {
  const rows = await q(
    `select id, title, message, deal_code, is_read, created_at
     from notifications
     where phone = $1
     order by id desc limit 50`,
    [req.user.phone]
  );
  res.json(rows);
});

router.post("/:id/read", async (req, res) => {
  await q(
    "update notifications set is_read = 1 where id = $1 and phone = $2",
    [req.params.id, req.user.phone]
  );
  res.json({ ok: true });
});

router.post("/read-all", async (req, res) => {
  await q(
    "update notifications set is_read = 1 where phone = $1",
    [req.user.phone]
  );
  res.json({ ok: true });
});

export default router;
