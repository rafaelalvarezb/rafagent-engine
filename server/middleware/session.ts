import session from 'express-session';
import MemoryStore from 'memorystore';

const SessionStore = MemoryStore(session);

if (!process.env.SESSION_SECRET) {
  console.warn('⚠️  SESSION_SECRET not set. Using default (insecure for production)');
}

export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  store: new SessionStore({
    checkPeriod: 86400000 // prune expired entries every 24h
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production', // require https in production
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
});

// Extend Express Request type to include session data
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    userEmail?: string;
  }
}

