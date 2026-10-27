import puppeteer from 'puppeteer';
import { config } from '../config.js';

const BLOCKED_RESOURCES = new Set(['image', 'stylesheet', 'font', 'media']);
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export function launchBrowser() {
  return puppeteer.launch({
    headless: config.headless,
    executablePath: config.chromePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

/** New page with lighter loading: images, fonts, CSS and media are blocked. */
export async function openPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  await page.setViewport({ width: 1366, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (BLOCKED_RESOURCES.has(req.resourceType())) req.abort();
    else req.continue();
  });
  return page;
}

/** Scrolls down so lazy-loaded product cards render. Bounded so it cannot loop forever. */
export async function autoScroll(page, maxSteps = 60) {
  await page.evaluate(async (steps) => {
    for (let i = 0; i < steps; i++) {
      window.scrollBy(0, 400);
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight) break;
    }
  }, maxSteps);
  await new Promise((resolve) => setTimeout(resolve, 800));
}
