import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { io as Client } from "socket.io-client";
import { initDb, one, q } from "../src/db.js";
import { makeToken } from "../src/http.js";
import dealRoutes from "../src/routes/deals.js";
import disputeRoutes from "../src/routes/disputes.js";
import profileRoutes from "../src/routes/profiles.js";
import { initSocket, getIO } from "../src/services/socket.js";

test("Rule 1: auth + participant check on /consignment-slip, /unboxing-photo, /disputes/:id/photo with X-Content-Type-Options: nosniff", async () => {
  await initDb();

  const seller = await one("select * from users where role='seller' limit 1");
  const buyer = await one("select * from users where role='buyer' limit 1");
  const outsider = await one(
    `insert into users(phone, name, role, token_version)
     values('01988887766', 'Outsider User', 'buyer', 1) returning *`
  );
  const admin = await one("select * from users where phone='01700000000' limit 1");

  const dealCode = "PHOTO-TEST-" + Date.now();
  const mockBuffer = Buffer.from("fake-image-bytes");
  const deal = await one(
    `insert into deals(
       code, deal_type, seller_id, buyer_id, buyer_phone, buyer_name, address, product,
       price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, status,
       consignment_slip, consignment_slip_type, unboxing_photo, unboxing_photo_type
     ) values(
       $1, 'product', $2, $3, $4, $5, 'Dhaka', 'Photo Test Product',
       1000, 100, 1100, 10, 1100, 1100, 'delivered',
       $6, 'image/png', $6, 'image/jpeg'
     ) returning *`,
    [dealCode, seller.id, buyer.id, buyer.phone, buyer.name, mockBuffer]
  );

  const dispute = await one(
    `insert into disputes(deal_id, raised_by_phone, reason, photo, photo_type, status)
     values($1, $2, 'Damaged package test', $3, 'image/png', 'open') returning *`,
    [deal.id, buyer.phone, mockBuffer]
  );

  const app = express();
  app.use(express.json());
  app.use("/deals", dealRoutes);
  app.use("/", disputeRoutes);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ detail: err.message });
  });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const authHeader = (u) => ({ Authorization: `Bearer ${makeToken(u)}` });

  try {
    // A. Consignment Slip
    // 1. Unauthenticated -> 401
    const unauthSlip = await fetch(`${baseUrl}/deals/${dealCode}/consignment-slip`);
    assert.equal(unauthSlip.status, 401, "Unauthenticated request to consignment slip must return 401");

    // 2. Outsider -> 403
    const outsiderSlip = await fetch(`${baseUrl}/deals/${dealCode}/consignment-slip`, {
      headers: authHeader(outsider),
    });
    assert.equal(outsiderSlip.status, 403, "Non-participant request to consignment slip must return 403");

    // 3. Participant (seller) -> 200 with X-Content-Type-Options: nosniff
    const sellerSlip = await fetch(`${baseUrl}/deals/${dealCode}/consignment-slip`, {
      headers: authHeader(seller),
    });
    assert.equal(sellerSlip.status, 200);
    assert.equal(sellerSlip.headers.get("x-content-type-options"), "nosniff");

    // 4. Participant (buyer) -> 200
    const buyerSlip = await fetch(`${baseUrl}/deals/${dealCode}/consignment-slip`, {
      headers: authHeader(buyer),
    });
    assert.equal(buyerSlip.status, 200);
    assert.equal(buyerSlip.headers.get("x-content-type-options"), "nosniff");

    // B. Unboxing Photo
    // 1. Unauthenticated -> 401
    const unauthUnboxing = await fetch(`${baseUrl}/deals/${dealCode}/unboxing-photo`);
    assert.equal(unauthUnboxing.status, 401);

    // 2. Outsider -> 403
    const outsiderUnboxing = await fetch(`${baseUrl}/deals/${dealCode}/unboxing-photo`, {
      headers: authHeader(outsider),
    });
    assert.equal(outsiderUnboxing.status, 403);

    // 3. Buyer -> 200 with nosniff
    const buyerUnboxing = await fetch(`${baseUrl}/deals/${dealCode}/unboxing-photo`, {
      headers: authHeader(buyer),
    });
    assert.equal(buyerUnboxing.status, 200);
    assert.equal(buyerUnboxing.headers.get("x-content-type-options"), "nosniff");

    // C. Dispute Evidence Photo
    // 1. Unauthenticated -> 401
    const unauthDispute = await fetch(`${baseUrl}/disputes/${dispute.id}/photo`);
    assert.equal(unauthDispute.status, 401);

    // 2. Outsider -> 403
    const outsiderDispute = await fetch(`${baseUrl}/disputes/${dispute.id}/photo`, {
      headers: authHeader(outsider),
    });
    assert.equal(outsiderDispute.status, 403);

    // 3. Seller participant -> 200 with nosniff
    const sellerDispute = await fetch(`${baseUrl}/disputes/${dispute.id}/photo`, {
      headers: authHeader(seller),
    });
    assert.equal(sellerDispute.status, 200);
    assert.equal(sellerDispute.headers.get("x-content-type-options"), "nosniff");

    // 4. Admin -> 200 with nosniff
    if (admin) {
      const adminDispute = await fetch(`${baseUrl}/disputes/${dispute.id}/photo`, {
        headers: authHeader(admin),
      });
      assert.equal(adminDispute.status, 200);
      assert.equal(adminDispute.headers.get("x-content-type-options"), "nosniff");
    }
  } finally {
    server.close();
    await q("delete from disputes where id=$1", [dispute.id]);
    await q("delete from deals where id=$1", [deal.id]);
    await q("delete from users where id=$1", [outsider.id]);
  }
});

