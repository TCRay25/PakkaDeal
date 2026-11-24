import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { io as Client } from "socket.io-client";
import { initSocket, getIO, emitToDeal, emitToUser, emitToAdmin } from "../src/services/socket.js";
import { makeToken } from "../src/http.js";
import { initDb, one, q } from "../src/db.js";

let server;
let serverPort;
let guestClient;
let authClient;
let testUser;

before(async () => {
  await initDb();
  testUser = await one("select * from users limit 1");
  assert.ok(testUser, "Test user exists");

  const app = express();
  server = http.createServer(app);
  initSocket(server);

  await new Promise((resolve) => {
    server.listen(0, () => {
      serverPort = server.address().port;
      resolve();
    });
  });
});

after(async () => {
  if (guestClient?.connected) guestClient.disconnect();
  if (authClient?.connected) authClient.disconnect();
  const ioServer = getIO();
  if (ioServer) {
    await new Promise((resolve) => ioServer.close(resolve));
  }
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("socket.io: connects guest client and handles ping-pong", async () => {
  guestClient = Client(`http://localhost:${serverPort}`, {
    transports: ["websocket"],
  });

  await new Promise((resolve, reject) => {
    guestClient.on("connect", resolve);
    guestClient.on("connect_error", reject);
  });

  assert.ok(guestClient.connected, "Guest client connected");

  // Ping-pong test
  const pingRes = await new Promise((resolve) => {
    guestClient.emit("ping_server", { hello: "world" }, resolve);
  });

  assert.equal(pingRes.pong, true);
  assert.equal(pingRes.received.hello, "world");
});

test("socket.io: authenticated client joins user rooms", async () => {
  const token = makeToken(testUser.id);

  authClient = Client(`http://localhost:${serverPort}`, {
    auth: { token },
    transports: ["websocket"],
  });

  await new Promise((resolve, reject) => {
    authClient.on("connect", resolve);
    authClient.on("connect_error", reject);
  });

  assert.ok(authClient.connected, "Auth client connected");
});

test("socket.io: room join, leave, and deal broadcast", async () => {
  const dealCode = "PD-REALTIME-TEST";

  // Insert a deal where testUser is the seller
  await q("delete from deals where code=$1", [dealCode]);
  await q(
    `insert into deals(code, seller_id, buyer_phone, buyer_name, address, product, price, total_amount, status)
     values($1, $2, '01799887766', 'Test Buyer', 'Dhaka', 'Test Item', 1000, 1000, 'created')`,
    [dealCode, testUser.id]
  );

  // Guest client attempt to join deal room MUST be rejected
  const guestJoinRes = await new Promise((resolve) => {
    guestClient.emit("join_deal", { code: dealCode }, resolve);
  });
  assert.equal(guestJoinRes.ok, false);

  // Authenticated participant (seller) joins deal room
  const joinRes = await new Promise((resolve) => {
    authClient.emit("join_deal", { code: dealCode }, resolve);
  });

  assert.equal(joinRes.ok, true);
  assert.equal(joinRes.room, `deal:${dealCode}`);

  // Test broadcast to deal room
  const dealEventPromise = new Promise((resolve) => {
    authClient.once("deal:status_changed", (data) => resolve(data));
  });

  emitToDeal(dealCode, "deal:status_changed", {
    code: dealCode,
    from_status: "created",
    to_status: "held",
    actor: "buyer",
  });

  const receivedEvent = await dealEventPromise;
  assert.equal(receivedEvent.code, dealCode);
  assert.equal(receivedEvent.to_status, "held");

  // Auth client leaves deal room
  const leaveRes = await new Promise((resolve) => {
    authClient.emit("leave_deal", { code: dealCode }, resolve);
  });
  assert.equal(leaveRes.ok, true);

  // Clean up
  await q("delete from deals where code=$1", [dealCode]);
});

test("socket.io: real-time user notification delivery", async () => {
  const notificationPromise = new Promise((resolve) => {
    authClient.once("notification:new", (data) => resolve(data));
  });

  emitToUser(testUser.phone, "notification:new", {
    title: "Instant Escrow Alert",
    message: "Buyer funded 5000 BDT into escrow vault",
    deal_code: "PD-NOTIF-99",
  });

  const receivedNotif = await notificationPromise;
  assert.equal(receivedNotif.title, "Instant Escrow Alert");
  assert.equal(receivedNotif.deal_code, "PD-NOTIF-99");
});
