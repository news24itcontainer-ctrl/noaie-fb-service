const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
const PORT = process.env.PORT || 8080;

app.get("/", (_req, res) => {
  res.send("FB Scraper OK");
});

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
    await new Promise(r => setTimeout(r, 4000));

    const posts = await page.evaluate(() => {
      const elements = document.querySelectorAll("div[role='article']");
      const data = [];

      elements.forEach(el => {
        const text = (el.innerText || "").trim();
        if (text) data.push(text.substring(0, 500));
      });

      return data.slice(0, 10);
    });

    await browser.close();

    res.json({ posts });
  } catch (err) {
    if (browser) await browser.close();
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