test("Rule 2: Remove phone from GET /profiles/seller/:id and from seller object in GET /deals/:code for non-participants; use opaque public_id", async () => {
  await initDb();

  const seller = await one("select * from users where role='seller' limit 1");
  assert.ok(seller.public_id, "Seller must have public_id");

  const buyer = await one("select * from users where role='buyer' limit 1");
  const outsider = await one(
    `insert into users(phone, name, role, token_version)
     values('01977776655', 'Outsider Two', 'buyer', 1) returning *`
  );

  const dealCode = "SELLER-TEST-" + Date.now();
  const deal = await one(
    `insert into deals(
       code, deal_type, seller_id, buyer_id, buyer_phone, buyer_name, address, product,
       price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, status
     ) values(
       $1, 'product', $2, $3, $4, $5, 'Dhaka', 'Seller Test Item',
       1500, 100, 1600, 15, 1600, 1600, 'created'
     ) returning *`,
    [dealCode, seller.id, buyer.id, buyer.phone, buyer.name]
  );

  const app = express();
  app.use(express.json());
  app.use("/deals", dealRoutes);
  app.use("/profiles", profileRoutes);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ detail: err.message });
  });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const authHeader = (u) => ({ Authorization: `Bearer ${makeToken(u)}` });

  try {
    // 1. GET /profiles/seller/:id using public_id
    const resPublicId = await fetch(`${baseUrl}/profiles/seller/${seller.public_id}`);
    assert.equal(resPublicId.status, 200);
    const bodyPublic = await resPublicId.json();
    assert.ok(bodyPublic.seller);
    assert.equal(bodyPublic.seller.id, seller.public_id);
    assert.equal(bodyPublic.seller.public_id, seller.public_id);
    assert.equal(bodyPublic.seller.phone, undefined, "phone must be removed from GET /profiles/seller/:id");

    // 2. GET /deals/:code viewed by outsider (non-participant)
    const resOutsider = await fetch(`${baseUrl}/deals/${dealCode}`, {
      headers: authHeader(outsider),
    });
    assert.equal(resOutsider.status, 200);
    const bodyOutsider = await resOutsider.json();
    assert.equal(bodyOutsider.seller.id, seller.public_id);
    assert.equal(bodyOutsider.seller.phone, undefined, "phone must be omitted from seller object for non-participants");

    // 3. GET /deals/:code viewed by buyer (participant)
    const resBuyer = await fetch(`${baseUrl}/deals/${dealCode}`, {
      headers: authHeader(buyer),
    });
    assert.equal(resBuyer.status, 200);
    const bodyBuyer = await resBuyer.json();
    assert.equal(bodyBuyer.seller.id, seller.public_id);
    assert.equal(bodyBuyer.seller.phone, seller.phone, "phone should be visible to deal participants");
  } finally {
    server.close();
    await q("delete from deals where id=$1", [deal.id]);
    await q("delete from users where id=$1", [outsider.id]);
  }
});

