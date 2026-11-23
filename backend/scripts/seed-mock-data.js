import { seed50MockDeals } from "../src/services/mockDeals.js";

seed50MockDeals({ force: true })
  .then((res) => {
    console.log("Mock data seeding completed:", res);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Mock data seeding error:", err);
    process.exit(1);
  });
