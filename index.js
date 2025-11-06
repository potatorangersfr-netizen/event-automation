// ==============================================
// FIXED EVENT SCRAPERS - ES MODULE VERSION
// ==============================================

import puppeteer from 'puppeteer';
import axios from 'axios';
import { load } from 'cheerio';
import Parser from 'rss-parser';

const rssParser = new Parser();

// ==============================================
// 1. DEVPOST - RSS FEED (100% RELIABLE)
// ==============================================
export async function scrapeDevpost() {
  try {
    console.log('📡 Fetching Devpost RSS...');
    const feed = await rssParser.parseURL('https://devpost.com/api/hackathons');

    const events = feed.items.slice(0, 20).map(item => ({
      website: 'Devpost',
      event_name: item.title,
      event_link: item.link,
      description: item.contentSnippet?.substring(0, 200) || '',
      start_date: item.pubDate ? new Date(item.pubDate).toISOString().split('T')[0] : null,
      location: 'Online',
      tags: ['Hackathon'],
      source: 'rss'
    }));

    console.log(`✅ Devpost: ${events.length} events found`);
    return events;
  } catch (error) {
    console.error('❌ Devpost RSS failed, trying alternative...');

    // Fallback: Try public API
    try {
      const { data } = await axios.get('https://devpost.com/api/hackathons', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });

      const events = data.hackathons?.slice(0, 20).map(h => ({
        website: 'Devpost',
        event_name: h.title,
        event_link: h.url,
        start_date: h.submission_period_dates?.split(' - ')[0] || null,
        location: h.location || 'Online',
        tags: ['Hackathon']
      })) || [];

      console.log(`✅ Devpost API: ${events.length} events found`);
      return events;
    } catch (apiError) {
      console.error('❌ Devpost: All methods failed');
      return [];
    }
  }
}

// ==============================================
// 2. UNSTOP (formerly Dare2Compete)
// ==============================================
export async function scrapeUnstop() {
  try {
    console.log('📡 Fetching Unstop...');
    const { data } = await axios.get('https://unstop.com/api/public/opportunity/search-result', {
      params: {
        opportunity: 'hackathons',
        page: 1,
        per_page: 20,
        type: 'hackathons'
      },
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'Referer': 'https://unstop.com/hackathons'
      }
    });

    const events = data.data?.data?.map(h => ({
      website: 'Unstop',
      event_name: h.title,
      event_link: `https://unstop.com${h.public_url}`,
      start_date: h.start_date || null,
      end_date: h.end_date || null,
      location: h.organisation?.name || 'Various',
      tags: ['Hackathon', h.type],
      prize: h.prize_money || null
    })) || [];

    console.log(`✅ Unstop: ${events.length} events found`);
    return events;
  } catch (error) {
    console.error('❌ Unstop failed:', error.message);
    return [];
  }
}

// ==============================================
// 3. DORAHACKS - GraphQL API
// ==============================================
export async function scrapeDorahacks() {
  try {
    console.log('📡 Fetching Dorahacks...');
    const { data } = await axios.post(
      'https://api.dorahacks.io/graphql',
      {
        query: `
          query {
            bountiesList(first: 20, filter: {status: "active"}) {
              edges {
                node {
                  id
                  title
                  slug
                  description
                  startTime
                  endTime
                  totalReward
                }
              }
            }
          }
        `
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      }
    );

    const bounties = data.data?.bountiesList?.edges || [];
    const events = bounties.map(({ node }) => ({
      website: 'Dorahacks',
      event_name: node.title,
      event_link: `https://dorahacks.io/buidl/${node.slug}`,
      description: node.description?.substring(0, 200),
      start_date: node.startTime ? new Date(node.startTime).toISOString().split('T')[0] : null,
      end_date: node.endTime ? new Date(node.endTime).toISOString().split('T')[0] : null,
      location: 'Online',
      tags: ['Hackathon', 'Web3'],
      prize: node.totalReward
    }));

    console.log(`✅ Dorahacks: ${events.length} events found`);
    return events;
  } catch (error) {
    console.error('❌ Dorahacks failed:', error.message);
    return [];
  }
}

