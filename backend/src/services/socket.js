import { Server } from "socket.io";
import { config } from "../config.js";
import { verifyUserToken, isAdmin } from "../http.js";
import { one } from "../db.js";

let io = null;

const normalizePhone = (p) => String(p || "").replace(/\D/g, "").slice(-11);

/**
 * Initialize Socket.IO with the HTTP server
 * @param {import("node:http").Server} httpServer
 */
export function initSocket(httpServer) {
  if (io) return io;

  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || config.corsOrigins.includes(origin) || origin.includes("localhost") || origin.includes("127.0.0.1")) {
          callback(null, true);
        } else {
          callback(null, true); // Permissive for demo client access
        }
      },
      credentials: true,
    },
    pingTimeout: 30000,
    pingInterval: 25000,
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();

      if (token) {
        const user = await verifyUserToken(token);
        if (user) {
          socket.user = user;
        }
      }
      next(); // Always allow connection (guests can view deal pages)
    } catch (err) {
      console.warn("[SOCKET.IO AUTH WARN]", err.message);
      next();
    }
  });

  io.on("connection", (socket) => {
    const user = socket.user;

    // Join user rooms if authenticated
    if (user) {
      socket.join(`user:${user.id}`);
      const normPhone = normalizePhone(user.phone);
      if (normPhone) {
        socket.join(`phone:${normPhone}`);
      }
      if (isAdmin(user)) {
        socket.join("admin");
      }
      console.log(`[SOCKET.IO] Connected: User #${user.id} (${user.phone}) [socket: ${socket.id}]`);
    } else {
      console.log(`[SOCKET.IO] Connected: Guest [socket: ${socket.id}]`);
    }

    // Dynamic authentication for client session switches or post-login
    socket.on("authenticate", async (payload, callback) => {
      try {
        const token = payload?.token;
        if (!token) {
          return callback?.({ ok: false, error: "Token required" });
        }
        const authUser = await verifyUserToken(token);
        if (!authUser) {
          return callback?.({ ok: false, error: "Invalid or expired token" });
        }

        socket.user = authUser;
        socket.join(`user:${authUser.id}`);
        const normPhone = normalizePhone(authUser.phone);
        if (normPhone) socket.join(`phone:${normPhone}`);
        if (isAdmin(authUser)) socket.join("admin");

        console.log(`[SOCKET.IO] Authenticated socket ${socket.id} for user ${authUser.phone}`);
        callback?.({
          ok: true,
          user: {
            id: authUser.id,
            phone: authUser.phone,
            name: authUser.name,
            role: authUser.role,
            is_admin: isAdmin(authUser),
          },
        });
      } catch (err) {
        callback?.({ ok: false, error: err.message });
      }
    });

    // Join room for a specific deal (only buyer, seller or admin)
    socket.on("join_deal", async ({ code }, callback) => {
      try {
        if (!socket.user) {
          return callback?.({ ok: false, error: "Authentication required to join deal updates" });
        }
        if (!code || typeof code !== "string") {
          return callback?.({ ok: false, error: "Invalid deal code" });
        }
        const cleanCode = code.trim().toUpperCase();
        const deal = await one("select id, code, seller_id, buyer_id, buyer_phone from deals where upper(code)=$1", [cleanCode]);
        if (!deal) {
          return callback?.({ ok: false, error: "Deal not found" });
        }

        const isSeller = Number(socket.user.id) === Number(deal.seller_id);
        const isBuyer = Number(socket.user.id) === Number(deal.buyer_id) || (
          deal.buyer_phone && socket.user.phone && normalizePhone(socket.user.phone) === normalizePhone(deal.buyer_phone)
        );
        const isAdminUser = isAdmin(socket.user);

        if (!isSeller && !isBuyer && !isAdminUser) {
          return callback?.({ ok: false, error: "Access denied: only deal participants or admin can join" });
        }

        const room = `deal:${deal.code}`;
        socket.join(room);
        console.log(`[SOCKET.IO] Socket ${socket.id} (user ${socket.user.id}) joined room ${room}`);
        callback?.({ ok: true, room });
      } catch (err) {
        console.error("[SOCKET.IO JOIN DEAL ERROR]", err.message);
        callback?.({ ok: false, error: "Failed to join deal room" });
      }
    });

    // Leave deal room
    socket.on("leave_deal", ({ code }, callback) => {
      if (code && typeof code === "string") {
        const cleanCode = code.trim().toUpperCase();
        const room = `deal:${cleanCode}`;
        socket.leave(room);
        callback?.({ ok: true });
      }
    });

    // Ping / latency probe
    socket.on("ping_server", (data, callback) => {
      callback?.({ pong: true, time: Date.now(), received: data });
    });

    socket.on("disconnect", (reason) => {
      console.log(`[SOCKET.IO] Disconnected: ${socket.id} (reason: ${reason})`);
    });
  });

  console.log("[SOCKET.IO] Server initialized and ready for real-time events");
  return io;
}

/**
 * Access the initialized Socket.IO server
 */
export function getIO() {
  return io;
}

/**
 * Broadcast event to a specific user by id or phone number
 * @param {number|string} userIdentifier - User ID or phone number
 * @param {string} event - Event name
 * @param {any} data - Event payload
 */
export function emitToUser(userIdentifier, event, data) {
  if (!io) return;
  if (!userIdentifier) return;

  if (typeof userIdentifier === "number" || /^\d+$/.test(String(userIdentifier))) {
    io.to(`user:${userIdentifier}`).emit(event, data);
  }

  const normPhone = normalizePhone(userIdentifier);
  if (normPhone) {
    io.to(`phone:${normPhone}`).emit(event, data);
  }
}

/**
 * Broadcast event to all parties currently viewing a specific deal
 * @param {string} dealCode - Deal code (e.g. "PD-123456")
 * @param {string} event - Event name
 * @param {any} data - Event payload
 */
export function emitToDeal(dealCode, event, data) {
  if (!io || !dealCode) return;
  const cleanCode = String(dealCode).trim().toUpperCase();
  io.to(`deal:${cleanCode}`).emit(event, data);
}

/**
 * Broadcast event to all connected administrators
 * @param {string} event - Event name
 * @param {any} data - Event payload
 */
export function emitToAdmin(event, data) {
  if (!io) return;
  io.to("admin").emit(event, data);
}

/**
 * Broadcast event to all connected sockets
 * @param {string} event - Event name
 * @param {any} data - Event payload
 */
export function emitGlobal(event, data) {
  if (!io) return;
  io.emit(event, data);
}
