// ============================================================
// TenderWatch — Worker 3: Municipal websites
// Self-contained — paste this entire file into the Cloudflare
// Worker editor and deploy. No imports needed.
// Cron: 30 11 * * *  (6:30 AM Ottawa time daily)
// ============================================================

// ─── Municipality list ───────────────────────────────────────
const MUNICIPAL_SOURCES = [
  {
    id: 'ottawa', name: 'City of Ottawa',
    url: 'https://ottawa.ca/en/city-hall/procurement-and-contracts/solicitations-and-awards',
    linkBase: 'https://ottawa.ca',
  },
  {
    id: 'mississippi-mills', name: 'Town of Mississippi Mills (Almonte)',
    url: 'https://www.mississippimills.ca/en/business/tenders-and-rfps.aspx',
    linkBase: 'https://www.mississippimills.ca',
  },
  {
    id: 'carleton-place', name: 'Town of Carleton Place',
    url: 'https://www.carletonplace.ca/en/business/tenders.aspx',
    linkBase: 'https://www.carletonplace.ca',
  },
  {
    id: 'arnprior', name: 'Town of Arnprior',
    url: 'https://www.arnprior.ca/en/business/tenders.aspx',
    linkBase: 'https://www.arnprior.ca',
  },
  {
    id: 'pembroke', name: 'City of Pembroke',
    url: 'https://www.pembroke.ca/en/business/bids-and-tenders.aspx',
    linkBase: 'https://www.pembroke.ca',
  },
  {
    id: 'renfrew', name: 'Town of Renfrew',
    url: 'https://www.renfrew.ca/en/business/tenders.aspx',
    linkBase: 'https://www.renfrew.ca',
  },
  {
    id: 'petawawa', name: 'Town of Petawawa',
    url: 'https://www.petawawa.ca/en/business/bids-and-tenders.aspx',
    linkBase: 'https://www.petawawa.ca',
  },
  {
    id: 'laurentian-hills', name: 'Town of Laurentian Hills',
    url: 'https://www.laurentianhills.ca/en/business/tenders.aspx',
    linkBase: 'https://www.laurentianhills.ca',
  },
  {
    id: 'perth', name: 'Town of Perth',
    url: 'https://www.perth.ca/en/business/tenders.aspx',
    linkBase: 'https://www.perth.ca',
  },
  {
    id: 'north-grenville', name: 'Municipality of North Grenville',
    url: 'https://www.northgrenville.ca/en/business/tenders.aspx',
    linkBase: 'https://www.northgrenville.ca',
  },
  {
    id: 'lanark-highlands', name: 'Township of Lanark Highlands',
    url: 'https://www.lanarkhighlands.ca/en/business/tenders.aspx',
    linkBase: 'https://www.lanarkhighlands.ca',
  },
  {
    id: 'champlain', name: 'Champlain Township',
    url: 'https://www.champlain.ca/en/business/tenders.aspx',
    linkBase: 'https://www.champlain.ca',
  },
  {
    id: 'beckwith', name: 'Township of Beckwith',
    url: 'https://www.beckwith.ca/en/business/tenders.aspx',
    linkBase: 'https://www.beckwith.ca',
  },
  {
    id: 'montague', name: 'Township of Montague',
    url: 'https://www.montaguetownship.ca/en/business/tenders.aspx',
    linkBase: 'https://www.montaguetownship.ca',
  },
  {
    id: 'merrickville-wolford', name: 'Village of Merrickville-Wolford',
    url: 'https://www.merrickville-wolford.ca/en/business/tenders.aspx',
    linkBase: 'https://www.merrickville-wolford.ca',
  },
  {
    id: 'gananoque', name: 'Town of Gananoque',
    url: 'https://www.gananoque.ca/en/business/tenders.aspx',
    linkBase: 'https://www.gananoque.ca',
  },
  {
    id: 'frontenac-county', name: 'County of Frontenac',
    url: 'https://www.frontenaccounty.ca/en/business/tenders.aspx',
    linkBase: 'https://www.frontenaccounty.ca',
  },
];

const KV_KEY = 'tenders:municipal';

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
async function scrapeMunicipal(source) {
  let html;
  try {
    const res = await fetch(source.url, {
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
  return parseMunicipalHTML(html, source);
}

function parseMunicipalHTML(html, source) {
  const tenders = [];
  const now = new Date();
  const seen = new Set();

  const tenderTerms = [
    'tender','rfp','rfq','rft','request for proposal','request for quotation',
    'request for tender','bid','solicitation','contract opportunity',
    'consulting','engineering','study','plan',
  ];

  const skipTerms = [
    'home','contact','login','search','menu','facebook','twitter',
    'linkedin','youtube','instagram','privacy','accessibility','sitemap',
    'copyright','terms','newsletter','subscribe','careers','jobs',
  ];

  const linkPattern = /<a[^>]*href="([^"#][^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1];
    const rawText = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!rawText || rawText.length < 5 || rawText.length > 300) continue;

    const combined = (rawText + ' ' + href).toLowerCase();
    if (!tenderTerms.some(t => combined.includes(t))) continue;
    if (skipTerms.some(t => combined.includes(t))) continue;

    let fullUrl;
    if (href.startsWith('http')) fullUrl = href;
    else if (href.startsWith('/')) fullUrl = `${source.linkBase}${href}`;
    else fullUrl = `${source.linkBase}/${href}`;

    const id = `${source.id}-${slugify(rawText)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    // Try to find a closing date in surrounding context
    const contextStart = Math.max(0, match.index - 200);
    const contextEnd = Math.min(html.length, match.index + match[0].length + 200);
    const context = html.slice(contextStart, contextEnd);
    const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+\.?\s+\d{1,2},?\s*\d{4})/g;
    let closingDate = null;
    let dateMatch;
    while ((dateMatch = datePattern.exec(context)) !== null) {
      const d = parseDate(dateMatch[1]);
      if (d && d > now) { closingDate = d; break; }
    }

    const classification = classifyTender(rawText);
    tenders.push({
      id, title: rawText,
      municipality: source.name, municipalityId: source.id,
      platform: 'municipal', url: fullUrl,
      closingDate: closingDate ? closingDate.toISOString() : null,
      scrapedAt: new Date().toISOString(),
      tier: classification.tier, matchedKeyword: classification.matchedKeyword,
      dismissed: false,
    });
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
  console.log(`[municipal] Scraping ${MUNICIPAL_SOURCES.length} sources...`);
  const allTenders = [];
  for (const source of MUNICIPAL_SOURCES) {
    const tenders = await scrapeMunicipal(source);
    console.log(`[municipal] ${source.name}: ${tenders.length} tenders`);
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
  console.log(`[municipal] Done. ${merged.length} tenders stored.`);
}

// ─── Worker entry point ──────────────────────────────────────
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScrape(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
    if (url.pathname === '/refresh') {
      ctx.waitUntil(runScrape(env));
      return new Response(JSON.stringify({ ok: true, message: 'Municipal scrape triggered' }), { headers });
    }
    if (url.pathname === '/tenders') {
      const data = await env.TENDERS_KV.get(KV_KEY, 'json');
      return new Response(JSON.stringify(data || []), { headers });
    }
    return new Response('TenderWatch — Municipal worker running.', { status: 200 });
  }
};
