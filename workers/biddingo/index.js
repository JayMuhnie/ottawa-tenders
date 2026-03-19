// Cloudflare Worker: Biddingo scraper
// Scrapes City of Kingston and Township of South Frontenac from biddingo.com

import { BIDDINGO_SOURCES } from '../shared/municipalities.js';
import { classifyTender } from '../shared/keywords.js';

const KV_KEY = 'tenders:biddingo';
const BIDDINGO_BASE = 'https://www.biddingo.com';

async function scrapeBiddingo(source) {
  const url = `${BIDDINGO_BASE}/${source.path}`;

  let html;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TenderBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      cf: { cacheTtl: 3600 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.error(`[biddingo] Failed to fetch ${source.name}: ${err.message}`);
    return [];
  }

  return parseBiddingoHTML(html, source);
}

function parseBiddingoHTML(html, source) {
  const tenders = [];
  const now = new Date();

  // Biddingo uses a consistent listing structure with bid-listing or tender-row classes
  const rowPattern = /<(?:div|tr)[^>]*class="[^"]*(?:bid-listing|tender-row|posting-row|list-item)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|tr)>/gi;
  const titlePattern = /<(?:a|h[1-6])[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/(?:a|h[1-6])>/i;
  const datePattern = /(?:clos(?:es?|ing)|due|deadline)[^\d]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+ \d{1,2},?\s*\d{4})/i;

  let match;
  let matched = false;

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
    if (closingDate && closingDate < now) continue;

    const fullUrl = href.startsWith('http') ? href : `${BIDDINGO_BASE}${href}`;
    const id = `${source.id}-${slugify(rawTitle)}`;
    const classification = classifyTender(rawTitle);

    tenders.push({
      id,
      title: rawTitle,
      municipality: source.name,
      municipalityId: source.id,
      platform: 'biddingo',
      url: fullUrl,
      closingDate: closingDate ? closingDate.toISOString() : null,
      scrapedAt: new Date().toISOString(),
      tier: classification.tier,
      matchedKeyword: classification.matchedKeyword,
      dismissed: false,
    });
  }

  // Fallback: any links on the page with tender-like text
  if (!matched || tenders.length === 0) {
    const linkPattern = /<a[^>]*href="(\/[^"]*(?:bid|tender|rfp|rft|rfq)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = linkPattern.exec(html)) !== null) {
      const href = match[1];
      const rawTitle = match[2].replace(/<[^>]+>/g, '').trim();
      if (!rawTitle || rawTitle.length < 5) continue;

      const fullUrl = `${BIDDINGO_BASE}${href}`;
      const id = `${source.id}-${slugify(rawTitle)}`;
      const classification = classifyTender(rawTitle);

      tenders.push({
        id,
        title: rawTitle,
        municipality: source.name,
        municipalityId: source.id,
        platform: 'biddingo',
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
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScrape(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/refresh') {
      ctx.waitUntil(runScrape(env));
      return new Response(JSON.stringify({ ok: true, message: 'Biddingo scrape triggered' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    if (url.pathname === '/tenders') {
      const data = await env.TENDERS_KV.get(KV_KEY, 'json');
      return new Response(JSON.stringify(data || []), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    return new Response('Ottawa Tenders — Biddingo worker', { status: 200 });
  },
};

async function runScrape(env) {
  console.log(`[biddingo] Starting scrape of ${BIDDINGO_SOURCES.length} sources`);
  const allTenders = [];

  for (const source of BIDDINGO_SOURCES) {
    console.log(`[biddingo] Scraping ${source.name}...`);
    const tenders = await scrapeBiddingo(source);
    console.log(`[biddingo] ${source.name}: ${tenders.length} tenders found`);
    allTenders.push(...tenders);
  }

  const existing = await env.TENDERS_KV.get(KV_KEY, 'json') || [];
  const existingMap = Object.fromEntries(existing.map(t => [t.id, t]));

  const merged = allTenders.map(t => ({
    ...t,
    dismissed: existingMap[t.id]?.dismissed ?? false,
  }));

  await env.TENDERS_KV.put(KV_KEY, JSON.stringify(merged), {
    expirationTtl: 60 * 60 * 24 * 7,
  });

  console.log(`[biddingo] Done. ${merged.length} total tenders stored.`);
}
