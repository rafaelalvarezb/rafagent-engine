import { Server as HTTPServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import type { Server } from "socket.io";

let io: Server | null = null;

export function initializeWebSocket(httpServer: HTTPServer): Server {
  // Allow both production and development URLs
  const allowedOrigins = [
    process.env.FRONTEND_URL || "https://rafagent-saas.vercel.app",
    "http://localhost:5173",
    "http://localhost:5174", // Vite preview
  ].filter(Boolean);

  console.log('🔌 Initializing WebSocket with CORS origins:', allowedOrigins);

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type", "Authorization"],
    },
    path: '/socket.io/',
    transports: ['polling', 'websocket'], // Try polling first, then upgrade to websocket
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e6,
    serveClient: false,
  });

  io.on("connection", (socket) => {
    console.log(`🔌 Client connected: ${socket.id} from ${socket.handshake.address}`);

    // Join user-specific room
    socket.on("join", (userId: string) => {
      socket.join(`user:${userId}`);
      console.log(`✅ User ${userId} joined their room`);
    });

    socket.on("disconnect", () => {
      console.log(`❌ Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error("Socket.IO not initialized. Call initializeWebSocket first.");
  }
  return io;
}

// Emit events to specific user
export function emitToUser(userId: string, event: string, data: any) {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
    console.log(`📡 Emitted "${event}" to user ${userId}`);
  }
}

// Emit prospect update
export function emitProspectUpdate(userId: string, prospect: any) {
  emitToUser(userId, "prospect:update", prospect);
}

// Emit prospect status change
export function emitProspectStatusChange(userId: string, prospectId: string, status: string) {
  emitToUser(userId, "prospect:status", { prospectId, status });
}

// Emit meeting scheduled
export function emitMeetingScheduled(userId: string, prospectId: string, meetingData: any) {
  emitToUser(userId, "meeting:scheduled", { prospectId, ...meetingData });
}

