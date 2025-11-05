import axios from "axios";
import * as cheerio from "cheerio";
import Parser from "rss-parser";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;

// ---------- GOOGLE SHEETS SETUP ----------
async function getSheets() {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });
  return sheets;
}

// ---------- SCRAPER SOURCES ----------
const sources = [
  {
    name: "Devpost",
    url: "https://devpost.com/hackathons.atom",
    type: "rss"
  },
  {
    name: "Devfolio",
    url: "https://devfolio.co/hackathons",
    type: "html",
    selector: ".hackathon-card",
    title: ".hackathon-title",
    link: "a"
  },
  {
    name: "Kaggle",
    url: "https://www.kaggle.com/competitions",
    type: "html",
    selector: ".competition-item",
    title: ".competition-title",
    link: "a"
  }
];

// ---------- SCRAPER LOGIC ----------
async function scrapeEvents() {
  const parser = new Parser();
  const events = [];

  for (const src of sources) {
    try {
      console.log(`🛰️ Fetching from ${src.name}...`);
      if (src.type === "rss") {
        const feed = await parser.parseURL(src.url);
        feed.items.forEach((item) => {
          events.push({
            source: src.name,
            title: item.title,
            link: item.link
          });
        });
      } else if (src.type === "html") {
        const { data } = await axios.get(src.url);
        const $ = cheerio.load(data);
        $(src.selector).each((_, el) => {
          const title = $(el).find(src.title).text().trim();
          const link = $(el).find(src.link).attr("href");
          if (title && link) {
            events.push({
              source: src.name,
              title,
              link
            });
          }
        });
      }
    } catch (err) {
      console.error(`❌ Failed to scrape ${src.name}:`, err.message);
    }
  }

  console.log(`✅ Found ${events.length} events total.`);
  return events;
}

// ---------- GOOGLE SHEETS WRITE ----------
async function updateSheet(events) {
  const sheets = await getSheets();

  const rows = events.map((e) => [e.source, e.title, e.link, new Date().toISOString()]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "Events!A:D",
    valueInputOption: "RAW",
    requestBody: {
      values: rows
    }
  });

  console.log("📄 Google Sheet updated successfully!");
}

// ---------- TELEGRAM SEND ----------
async function sendToTelegram(events) {
  for (const event of events) {
    const text = `🎯 *${event.title}*\n📍 Source: ${event.source}\n🔗 [View Event](${event.link})`;
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHANNEL_ID,
        text,
        parse_mode: "Markdown"
      }
    );
  }
  console.log("📢 Posted all events to Telegram!");
}

// ---------- MAIN ----------
(async () => {
  const events = await scrapeEvents();
  if (events.length > 0) {
    await updateSheet(events);
    await sendToTelegram(events);
  } else {
    console.log("⚠️ No new events found.");
  }
})();
