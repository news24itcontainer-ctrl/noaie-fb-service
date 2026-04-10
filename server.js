
const express = require("express");
const { chromium } = require("playwright");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3005;
const API_KEY = process.env.NOAIE_FB_API_KEY || "";

function auth(req, res, next) {
  if (!API_KEY) return next();
  const incoming = req.header("X-NOAIE-API-Key") || req.query.api_key || "";
  if (incoming !== API_KEY) return res.status(401).json({ ok: false, error: "Unauthorized" });
  next();
}

app.get('/health', auth, (_req, res) => {
  res.json({ ok: true, service: 'fb-scraper', version: '4.6.2-permalink' });
});

async function scrapeFacebook(url, limit) {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled','--no-sandbox','--disable-dev-shm-usage']
    });
    const context = await browser.newContext({
      viewport: { width: 1400, height: 1800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'it-IT'
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4500);

    const html = await page.content();
    const blocked = /login|accedi|registrati|crea nuovo account|checkpoint/i.test(html) && /facebook/i.test(html);
    if (blocked) {
      return { ok: true, blocked: true, posts: [], debug: 'Facebook mostra login wall o contenuto bloccato' };
    }

    const result = await page.evaluate((maxItems) => {
      const out = [];
      const seen = new Set();
      const normalizeHref = (href) => {
        if (!href) return '';
        try {
          const u = new URL(href, location.origin);
          if (u.hostname.includes('m.facebook.com')) u.hostname = 'www.facebook.com';
          if (u.hostname.includes('facebook.com')) {
            u.searchParams.delete('__cft__');
            u.searchParams.delete('__tn__');
            u.searchParams.delete('comment_id');
            u.searchParams.delete('reply_comment_id');
            u.hash = '';
          }
          return u.toString();
        } catch (e) {
          return href;
        }
      };

      const anchors = Array.from(document.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"], a[href*="/story.php"], a[href*="/reel/"]'));
      for (const a of anchors) {
        const href = normalizeHref(a.href || '');
        if (!href || seen.has(href)) continue;
        seen.add(href);

        let text = '';
        let container = a.closest('[role="article"], div[data-ad-preview="message"], div[aria-posinset]');
        if (container) text = (container.innerText || '').trim();
        if (!text) text = (a.innerText || '').trim();
        text = text.replace(/\s+/g, ' ');
        if (!text) continue;

        out.push({ text, url: href });
        if (out.length >= maxItems) break;
      }
      return out;
    }, limit);

    return { ok: true, blocked: false, posts: result, raw_count: result.length, fetched_url: url };
  } finally {
    if (browser) await browser.close();
  }
}

app.get('/scrape', auth, async (req, res) => {
  const url = String(req.query.url || '').trim();
  const limit = Math.max(1, Math.min(20, Number(req.query.limit || 10)));
  if (!url) return res.status(400).json({ ok: false, error: 'Missing url' });
  try {
    const data = await scrapeFacebook(url, limit);
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Unknown error', stack: err.stack || '' });
  }
});

app.post('/scrape', auth, async (req, res) => {
  const url = String(req.body?.url || '').trim();
  const limit = Math.max(1, Math.min(20, Number(req.body?.limit || 10)));
  if (!url) return res.status(400).json({ ok: false, error: 'Missing url' });
  try {
    const data = await scrapeFacebook(url, limit);
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Unknown error', stack: err.stack || '' });
  }
});

app.listen(PORT, () => console.log(`fb-scraper listening on :${PORT}`));
