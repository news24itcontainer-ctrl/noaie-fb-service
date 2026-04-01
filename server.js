const express = require("express");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

const app = express();
const PORT = process.env.PORT || 8080;

app.get("/", (req, res) => {
  res.send("FB Scraper OK");
});

app.get("/scrape", async (req, res) => {
  const pageUrl = req.query.url;

  if (!pageUrl) {
    return res.status(400).json({ error: "Missing url" });
  }

  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true
    });

    const page = await browser.newPage();
    await page.goto(pageUrl, { waitUntil: "networkidle2" });

    await new Promise(r => setTimeout(r, 4000));

    const posts = await page.evaluate(() => {
      const articles = document.querySelectorAll("div[role='article']");
      const results = [];

      articles.forEach(el => {
        const text = el.innerText;
        if (text) {
          results.push(text.substring(0, 300));
        }
      });

      return results.slice(0, 10);
    });

    await browser.close();

    res.json({ posts });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