// ==============================================
// 4. DEVFOLIO - Puppeteer (RELIABLE METHOD)
// ==============================================
async function scrapeDevfolio() {
  let browser;
  try {
    console.log('📡 Launching browser for Devfolio...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const page = await browser.newPage();

    // Set realistic browser context
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1920, height: 1080 });

    console.log('🌐 Navigating to Devfolio...');
    await page.goto('https://devfolio.co/hackathons', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for content to load using a selector instead of waitForTimeout
    await page.waitForSelector('h1, h2, h3, [class*="title"]', { timeout: 10000 });

    const events = await page.evaluate(() => {
      const results = [];

      const selectors = [
        'div[class*="HackathonCard"]',
        'article[class*="hackathon"]',
        'div[data-testid*="hackathon"]',
        '.hackathon-card',
        '[class*="card"]'
      ];

      let cards = [];
      for (const selector of selectors) {
        cards = document.querySelectorAll(selector);
        if (cards.length > 0) break;
      }

      cards.forEach((card, index) => {
        if (index >= 20) return; // Limit to 20 events

        const titleEl = card.querySelector('h3, h2, h1, [class*="title"], [class*="name"]');
        const linkEl = card.querySelector('a');
        const dateEl = card.querySelector('time, [class*="date"], [class*="Date"]');
        const locationEl = card.querySelector('[class*="location"], [class*="Location"]');

        if (titleEl) {
          results.push({
            event_name: titleEl.innerText.trim(),
            event_link: linkEl ? linkEl.href : null,
            start_date: dateEl ? dateEl.innerText.trim() : null,
            location: locationEl ? locationEl.innerText.trim() : 'Check website'
          });
        }
      });

      return results;
    });

    const formattedEvents = events.map(e => ({
      website: 'Devfolio',
      ...e,
      tags: ['Hackathon']
    }));

    console.log(`✅ Devfolio: ${formattedEvents.length} events found`);
    return formattedEvents;

  } catch (error) {
    console.error('❌ Devfolio failed:', error.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

// ==============================================
// 5. HACKEREARTH
// ==============================================
export async function scrapeHackerEarth() {
  try {
    console.log('📡 Fetching HackerEarth...');
    const { data } = await axios.get('https://www.hackerearth.com/chrome-extension/events/', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });

    const events = data.response?.slice(0, 20).map(e => ({
      website: 'HackerEarth',
      event_name: e.title,
      event_link: e.url,
      start_date: e.start_tz ? new Date(e.start_tz).toISOString().split('T')[0] : null,
      end_date: e.end_tz ? new Date(e.end_tz).toISOString().split('T')[0] : null,
      location: 'Online',
      tags: ['Coding', 'Competition']
    })) || [];

    console.log(`✅ HackerEarth: ${events.length} events found`);
    return events;
  } catch (error) {
    console.error('❌ HackerEarth failed:', error.message);
    return [];
  }
}

// ==============================================
// 6. MLHUB
// ==============================================
export async function getMLHEvents() {
  console.log('📡 Fetching MLH...');
  try {
    const { data } = await axios.get('https://mlh.io/seasons/2025/events', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' }
    });

    const $ = load(data);
    const events = [];

    $('.event').each((i, elem) => {
      if (i >= 20) return;
      const title = $(elem).find('h3, .event-name').text().trim();
      const link = $(elem).find('a').attr('href');
      const date = $(elem).find('.event-date, time').text().trim();
      const location = $(elem).find('.event-location').text().trim();

      if (title) {
        events.push({
          website: 'MLH',
          event_name: title,
          event_link: link ? `https://mlh.io${link}` : null,
          start_date: date,
          location: location || 'Various',
          tags: ['Hackathon', 'Student']
        });
      }
    });

    console.log(`✅ MLH: ${events.length} events found`);
    return events;
  } catch (error) {
    console.error('❌ MLH scraping failed:', error.message);
    return [];
  }
}

// ==============================================
// MAIN AGGREGATOR
// ==============================================
export async function getAllEvents() {
  console.log('\n🚀 ===== STARTING EVENT AGGREGATION =====\n');
  const startTime = Date.now();

  const results = await Promise.allSettled([
    scrapeDevpost(),
    scrapeUnstop(),
    scrapeDorahacks(),
    scrapeDevfolio(),
    scrapeHackerEarth(),
    getMLHEvents()
  ]);

  let allEvents = [];
  const stats = { success: 0, failed: 0 };
  const sources = ['Devpost', 'Unstop', 'Dorahacks', 'Devfolio', 'HackerEarth', 'MLH'];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      console.log(`✅ ${sources[index]}: ${result.value.length} events`);
      allEvents = allEvents.concat(result.value);
      stats.success++;
    } else {
      console.log(`⚠️  ${sources[index]}: No events (${result.reason || 'unknown error'})`);
      stats.failed++;
    }
  });

  // Remove duplicates
  const uniqueEvents = [];
  const seenTitles = new Set();
  allEvents.forEach(event => {
    const normalizedTitle = event.event_name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!seenTitles.has(normalizedTitle)) {
      seenTitles.add(normalizedTitle);
      uniqueEvents.push(event);
    }
  });

  // Sort by date
  uniqueEvents.sort((a, b) => {
    if (!a.start_date) return 1;
    if (!b.start_date) return -1;
    return new Date(a.start_date) - new Date(b.start_date);
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n📊 ===== SUMMARY =====`);
  console.log(`✅ Successful sources: ${stats.success}/6`);
  console.log(`❌ Failed sources: ${stats.failed}/6`);
  console.log(`📋 Total events: ${allEvents.length}`);
  console.log(`🎯 Unique events: ${uniqueEvents.length}`);
  console.log(`⏱️  Time taken: ${duration}s`);
  console.log(`======================\n`);

  return uniqueEvents;
}

// ==============================================
// TESTING FUNCTION
// ==============================================
export async function testScrapers() {
  console.log('🧪 TESTING INDIVIDUAL SCRAPERS\n');

  const tests = [
    { name: 'Devpost', fn: scrapeDevpost },
    { name: 'Unstop', fn: scrapeUnstop },
    { name: 'Dorahacks', fn: scrapeDorahacks },
    { name: 'Devfolio', fn: scrapeDevfolio },
    { name: 'HackerEarth', fn: scrapeHackerEarth },
    { name: 'MLH', fn: getMLHEvents }
  ];

  for (const test of tests) {
    console.log(`\n--- Testing ${test.name} ---`);
    try {
      const events = await test.fn();
      console.log(`✅ ${test.name}: ${events.length} events`);
      if (events.length > 0) console.log('Sample event:', events[0].event_name);
    } catch (error) {
      console.log(`❌ ${test.name}: ${error.message}`);
    }
  }
}

// ==============================================
// RUN DIRECTLY
// ==============================================
if (process.argv[1].endsWith('index.js')) {
  getAllEvents().then(events => {
    console.log('\n✨ Sample events:');
    events.slice(0, 3).forEach(e => console.log(`- ${e.event_name} (${e.website})`));
  });
}
