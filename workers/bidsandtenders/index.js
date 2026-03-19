// Cloudflare Worker: bids&tenders.ca scraper
// Runs daily at 6:00 AM ET, scrapes all configured bidsandtenders subdomains
// Writes results to Cloudflare KV under key: tenders:bidsandtenders

import { BIDSANDTENDERS_SOURCES } from '../shared/municipalities.js';
import { classifyTender } from '../shared/keywords.js';

const KV_KEY = 'tenders:bidsandtenders';
const BASE_URL = 'bidsandtenders.ca';

// Fetch and parse one bids&tenders subdomain
async function scrapeBidsAndTenders(source) {
  const url = `https://${source.subdomain}.${BASE_URL}/Login.aspx?ReturnUrl=%2fBids%2fBidsList%2f`;
  const listUrl = `https://${source.subdomain}.${BASE_URL}/Bids/BidsList/`;

  let html;
  try {
    const res = await fetch(listUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TenderBot/1.0; +https://github.com/your-repo)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      cf: { cacheTtl: 3600 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.error(`[bidsandtenders] Failed to fetch ${source.name}: ${err.message}`);
    return [];
  }

  return parseBidsAndTendersHTML(html, source);
}

function parseBidsAndTendersHTML(html, source) {
  const tenders = [];
  const now = new Date();

  // Match bid rows — bids&tenders uses a consistent table structure
  // Pattern: extract bid number, title, closing date from table rows
  const rowPattern = /<tr[^>]*class="[^"]*BidRow[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  const titlePattern = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i;
  const datePattern = /(\d{1,2}\/\d{1,2}\/\d{4}|\w+ \d{1,2},?\s*\d{4})/i;
  const bidNumPattern = /BidID=(\d+)/i;

  // Also try alternate structure for public bid listings
  const altPattern = /<div[^>]*class="[^"]*bid-item[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;

  let matched = false;
  let match;

  while ((match = rowPattern.exec(html)) !== null) {
    matched = true;
    const row = match[1];

    const titleMatch = titlePattern.exec(row);
    if (!titleMatch) continue;

    const href = titleMatch[1];
    const rawTitle = titleMatch[2].replace(/<[^>]+>/g, '').trim();
    if (!rawTitle || rawTitle.length < 3) continue;

    const dateMatch = datePattern.exec(row);
    const closingDate = dateMatch ? parseDate(dateMatch[1]) : null;

    // Skip already-closed tenders
    if (closingDate && closingDate < now) continue;

    const bidNumMatch = bidNumPattern.exec(href);
    const id = bidNumMatch
      ? `${source.id}-${bidNumMatch[1]}`
      : `${source.id}-${slugify(rawTitle)}`;

    const fullUrl = href.startsWith('http')
      ? href
      : `https://${source.subdomain}.${BASE_URL}${href}`;

    const classification = classifyTender(rawTitle);

    tenders.push({
      id,
      title: rawTitle,
      municipality: source.name,
      municipalityId: source.id,
      platform: 'bidsandtenders',
      url: fullUrl,
      closingDate: closingDate ? closingDate.toISOString() : null,
      scrapedAt: new Date().toISOString(),
      tier: classification.tier,
      matchedKeyword: classification.matchedKeyword,
      dismissed: false,
    });
  }

  // Fallback: scrape any anchor tags with bid-related text if table parse failed
  if (!matched || tenders.length === 0) {
    const linkPattern = /<a[^>]*href="([^"]*(?:BidID|bid|tender)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = linkPattern.exec(html)) !== null) {
      const href = match[1];
      const rawTitle = match[2].replace(/<[^>]+>/g, '').trim();
      if (!rawTitle || rawTitle.length < 5) continue;

      const classification = classifyTender(rawTitle);
      const id = `${source.id}-${slugify(rawTitle)}`;

      const fullUrl = href.startsWith('http')
        ? href
        : `https://${source.subdomain}.${BASE_URL}${href}`;

      tenders.push({
        id,
        title: rawTitle,
        municipality: source.name,
        municipalityId: source.id,
        platform: 'bidsandtenders',
        url: fullUrl,
        closingDate: null,
        scrapedAt: new Date().toISOString(),
        tier: classification.tier,
        matchedKeyword: classification.matchedKeyword,
        dismissed: false,
      });
    }
  }

  return tenders;
}

function parseDate(str) {
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
    return null;
  } catch {
    return null;
  }
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
}

// Main worker handler
export default {
  // Scheduled: runs on cron
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScrape(env));
  },

  // HTTP: allows manual trigger from dashboard via GET /refresh
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/refresh') {
      ctx.waitUntil(runScrape(env));
      return new Response(JSON.stringify({ ok: true, message: 'Bids&Tenders scrape triggered' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    if (url.pathname === '/tenders') {
      const data = await env.TENDERS_KV.get(KV_KEY, 'json');
      return new Response(JSON.stringify(data || []), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    return new Response('Ottawa Tenders — bids&tenders worker', { status: 200 });
  },
};

async function runScrape(env) {
  console.log(`[bidsandtenders] Starting scrape of ${BIDSANDTENDERS_SOURCES.length} sources`);

  const allTenders = [];

  for (const source of BIDSANDTENDERS_SOURCES) {
    console.log(`[bidsandtenders] Scraping ${source.name}...`);
    const tenders = await scrapeBidsAndTenders(source);
    console.log(`[bidsandtenders] ${source.name}: ${tenders.length} active tenders found`);
    allTenders.push(...tenders);
  }

  // Merge with existing data to preserve dismissed flags set by user
  const existing = await env.TENDERS_KV.get(KV_KEY, 'json') || [];
  const existingMap = Object.fromEntries(existing.map(t => [t.id, t]));

  const merged = allTenders.map(t => ({
    ...t,
    dismissed: existingMap[t.id]?.dismissed ?? false,
  }));

  await env.TENDERS_KV.put(KV_KEY, JSON.stringify(merged), {
    expirationTtl: 60 * 60 * 24 * 7, // 7 days
  });

  console.log(`[bidsandtenders] Done. ${merged.length} total tenders stored.`);
}
