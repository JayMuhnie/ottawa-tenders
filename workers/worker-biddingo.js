// ============================================================
// TenderWatch — Worker 2: Biddingo
// Self-contained — paste this entire file into the Cloudflare
// Worker editor and deploy. No imports needed.
// Cron: 15 11 * * *  (6:15 AM Ottawa time daily)
// ============================================================

// ─── Municipality list ───────────────────────────────────────
const BIDDINGO_SOURCES = [
  { id: 'kingston',        name: 'City of Kingston',            path: 'kingston' },
  { id: 'south-frontenac', name: 'Township of South Frontenac', path: 'southfrontenac' },
];

const KV_KEY = 'tenders:biddingo';
const BIDDINGO_BASE = 'https://www.biddingo.com';

// ─── Keywords ────────────────────────────────────────────────
const HIGH_CONFIDENCE_KEYWORDS = [
  'traffic study','traffic impact','traffic impact assessment',
  'transportation master plan','transportation plan','transportation study',
  'transportation demand','transportation demand management','tdm',
  'active transportation','active transportation plan',
  'cycling master plan','cycling network','cycling plan',
  'pedestrian master plan','pedestrian plan',
  'transit feasibility','transit study','transit plan','transit master plan',
  'bus rapid transit','brt',
  'origin-destination study','origin destination study','od study',
  'corridor study','road safety audit','road safety',
  'vision zero','complete streets',
  'parking study','parking strategy','parking master plan',
  'multimodal','multi-modal',
  'speed limit review','speed limit study',
  'environmental assessment','schedule b','schedule c',
  'class ea','municipal class environmental',
  'road reconstruction','road rehabilitation',
  'pavement rehabilitation','pavement resurfacing','road resurfacing',
  'microsurfacing','micro-surfacing',
  'bridge rehabilitation','bridge replacement','bridge inspection',
  'culvert replacement','culvert rehabilitation','culvert installation',
  'intersection improvement','intersection reconstruction',
  'signalization','traffic signal','traffic signals','signal timing',
  'sidewalk construction','sidewalk rehabilitation',
  'multi-use path','multi use path','mup','shared use path',
  'cycling infrastructure','bike lane',
  'streetlighting','street lighting',
  'retaining wall','grading','earthworks',
  'road construction','road widening','roundabout','interchange','highway',
];

const WORTH_A_GLANCE_KEYWORDS = [
  'engineering services','consulting services','professional services',
  'master plan','feasibility study','feasibility assessment',
  'infrastructure study','infrastructure plan','infrastructure assessment',
  'asset management','capital works',
  'design services','functional design','preliminary design','detailed design',
  'geotechnical','geotechnical investigation',
  'survey','topographic survey',
  'drainage','stormwater','storm sewer','erosion',
  'community improvement plan','secondary plan','official plan',
  'urban design','streetscape','waterfront','development charges',
  'construction management','contract administration',
  'site inspection','materials testing',
];

function classifyTender(text) {
  const lower = text.toLowerCase();
  for (const kw of HIGH_CONFIDENCE_KEYWORDS) {
    if (lower.includes(kw)) return { tier: 'high', matchedKeyword: kw };
  }
  for (const kw of WORTH_A_GLANCE_KEYWORDS) {
    if (lower.includes(kw)) return { tier: 'amber', matchedKeyword: kw };
  }
  return { tier: 'low', matchedKeyword: null };
}

// ─── Scraper ─────────────────────────────────────────────────
async function scrapeBiddingo(source) {
  const url = `${BIDDINGO_BASE}/${source.path}`;
  let html;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TenderBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.error(`Failed to fetch ${source.name}: ${err.message}`);
    return [];
  }
  return parseBiddingoHTML(html, source);
}

function parseBiddingoHTML(html, source) {
  const tenders = [];
  const now = new Date();

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
    const classification = classifyTender(rawTitle);
    tenders.push({
      id: `${source.id}-${slugify(rawTitle)}`, title: rawTitle,
      municipality: source.name, municipalityId: source.id,
      platform: 'biddingo', url: fullUrl,
      closingDate: closingDate ? closingDate.toISOString() : null,
      scrapedAt: new Date().toISOString(),
      tier: classification.tier, matchedKeyword: classification.matchedKeyword,
      dismissed: false,
    });
  }

  // Fallback
  if (!matched || tenders.length === 0) {
    const linkPattern = /<a[^>]*href="(\/[^"]*(?:bid|tender|rfp|rft|rfq)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = linkPattern.exec(html)) !== null) {
      const rawTitle = match[2].replace(/<[^>]+>/g, '').trim();
      if (!rawTitle || rawTitle.length < 5) continue;
      const classification = classifyTender(rawTitle);
      tenders.push({
        id: `${source.id}-${slugify(rawTitle)}`, title: rawTitle,
        municipality: source.name, municipalityId: source.id,
        platform: 'biddingo', url: `${BIDDINGO_BASE}${match[1]}`,
        closingDate: null, scrapedAt: new Date().toISOString(),
        tier: classification.tier, matchedKeyword: classification.matchedKeyword,
        dismissed: false,
      });
    }
  }
  return tenders;
}

function parseDate(str) {
  try { const d = new Date(str); return isNaN(d.getTime()) ? null : d; }
  catch { return null; }
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
}

// ─── Main scrape run ─────────────────────────────────────────
async function runScrape(env) {
  console.log(`[biddingo] Scraping ${BIDDINGO_SOURCES.length} sources...`);
  const allTenders = [];
  for (const source of BIDDINGO_SOURCES) {
    const tenders = await scrapeBiddingo(source);
    console.log(`[biddingo] ${source.name}: ${tenders.length} tenders`);
    allTenders.push(...tenders);
  }
  const existing = await env.TENDERS_KV.get(KV_KEY, 'json') || [];
  const existingMap = Object.fromEntries(existing.map(t => [t.id, t]));
  const merged = allTenders.map(t => ({
    ...t, dismissed: existingMap[t.id]?.dismissed ?? false,
  }));
  await env.TENDERS_KV.put(KV_KEY, JSON.stringify(merged), {
    expirationTtl: 60 * 60 * 24 * 7,
  });
  console.log(`[biddingo] Done. ${merged.length} tenders stored.`);
}

// ─── Worker entry point ──────────────────────────────────────
addEventListener('scheduled', event => {
  event.waitUntil(runScrape(event));
});

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request, event));
});

async function handleRequest(request, event) {
  const url = new URL(request.url);
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (url.pathname === '/refresh') {
    event.waitUntil(runScrape(event));
    return new Response(JSON.stringify({ ok: true, message: 'Biddingo scrape triggered' }), { headers });
  }
  if (url.pathname === '/tenders') {
    const data = await event.env.TENDERS_KV.get(KV_KEY, 'json');
    return new Response(JSON.stringify(data || []), { headers });
  }
  return new Response('TenderWatch — Biddingo worker running.', { status: 200 });
}
