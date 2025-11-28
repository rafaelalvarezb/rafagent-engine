import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { sessionMiddleware } from "./middleware/session";
import { startAgentScheduler } from "./automation/scheduler";
import { initializeWebSocket } from "./services/websocket";

// Simple log function for production (vite.ts is only needed in development)
function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

const app = express();
app.set("trust proxy", 1); // Trust first proxy (Vercel/Railway)
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session management
app.use(sessionMiddleware);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    // Dynamically import vite only in development
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    // In production, only serve static files if they exist (for Vercel)
    // For Railway (backend only), skip static file serving
    try {
      const { serveStatic } = await import("./vite");
    serveStatic(app);
    } catch (error: any) {
      // If static files don't exist or vite can't be imported (Railway backend only), that's OK
      if (error.code === 'ERR_MODULE_NOT_FOUND') {
        log("⚠️  Vite not available - running as API-only backend");
      } else {
        log("⚠️  Static files not found - running as API-only backend");
      }
    }
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Default to 3000 if not specified (avoiding macOS AirPlay on 5000)
  const port = parseInt(process.env.PORT || '3000', 10);
  server.listen(port, "0.0.0.0", () => {
    log(`🚀 Server running at http://0.0.0.0:${port}`);
    
    // Initialize WebSocket server AFTER server is listening
    initializeWebSocket(server);
    log("🔌 WebSocket server initialized");
    
    // Start the agent scheduler
    startAgentScheduler();
  });
})();
