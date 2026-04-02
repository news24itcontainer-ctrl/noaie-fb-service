const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
const PORT = process.env.PORT || 8080;

app.get("/", (_req, res) => {
  res.send("FB Scraper OK");
});

app.post("/health", (_req, res) => {
  res.json({ ok: true, service: "fb-scraper" });
});

function cleanText(text) {
  if (!text) return "";
  return text
    .replace(/\bLike\b/gi, "")
    .replace(/\bComment\b/gi, "")
    .replace(/\bShare\b/gi, "")
    .replace(/\bAll reactions:?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

app.get("/scrape", async (req, res) => {
  const pageUrl = req.query.url;

  if (!pageUrl) {
    return res.status(400).json({ error: "Missing url" });
  }

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.goto(pageUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));

    const posts = await page.evaluate(() => {
      const results = [];

      const candidates = [
        ...document.querySelectorAll("div[role='article']"),
        ...document.querySelectorAll('[data-pagelet*="FeedUnit"]'),
        ...document.querySelectorAll("div.x1lliihq")
      ];

      for (const el of candidates) {
        let text = (el.innerText || "").trim();
        if (!text) continue;

        text = text
          .replace(/\bLike\b/gi, "")
          .replace(/\bComment\b/gi, "")
          .replace(/\bShare\b/gi, "")
          .replace(/\bAll reactions:?\b/gi, "")
          .replace(/\s+/g, " ")
          .trim();

        if (text.length < 80) continue;
        if (results.includes(text)) continue;

        results.push(text);
        if (results.length >= 10) break;
      }

      return results;
    });

    const cleaned = posts
      .map(cleanText)
      .filter(Boolean)
      .filter(t => t.length >= 80);

    await browser.close();

    res.json({ posts: cleaned });
  } catch (err) {
    if (browser) await browser.close();
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
