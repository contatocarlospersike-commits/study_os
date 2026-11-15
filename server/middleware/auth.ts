import { createClient } from '@supabase/supabase-js';
import type { NextFunction, Request, Response } from 'express';
import { ensureUserInitialized } from '../db.js';

declare global {
  namespace Express {
    interface Request {
      userId: string;
      userEmail?: string;
    }
  }
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabaseAuthClient =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Allow Vercel Cron / inbound automation without user JWT when handled explicitly
  if (req.path === '/automation/run-scheduler' || req.path === '/automation/inbound') {
    next();
    return;
  }

  // Local dev fallback when Supabase Auth env vars are not configured
  if (!supabaseAuthClient) {
    req.userId = 'dev-local-user';
    await ensureUserInitialized(req.userId);
    next();
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  const { data, error } = await supabaseAuthClient.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid or expired session token.' });
    return;
  }

  req.userId = data.user.id;
  req.userEmail = data.user.email;
  await ensureUserInitialized(req.userId);
  next();
}
