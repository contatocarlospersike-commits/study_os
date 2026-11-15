import { createApp } from './app.js';
import { ensureDatabaseReady } from './db.js';
import { startScheduler } from './services/scheduler.js';

const PORT = Number(process.env.PORT || 3001);
const app = createApp();

ensureDatabaseReady()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[Study OS API] running on http://localhost:${PORT}`);
      startScheduler();
    });
  })
  .catch((err) => {
    console.error('[Study OS API] failed to initialize database:', err);
    process.exit(1);
  });
