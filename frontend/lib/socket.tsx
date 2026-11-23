"use client";
import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from "react";
import { io, Socket } from "socket.io-client";
import { API, getToken } from "./api";
import { useAuth } from "./auth";

type SocketContextType = {
  socket: Socket | null;
  isConnected: boolean;
  transport: string;
  joinDeal: (code: string) => void;
  leaveDeal: (code: string) => void;
  emit: (event: string, ...args: any[]) => void;
  on: (event: string, callback: (...args: any[]) => void) => () => void;
};

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  transport: "disconnected",
  joinDeal: () => {},
  leaveDeal: () => {},
  emit: () => {},
  on: () => () => {},
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [transport, setTransport] = useState("disconnected");
  const activeDealsRef = useRef<Set<string>>(new Set());
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = getToken();

    // Initialize Socket.IO client instance
    const s: Socket = io(API, {
      auth: { token: token || "" },
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      withCredentials: true,
    });

    socketRef.current = s;
    setSocket(s);

    s.on("connect", () => {
      setIsConnected(true);
      const currentTransport = s.io?.engine?.transport?.name || "connected";
      setTransport(currentTransport);
      console.log(`[SOCKET.IO] Connected (ID: ${s.id}, transport: ${currentTransport})`);

      // Re-join any active deal rooms on reconnect
      activeDealsRef.current.forEach((code) => {
        s.emit("join_deal", { code });
      });

      // Listen for transport upgrades (e.g. polling -> websocket)
      s.io?.engine?.on("upgrade", (upgradedTransport: any) => {
        const name = upgradedTransport?.name || "websocket";
        setTransport(name);
        console.log(`[SOCKET.IO] Transport upgraded to ${name}`);
      });
    });

    s.on("disconnect", (reason) => {
      setIsConnected(false);
      setTransport("disconnected");
      console.log(`[SOCKET.IO] Disconnected: ${reason}`);
    });

    s.on("connect_error", (err) => {
      console.warn("[SOCKET.IO] Connection error:", err.message);
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Update authentication whenever the logged-in user changes
  useEffect(() => {
    const s = socketRef.current;
    if (!s || !s.connected) return;

    const token = getToken();
    if (token) {
      s.emit("authenticate", { token }, (res: any) => {
        if (res?.ok) {
          console.log("[SOCKET.IO] Session authenticated for", res.user?.phone);
        }
      });
    }
  }, [user]);

  const joinDeal = useCallback((code: string) => {
    if (!code) return;
    const cleanCode = code.trim().toUpperCase();
    activeDealsRef.current.add(cleanCode);
    const s = socketRef.current;
    if (s && s.connected) {
      s.emit("join_deal", { code: cleanCode });
    }
  }, []);

  const leaveDeal = useCallback((code: string) => {
    if (!code) return;
    const cleanCode = code.trim().toUpperCase();
    activeDealsRef.current.delete(cleanCode);
    const s = socketRef.current;
    if (s && s.connected) {
      s.emit("leave_deal", { code: cleanCode });
    }
  }, []);

  const emit = useCallback((event: string, ...args: any[]) => {
    const s = socketRef.current;
    if (s) {
      s.emit(event, ...args);
    }
  }, []);

  const on = useCallback((event: string, callback: (...args: any[]) => void) => {
    const s = socketRef.current;
    if (s) {
      s.on(event, callback);
    }
    return () => {
      const currentSocket = socketRef.current;
      if (currentSocket) {
        currentSocket.off(event, callback);
      }
    };
  }, []);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        transport,
        joinDeal,
        leaveDeal,
        emit,
        on,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
}
