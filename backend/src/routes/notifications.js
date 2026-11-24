import { Router } from "express";
import { q } from "../db.js";
import { auth } from "../http.js";

const router = Router();
router.use(auth);

router.get("/", async (req, res) => {
  const rows = await q(
    `select distinct n.id, n.title, n.message, n.deal_code, n.is_read, n.created_at
     from notifications n
     left join deals d on d.code = n.deal_code
     where (d.id is not null and (d.buyer_id = $1 or d.seller_id = $1)) or n.phone = $2
     order by n.id desc limit 50`,
    [req.user.id, req.user.phone]
  );
  res.json(rows);
});

router.post("/:id/read", async (req, res) => {
  await q(
    `update notifications set is_read = 1
     where id = $1 and (
       deal_code in (select code from deals where buyer_id = $2 or seller_id = $2)
       or phone = $3
     )`,
    [req.params.id, req.user.id, req.user.phone]
  );
  res.json({ ok: true });
});

router.post("/read-all", async (req, res) => {
  await q(
    `update notifications set is_read = 1
     where deal_code in (select code from deals where buyer_id = $1 or seller_id = $1)
       or phone = $2`,
    [req.user.id, req.user.phone]
  );
  res.json({ ok: true });
});

export default router;