test("Rule 3 & 4: Deal codes 12+ base32 chars, unauthenticated minimal invite stub, and GET /deals/:code does not mutate status", async () => {
  await initDb();

  const seller = await one("select * from users where role='seller' limit 1");
  const buyer = await one("select * from users where role='buyer' limit 1");

  const app = express();
  app.use(express.json());
  app.use("/deals", dealRoutes);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ detail: err.message });
  });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const authHeader = (u) => ({ Authorization: `Bearer ${makeToken(u)}` });

  let createdDeal = null;

  try {
    // 1. Create deal and verify code format
    const resCreate = await fetch(`${baseUrl}/deals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(seller) },
      body: JSON.stringify({
        product: "Base32 Random Test Item",
        price: 3500,
        delivery_charge: 100,
        address: "Dhanmondi 27, Dhaka",
        buyer_phone: buyer.phone,
        buyer_name: buyer.name,
      }),
    });
    assert.equal(resCreate.status, 201);
    createdDeal = await resCreate.json();

    // Assert code is 12+ chars, valid base32 (alphabet A-Z2-7)
    assert.ok(createdDeal.code.length >= 12, `Code ${createdDeal.code} must be at least 12 chars`);
    assert.match(createdDeal.code, /^[A-Z2-7]{12,}$/, `Code ${createdDeal.code} must be valid base32`);

    // 2. Unauthenticated GET /deals/:code -> minimal invite stub
    const resUnauth = await fetch(`${baseUrl}/deals/${createdDeal.code}`);
    assert.equal(resUnauth.status, 200);
    const unauthBody = await resUnauth.json();
    assert.equal(unauthBody.invite, true);
    assert.equal(unauthBody.requires_auth, true);
    assert.ok(unauthBody.deal.product);
    assert.equal(unauthBody.deal.buyer_phone, undefined, "Minimal stub must not leak buyer phone");
    assert.equal(unauthBody.deal.address, undefined, "Minimal stub must not leak delivery address");
    assert.equal(unauthBody.ledger, undefined, "Minimal stub must not expose ledger");
    assert.equal(unauthBody.events, undefined, "Minimal stub must not expose events");

    // 3. Rule 4: GET /deals/:code MUST NOT mutate status
    const resAuth = await fetch(`${baseUrl}/deals/${createdDeal.code}`, {
      headers: authHeader(buyer),
    });
    assert.equal(resAuth.status, 200);
    const authBody = await resAuth.json();
    assert.equal(authBody.deal.status, "created", "GET request must NOT mutate deal status to payment_pending");

    const dealInDb = await one("select status from deals where id=$1", [createdDeal.id]);
    assert.equal(dealInDb.status, "created", "DB status must remain 'created' after GET request");

    // 4. Explicit POST /deals/:code/open mutates created -> payment_pending
    const resOpen = await fetch(`${baseUrl}/deals/${createdDeal.code}/open`, {
      method: "POST",
      headers: authHeader(buyer),
    });
    assert.equal(resOpen.status, 200);
    const openBody = await resOpen.json();
    assert.equal(openBody.deal.status, "payment_pending", "Explicit POST /open must advance status to payment_pending");

    const dealAfterOpen = await one("select status from deals where id=$1", [createdDeal.id]);
    assert.equal(dealAfterOpen.status, "payment_pending");
  } finally {
    server.close();
    if (createdDeal?.id) {
      await q("delete from deal_events where deal_id=$1", [createdDeal.id]);
      await q("delete from deals where id=$1", [createdDeal.id]);
    }
  }
});

test("Rule 5: In socket.js join_deal, allow joining only if the socket's user is the deal's buyer, seller or admin", async () => {
  await initDb();

  const seller = await one("select * from users where role='seller' limit 1");
  const buyer = await one("select * from users where role='buyer' limit 1");
  const outsider = await one(
    `insert into users(phone, name, role, token_version)
     values('01966665544', 'Outsider Three', 'buyer', 1) returning *`
  );
  const admin = await one("select * from users where phone='01700000000' limit 1");

  const dealCode = "SOCKET-RULE5-" + Date.now();
  const deal = await one(
    `insert into deals(code, seller_id, buyer_id, buyer_phone, buyer_name, address, product, price, total_amount, status)
     values($1, $2, $3, $4, $5, 'Dhaka', 'Socket Rule 5 Item', 1000, 1000, 'created') returning *`,
    [dealCode, seller.id, buyer.id, buyer.phone, buyer.name]
  );

  const app = express();
  const httpServer = http.createServer(app);
  initSocket(httpServer);

  let port;
  await new Promise((resolve) => {
    httpServer.listen(0, () => {
      port = httpServer.address().port;
      resolve();
    });
  });

  const connectClient = (user = null) => {
    const opts = {
      transports: ["websocket"],
      ...(user ? { auth: { token: makeToken(user) } } : {}),
    };
    const c = Client(`http://localhost:${port}`, opts);
    return new Promise((resolve, reject) => {
      c.on("connect", () => resolve(c));
      c.on("connect_error", reject);
    });
  };

  const guestSocket = await connectClient(null);
  const outsiderSocket = await connectClient(outsider);
  const sellerSocket = await connectClient(seller);
  const buyerSocket = await connectClient(buyer);
  const adminSocket = admin ? await connectClient(admin) : null;

  try {
    // 1. Guest socket attempt -> REJECTED
    const guestRes = await new Promise((resolve) => {
      guestSocket.emit("join_deal", { code: dealCode }, resolve);
    });
    assert.equal(guestRes.ok, false);
    assert.match(guestRes.error, /Authentication required/i);

    // 2. Outsider socket attempt -> REJECTED (403)
    const outsiderRes = await new Promise((resolve) => {
      outsiderSocket.emit("join_deal", { code: dealCode }, resolve);
    });
    assert.equal(outsiderRes.ok, false);
    assert.match(outsiderRes.error, /Access denied/i);

    // 3. Seller socket attempt -> ACCEPTED
    const sellerRes = await new Promise((resolve) => {
      sellerSocket.emit("join_deal", { code: dealCode }, resolve);
    });
    assert.equal(sellerRes.ok, true);
    assert.equal(sellerRes.room, `deal:${dealCode}`);

    // 4. Buyer socket attempt -> ACCEPTED
    const buyerRes = await new Promise((resolve) => {
      buyerSocket.emit("join_deal", { code: dealCode }, resolve);
    });
    assert.equal(buyerRes.ok, true);
    assert.equal(buyerRes.room, `deal:${dealCode}`);

    // 5. Admin socket attempt -> ACCEPTED
    if (adminSocket) {
      const adminRes = await new Promise((resolve) => {
        adminSocket.emit("join_deal", { code: dealCode }, resolve);
      });
      assert.equal(adminRes.ok, true);
      assert.equal(adminRes.room, `deal:${dealCode}`);
    }
  } finally {
    guestSocket.disconnect();
    outsiderSocket.disconnect();
    sellerSocket.disconnect();
    buyerSocket.disconnect();
    if (adminSocket) adminSocket.disconnect();

    const ioServer = getIO();
    if (ioServer) await new Promise((r) => ioServer.close(r));
    await new Promise((r) => httpServer.close(r));

    await q("delete from deals where id=$1", [deal.id]);
    await q("delete from users where id=$1", [outsider.id]);
  }
});
