# PriceRadar

A scraping site that collects product listings (shoes, electronics, clothing and more) from online stores,
shows them in a modern catalogue, and lets an admin control the scraper from a dashboard.
Everything is stored in Firebase Firestore so it can later feed an ecommerce project.

Built from the original Puppeteer Jumia scraper. The frontend is a React app (built with Vite, routed with React Router) and the backend is Express.
The scraper's selectors and pagination logic are kept, now as a reusable "store" configuration.

## Features

**Public site (`/`)**
- Search, category chips, store filter, min/max price, "on sale" filter, sort by price, discount or rating
- Product cards with discount badges and star ratings, product detail pages with price history charts
- Light and dark themes, responsive layout, filter state kept in the URL so links can be shared
- JSON API at `/api/products`, `/api/categories`, `/api/sources`, `/api/products/:id`

**Admin panel (`/admin/`)**
- Dashboard with product, run and failure counts, live scraper status and a "run now" form
- Schedules: choose any store and category, set how many pages per run, and set the interval
  (15 min, 30 min, 1 h, 3 h, 6 h, 12 h, 24 h, or any custom number of minutes). Pause, resume, edit or run immediately
- Stores: add any ecommerce site with a search URL template and CSS selectors. "Jumia Kenya" is a built-in preset
- Categories: name, emoji and the search term sent to each store
- Products: search, filter, hide (keeps the data but removes it from the shop) or delete, and export to CSV
- Run history: every scrape with status, counts, duration, error and full log

## Quick start

Requirements: Node.js 22.12 or newer, and a Firebase project with Cloud Firestore.

```bash
cd priceradar
npm install                 # also downloads Chromium for Puppeteer
cp .env.example .env        # set ADMIN_PASSWORD and FIREBASE_PROJECT_ID
# put firebase-service-account.json in this folder (see "Set up Firebase" below)
npm run firestore:indexes -- --project your-firebase-project-id   # once, see below
npm start                   # builds the Vite frontend, then starts the server
```

- Shop: http://localhost:3000
- Admin: http://localhost:3000/admin/ (username and password from `.env`)
- Product pages are at `/product/<id>`. Old `/product.html?id=<id>` and `/admin/#/schedules` links still work.

The first start creates the Jumia Kenya store and five starter categories (Shoes, Electronics, Clothing, Phones, Laptops).

## Set up Firebase

