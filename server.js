const express = require('express');
const { chromium } = require('playwright');

process.env.PLAYWRIGHT_BROWSERS_PATH = '0';

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || '';

function auth(req, res, next) {
  if (!API_KEY) return next();

  const headerKey = req.headers['x-api-key'];
  const queryKey = req.query.key;

  if (headerKey === API_KEY || queryKey === API_KEY) return next();

  return res.status(401).json({
    ok: false,
    error: 'Unauthorized'
  });
}

function normalizeFacebookUrl(input) {
  if (!input) return '';
  let url = String(input).trim();

  if (!/^https?:\/\//i.test(url)) {
    url = 'https://www.facebook.com/' + url.replace(/^@/, '');
  }

  return url;
}

async function scrapeFacebook(pageUrl) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 2000 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  try {
    await page.goto(pageUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 90000
    });

    await page.waitForTimeout(5000);

    try {
      const buttons = [
        'text=Allow all cookies',
        'text=Consenti tutti i cookie',
        'text=Accetta tutto',
        'text=Accept all',
        '[aria-label="Allow all cookies"]'
      ];

      for (const sel of buttons) {
        const el = page.locator(sel).first();
        if (await el.count()) {
          try {
            await el.click({ timeout: 1500 });
            await page.waitForTimeout(1000);
            break;
          } catch (_) {}
        }
      }
    } catch (_) {}

    await page.evaluate(async () => {
      for (let i = 0; i < 6; i++) {
        window.scrollBy(0, 1400);
        await new Promise((r) => setTimeout(r, 1500));
      }
    });

    await page.waitForTimeout(2500);

    const posts = await page.evaluate(() => {
      const out = [];
      const seen = new Set();

      const clean = (txt) =>
        (txt || '')
          .replace(/\s+/g, ' ')
          .replace(/\u00a0/g, ' ')
          .trim();

      const anchors = Array.from(document.querySelectorAll('a[href]'));

      for (const a of anchors) {
        const href = a.href || '';
        const articleLike =
          href.includes('/posts/') ||
          href.includes('/story.php') ||
          href.includes('/permalink.php') ||
          href.includes('/photo/?fbid=') ||
          href.includes('/videos/');

        if (!articleLike) continue;

        const container =
          a.closest('[role="article"]') ||
          a.closest('div[data-pagelet]') ||
          a.parentElement;

        if (!container) continue;

        const text = clean(container.innerText || '');
        if (!text) continue;
        if (text.length < 40) continue;

        const key = text.slice(0, 180);
        if (seen.has(key)) continue;
        seen.add(key);

        out.push({
          text,
          url: href
        });

        if (out.length >= 10) break;
      }

      if (!out.length) {
        const articles = Array.from(document.querySelectorAll('[role="article"]'));
        for (const el of articles) {
          const text = clean(el.innerText || '');
          if (!text) continue;
          if (text.length < 40) continue;

          const a = el.querySelector('a[href*="/posts/"], a[href*="/story.php"], a[href*="/permalink.php"], a[href*="/videos/"], a[href*="/photo/?fbid="]');
          const href = a ? a.href : '';

          const key = text.slice(0, 180);
          if (seen.has(key)) continue;
          seen.add(key);

          out.push({
            text,
            url: href
          });

          if (out.length >= 10) break;
        }
      }

      return out;
    });

    const normalized = posts.map((p) => ({
      text: String(p.text || '').trim(),
      url: String(p.url || '').trim() || pageUrl
    }));

    return {
      ok: true,
      data: {
        posts: normalized
      }
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'fb-scraper'
  });
});

app.get('/scrape', auth, async (req, res) => {
  try {
    const inputUrl = normalizeFacebookUrl(req.query.url);

    if (!inputUrl) {
      return res.status(400).json({
        ok: false,
        error: 'Missing url parameter'
      });
    }

    const result = await scrapeFacebook(inputUrl);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message,
      stack: err.stack
    });
  }
});

app.listen(PORT, () => {
  console.log(`fb-scraper listening on ${PORT}`);
});
