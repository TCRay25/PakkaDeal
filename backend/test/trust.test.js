import { test } from "node:test";
import assert from "node:assert/strict";
import { score, depositFor } from "../src/services/trust.js";
import { scoreOrder } from "../src/services/risk.js";

test("new buyer starts at 60", () => assert.equal(score({ delivered: 0, refused: 0, disputes: 0 }), 60));
test("good record earns a high score", () => assert.ok(score({ delivered: 10, refused: 0, disputes: 0 }) >= 90));
test("disputes lower the score", () => assert.ok(score({ delivered: 5, refused: 0, disputes: 2 }) < score({ delivered: 5, refused: 0, disputes: 0 })));
test("deposit rules", () => {
  assert.equal(depositFor(90, 80), 0);
  assert.equal(depositFor(75, 80), 40);
  assert.equal(depositFor(50, 80), 80);
});
test("risky order scores higher", () => {
  const safe = scoreOrder({ price: 800, charge: 80, address: "House 4, Road 2, Kandirpar, Cumilla", successRatio: 0.95, hourBd: 14, newBuyer: false });
  const risky = scoreOrder({ price: 9000, charge: 80, address: "Cumilla", successRatio: 0.3, hourBd: 2, newBuyer: true });
  assert.ok(risky.score > safe.score);
});