1. In the [Firebase console](https://console.firebase.google.com), create a project.
2. Build > **Firestore Database** > Create database. Pick a location and start in production mode.
   The rules in `firestore.rules` already block browser access, and the server uses the Admin SDK.
3. Project settings > **Service accounts** > **Generate new private key**. Save the file as
   `firebase-service-account.json` in the project folder. It is git-ignored. Keep it secret.
   On hosts without a file system, paste the JSON into `FIREBASE_SERVICE_ACCOUNT_JSON` instead.
4. Set `FIREBASE_PROJECT_ID` in `.env` to your project ID.
5. Deploy the composite indexes. They are needed for the shop's filtered and sorted queries:

   ```bash
   npx firebase-tools login
   npm run firestore:indexes -- --project your-firebase-project-id
   ```

   Index builds take a few minutes. Until they finish, a filtered page shows "A database index is missing"
   and the server log says which index is missing.

### Local testing with the emulator

The Firestore emulator needs Java 11 or newer. It needs no Firebase project and no service account.

```bash
npm run emulator                              # terminal 1: Firestore on localhost:8080
# .env: FIRESTORE_EMULATOR_HOST=localhost:8080 and FIREBASE_PROJECT_ID=demo-priceradar
npm run dev                                   # terminal 2
```

## Development

```bash
npm run dev
```

This starts two processes:

- **Vite** on http://localhost:5173 with hot module reload for the React app (shop, product page and admin panel).
  It forwards `/api` requests to the Express server.
- **Express API** on http://localhost:3000, restarted automatically when server files change.

Use http://localhost:5173 while developing. Use port 3000 for the production build.

### Production build

```bash
npm run build               # outputs to dist/
npm start                   # serves dist/ and the API on PORT (default 3000)
```

Scraping starts automatically once a schedule exists. Create one in **Schedules**, or use **Run a scrape now** on the dashboard.

On a server without a display, keep `HEADLESS=true`. Linux containers need `--no-sandbox`, which the scraper already passes.

## Testing

Two optional scripts check the whole app. They create data, so run them against the emulator or a test project,
not your production database. They remove what they create when they finish.

```bash
# terminal 1: the server, with a short scheduler tick so the scheduled-run check is quick
SCHEDULER_TICK_MS=1000 npm start
# terminal 2: a fake store that copies Jumia's markup, on port 8088
npm run fixture
# terminal 3: 42 checks through the API (scrape, pagination, price history, filters, moderation, CSV, failures)
ADMIN_PASSWORD=your-password npm run test:e2e
```

## Project layout

```
client/                     React frontend (root of the Vite project)
  index.html                Single HTML shell, mounts #root
  src/
    main.jsx                Entry: router, toasts, saved theme
    App.jsx                 All routes (shop, product, admin, not found)
    pages/ShopPage.jsx      Shop: filters live in the URL query string
    pages/ProductPage.jsx   Product detail with price chart
    pages/NotFound.jsx
    admin/AdminShell.jsx    Login gate, sidebar layout, scheduler status
    admin/AdminContext.jsx  Session, API wrapper (401 handling), lookups, 8 s scheduler poll
    admin/*Page.jsx         Dashboard, Schedules, Stores, Categories, Products, Run history
    admin/dialogs.jsx       Store, category and schedule forms
    components/             Toasts and shared UI (theme toggle, stars, image fallback)
    lib/                    API client, formatting, theme, data hooks
    styles/app.css          Design system (light and dark)
vite.config.js              Vite root, build output, dev proxy to the API
server/
  index.js                  Express app, serves dist/, error handling, startup
  config.js                 Environment settings
  scheduler.js              Interval scheduler and single-file job queue
  lib/firebase.js           Firebase Admin connection (credentials, emulator)
  lib/collections.js        Firestore collection references
  lib/docs.js               Batched writes, bulk reads, undefined-safe data
  lib/query.js              Product listing: Firestore queries, in-memory filters, CSV export
  lib/bootstrap.js          First-run seed data and recovery of interrupted runs
  lib/auth.js               Admin login and session cookie
  lib/parse.js              Price, rating and URL cleaning helpers, document IDs
  routes/public.js          Public read API
  routes/admin.js           Admin API (stores, categories, schedules, products, runs, export)
  scraper/presets.js        Built-in store presets (Jumia Kenya, custom)
  scraper/browser.js        Puppeteer launch, request blocking, auto scroll
  scraper/extract.js        Selector-driven extraction that runs in the page
  scraper/runner.js         Pagination, normalising, saving, price history, run logging
scripts/
  fixture-store.mjs         Fake store for testing (port 8088)
  e2e.mjs                   End-to-end checks (npm run test:e2e)
firebase.json               Firebase config: rules, indexes, emulator port
firestore.indexes.json      Composite indexes for the product queries
firestore.rules             Denies all direct client access (the server uses the Admin SDK)
dist/                       Production build (generated by npm run build)
```

## Database

Firestore collections:

| Path | What it holds |
| --- | --- |
| `sources/{slug}` | A store: name, base URL, search URL template, currency, CSS selectors, enabled |
| `categories/{slug}` | A product group: name, emoji, search term |
| `schedules/{source}__{category}` | How often a store and category are scraped, plus the last run |
| `products/{source}_{hash}` | One product. Store and category fields are copied in so the shop needs one query |
| `products/{id}/priceHistory/{auto}` | A row when a product is first seen and whenever its price or old price changes |
| `scrapeRuns/{auto}` | One scrape: status, counts, duration, error and the full log |

- A product's ID is its store slug plus a hash of its cleaned URL, so re-scraping updates it instead of duplicating it.
- A schedule's ID is its store and category, so each pair can have only one schedule.
- `visible` is true when the product is not hidden and its store is enabled. The shop filters on it.
  Changing a store or hiding a product keeps `visible` in step.
- Categories a product belongs to are listed in `categorySlugs`. Products are never deleted when a category is,
  they just lose that category.
- Deleting a store deletes its products (with their price history) and schedules. Run history is kept.

### Searching and filtering

Firestore has no `LIKE` search, so free-text search and some filters run in memory. A search reads products in
pages of 200, up to `SEARCH_SCAN_LIMIT` (default 1000). When the scan cap is reached, the shop shows a range
instead of an exact total and asks the visitor to narrow the search. Filters that Firestore can run directly
(category, store, sort by price, rating or discount, and the price range when sorting by price) are fast.

Each product read costs money on Firestore, so a broad search over a large catalogue costs more than a category page.
Keep an eye on the usage in the Firebase console, and lower `SEARCH_SCAN_LIMIT` if needed.

### Exporting for the ecommerce project

Use the CSV export in the admin Products page (it respects the current filters), or read the `products`
collection directly with the Admin SDK or a Firestore export (`gcloud firestore export`).

## Adding another store

1. Open **Stores**, then **Add store** and choose "Custom site".
2. Enter the base URL and a search URL template. Use `{query}` for the search term and `{page}` for the page number.
   Example: `https://www.example.com/search?q={query}&page={page}`
3. In Chrome, right-click a product card, choose **Inspect**, and copy a selector for each field.
   The product card and product name are required. Leave the other fields blank if the site does not show them.
4. Create a schedule for that store and a category.

The store's ID is made from its name when it is created and does not change after that.
Store selectors change when a site is redesigned. If a run fails with "No products found", update the selectors.

## Responsible scraping

Check each store's terms of service and `robots.txt` before scraping, and only collect what you are allowed to use.
The defaults are conservative: one browser at a time, a delay between pages (`PAGE_DELAY_MS`), a minimum
interval of 5 minutes, and images, fonts and CSS blocked to reduce load. Keep intervals reasonable.

## Production notes

- Set a strong `ADMIN_PASSWORD`, and set `COOKIE_SECURE=true` behind HTTPS.
- Sessions are kept in memory, so signing in again is needed after a restart. Add a shared session store if you run several instances.
- Only one instance should run the scheduler. Firestore lets several instances share data, but each one with
  `AUTO_START_SCHEDULER=true` would queue the same scrapes. Set it to `false` on all but one.
- Scheduled jobs and the admin's manual runs share one queue inside a process. Use one server process for scraping.
- Back up the database with Firestore's scheduled backups or `gcloud firestore export`.
- `npm start` runs the Vite build first, so the server always serves the current frontend.
- Firestore security rules block direct browser access. Keep the service account file out of git and out of logs.
#   p r i c e r a d a r  
 