import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

/**
 * Middleware to check if user is authenticated
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const user = await storage.getUser(req.session.userId);
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
 * Get current user from session
 */
export async function getCurrentUser(req: Request) {
  if (!req.session.userId) {
    return null;
  }
  
  return await storage.getUser(req.session.userId);
}

/**
 * Get current user ID from session
 */
export function getCurrentUserId(req: Request): string | null {
  return req.session.userId || null;
}

