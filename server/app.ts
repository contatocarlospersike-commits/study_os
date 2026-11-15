import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { ensureDatabaseReady } from './db.js';
import { requireAuth } from './middleware/auth.js';
import { subjectsRouter } from './routes/subjects.js';
import { reviewsRouter } from './routes/reviews.js';
import { quizzesRouter } from './routes/quizzes.js';
import { sessionsRouter } from './routes/sessions.js';
import { automationRouter, analyticsRouter } from './routes/automation.js';
import { chatRouter, materialsRouter } from './routes/rag.js';
import { libraryRouter } from './routes/library.js';
import { cognitiveRouter } from './routes/cognitive.js';
import { notesRouter } from './routes/notes.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', async (_req, res) => {
    try {
      await ensureDatabaseReady();
      res.json({
        ok: true,
        service: 'study-os-api',
        database: process.env.DATABASE_URL ? 'postgres' : 'sqlite',
        auth: Boolean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
          ? 'supabase'
          : 'dev-local',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: (err as Error).message });
    }
  });

  app.use('/api', async (_req, res, next) => {
    try {
      await ensureDatabaseReady();
      next();
    } catch (err) {
      res.status(500).json({ error: `Database initialization failed: ${(err as Error).message}` });
    }
  });

  app.use('/api', requireAuth);

  app.use('/api/subjects', subjectsRouter);
  app.use('/api/reviews', reviewsRouter);
  app.use('/api/quizzes', quizzesRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api/automation', automationRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/materials', materialsRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/library', libraryRouter);
  app.use('/api/cognitive', cognitiveRouter);
  app.use('/api/notes', notesRouter);

  app.use('/api', (err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Study OS API Error]', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
  });

  const distDir = path.resolve(process.cwd(), 'dist');
  if (!process.env.VERCEL && process.env.NODE_ENV === 'production' && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return app;
}
