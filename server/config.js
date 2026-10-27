import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const num = (value, fallback) => (value === undefined || value === '' ? fallback : Number(value));

export const config = {
  root,
  port: num(process.env.PORT, 3000),

  // Firebase. Credentials are read in this order: JSON in FIREBASE_SERVICE_ACCOUNT_JSON,
  // the file at FIREBASE_SERVICE_ACCOUNT_PATH, Application Default Credentials, or the Firestore emulator.
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || '',
  serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(root, 'firebase-service-account.json'),
  serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',

  // Admin login. ADMIN_PASSWORD is required, the server will not start without it.
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  sessionHours: num(process.env.SESSION_HOURS, 12),
  cookieSecure: process.env.COOKIE_SECURE === 'true',

  // Scraper settings
  headless: process.env.HEADLESS !== 'false',
  chromePath: process.env.CHROME_PATH || undefined,
  navTimeoutMs: num(process.env.NAV_TIMEOUT_MS, 60000),
  pageDelayMs: num(process.env.PAGE_DELAY_MS, 1500),
  maxPagesLimit: 50,

  // Search and filters that Firestore cannot run directly are checked in memory over at most this many products
  scanCap: num(process.env.SEARCH_SCAN_LIMIT, 1000),

  // Scheduler
  autoStartScheduler: process.env.AUTO_START_SCHEDULER !== 'false',
  schedulerTickMs: num(process.env.SCHEDULER_TICK_MS, 30000),
  minIntervalMinutes: 5,
};
