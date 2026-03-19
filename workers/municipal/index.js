// Cloudflare Worker: individual municipal website scraper
// Scrapes all municipalities that post tenders directly on their own websites

import { MUNICIPAL_SOURCES } from '../shared/municipalities.js';
import { classifyTender } from '../shared/keywords.js';

const KV_KEY = 'tenders:municipal';

async function scrapeMunicipal(source) {
  let html;
  try {
    const res = await fetch(source.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TenderBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      cf: { cacheTtl: 3600 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.error(`[municipal] Failed to fetch ${source.name}: ${err.message}`);
    return [];
  }

  return parseMunicipalHTML(html, source);
}

function parseMunicipalHTML(html, source) {
  const tenders = [];
  const now = new Date();
  const seen = new Set();

  // Strategy 1: look for common tender listing patterns
  // Most Ontario municipal sites use similar CMS structures (Drupal, Squiz, Kentico)

  // Pattern: list items or divs containing links to PDF/page with tender keywords in URL or text
  const tenderTerms = [
    'tender', 'rfp', 'rfq', 'rft', 'request for proposal', 'request for quotation',
    'request for tender', 'bid', 'solicitation', 'contract opportunity',
    'consulting', 'engineering', 'study', 'plan',
  ];

  // Extract all anchor tags
  const linkPattern = /<a[^>]*href="([^"#][^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1];
    const rawText = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

    if (!rawText || rawText.length < 5 || rawText.length > 300) continue;

    // Check if the link text or URL contains tender-related terms
    const combined = (rawText + ' ' + href).toLowerCase();
    const isTenderLink = tenderTerms.some(term => combined.includes(term));

    // Skip nav links, generic buttons, etc.
    const skipTerms = ['home', 'contact', 'login', 'search', 'menu', 'facebook', 'twitter',
      'linkedin', 'youtube', 'instagram', 'privacy', 'accessibility', 'sitemap',
      'copyright', 'terms', 'newsletter', 'subscribe', 'careers', 'jobs'];
    const isNav = skipTerms.some(term => combined.includes(term));

    if (!isTenderLink || isNav) continue;

    // Build full URL
    let fullUrl;
    if (href.startsWith('http')) {
      fullUrl = href;
    } else if (href.startsWith('/')) {
      fullUrl = `${source.linkBase}${href}`;
    } else {
      fullUrl = `${source.linkBase}/${href}`;
    }

    const id = `${source.id}-${slugify(rawText)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    // Try to extract a closing date from surrounding context
    // Get 200 chars around the match
    const contextStart = Math.max(0, match.index - 200);
    const contextEnd = Math.min(html.length, match.index + match[0].length + 200);
    const context = html.slice(contextStart, contextEnd);
    const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+\.?\s+\d{1,2},?\s*\d{4})/g;
    let closingDate = null;
    let dateMatch;
    while ((dateMatch = datePattern.exec(context)) !== null) {
      const d = parseDate(dateMatch[1]);
      if (d && d > now) {
        closingDate = d;
        break;
      }
    }

    const classification = classifyTender(rawText);

    tenders.push({
      id,
      title: rawText,
      municipality: source.name,
      municipalityId: source.id,
      platform: 'municipal',
      url: fullUrl,
      closingDate: closingDate ? closingDate.toISOString() : null,
      scrapedAt: new Date().toISOString(),
      tier: classification.tier,
      matchedKeyword: classification.matchedKeyword,
      dismissed: false,
    });
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
      return new Response(JSON.stringify({ ok: true, message: 'Municipal scrape triggered' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    if (url.pathname === '/tenders') {
      const data = await env.TENDERS_KV.get(KV_KEY, 'json');
      return new Response(JSON.stringify(data || []), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    return new Response('Ottawa Tenders — Municipal worker', { status: 200 });
  },
};

async function runScrape(env) {
  console.log(`[municipal] Starting scrape of ${MUNICIPAL_SOURCES.length} sources`);
  const allTenders = [];

  for (const source of MUNICIPAL_SOURCES) {
    console.log(`[municipal] Scraping ${source.name}...`);
    const tenders = await scrapeMunicipal(source);
    console.log(`[municipal] ${source.name}: ${tenders.length} tenders found`);
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

  console.log(`[municipal] Done. ${merged.length} total tenders stored.`);
}
