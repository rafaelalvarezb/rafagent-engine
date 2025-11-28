import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import jwt from 'jsonwebtoken';

/**
 * Middleware to check if user is authenticated
 * Supports both Session (Cookie) and JWT (Header) authentication
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  let userId = req.session.userId;

  // If no session, check for JWT in Authorization header
  if (!userId) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'dev-secret-change-in-production';
        const decoded: any = jwt.verify(token, JWT_SECRET);
        if (decoded && decoded.userId) {
          userId = decoded.userId;
          // Restore session from token if valid
          req.session.userId = userId;
        }
      } catch (err) {
        console.error('JWT verification failed:', err);
        // Don't fail here, let it fall through to 401 if no session
      }
    }
  }

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const user = await storage.getUser(userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'User not found' });
    }

    // Attach user to request for convenience
    (req as any).user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Get current user from session or JWT
 */
export async function getCurrentUser(req: Request) {
  const userId = getCurrentUserId(req);
  if (!userId) {
    return null;
  }
  
  return await storage.getUser(userId);
}

/**
 * Get current user ID from session or JWT
 */
export function getCurrentUserId(req: Request): string | null {
  // Check session first
  if (req.session.userId) {
    return req.session.userId;
  }

  // Check JWT
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'dev-secret-change-in-production';
      const decoded: any = jwt.verify(token, JWT_SECRET);
      return decoded.userId || null;
    } catch (err) {
      return null;
    }
  }

  return null;
}

