import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { recoverInterruptedRuns, seedIfEmpty } from './lib/bootstrap.js';
import { adminRouter } from './routes/admin.js';
import { publicRouter } from './routes/public.js';
import { startScheduler } from './scheduler.js';

if (!config.adminPassword) {
  console.error('ADMIN_PASSWORD is not set. Copy .env.example to .env and set a strong password.');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

app.use('/api', publicRouter);
app.use('/api/admin', adminRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Production: serve the Vite build. In development, Vite serves the frontend and proxies /api here.
const distDir = path.join(config.root, 'dist');
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  // The React app handles its own routes (/product/:id, /admin/...) and shows its own not-found page.
  // Requests for missing files (anything with an extension, such as a stale /assets/x.js) stay real 404s.
  app.use((req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || path.extname(req.path)) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
  app.use((req, res) => res.status(404).send('Not found'));
} else {
  console.warn('No frontend build found. Run "npm run build" for production, or "npm run dev" for development.');
  app.use((req, res) => res.status(404).send('Frontend not built. Run npm run build, or use npm run dev.'));
}

// Single error handler: 4xx messages go back to the client, 5xx are logged and hidden.
app.use((err, req, res, next) => {
  let status = err.status || err.statusCode || 500;
  let message;

  // Firestore errors carry a numeric gRPC code. Other errors use string codes such as ECONNRESET.
  if (typeof err.code === 'number') {
    if (err.code === 6) status = 409; // ALREADY_EXISTS
    if (err.code === 9) { // FAILED_PRECONDITION: a query needs an index that is not deployed yet
      console.error('Firestore index missing. Deploy firestore.indexes.json (see README).', err.message);
      status = 500;
      message = 'A database index is missing. Deploy firestore.indexes.json and try again.';
    }
  }
  if (err.type === 'entity.parse.failed') status = 400;

  if (status >= 500) console.error(err);
  if (!message) {
    if (status >= 500) message = 'Something went wrong on the server';
    else if (err.status) message = err.message; // our own validation and conflict messages
    else if (status === 409) message = 'That change conflicts with existing data (duplicate name or still in use)';
    else message = err.message;
  }
  if (res.headersSent) return next(err);
  res.status(status).json({ error: message });
});

let started = false;

function startupFailed(err) {
  console.error('Could not start: Firestore is not reachable or the credentials are wrong.');
  console.error(`  ${err.message}`);
  console.error('Check FIREBASE_PROJECT_ID and the service account (see README, "Set up Firebase").');
  process.exit(1);
}

// The Google client can reject a credentials lookup without anyone awaiting it. Before the server is up,
// report that as the startup problem it is. After startup, unhandled errors crash the process as usual.
process.on('unhandledRejection', (err) => {
  if (!started) startupFailed(err);
  throw err;
});

async function startup() {
  try {
    await seedIfEmpty();
    await recoverInterruptedRuns();
  } catch (err) {
    startupFailed(err);
  }
  started = true;

  const server = app.listen(config.port, () => {
    console.log(`PriceRadar running at http://localhost:${config.port}`);
    console.log(`Admin panel at http://localhost:${config.port}/admin/`);
    console.log(fs.existsSync(path.join(distDir, 'index.html'))
      ? 'Serving the built frontend from dist/'
      : 'Frontend not built yet. Use npm run dev, or npm run build first.');
  });

  if (config.autoStartScheduler) startScheduler();

  function shutdown() {
    console.log('Shutting down');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startup();
