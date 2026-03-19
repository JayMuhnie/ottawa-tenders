// TenderWatch — Ottawa Region
// Dashboard app logic
// Reads from Cloudflare KV via worker endpoints, manages local dismiss state

// ─── Config ────────────────────────────────────────────────────────────────
// Replace these with your actual deployed worker URLs after deployment
const WORKER_URLS = {
  bidsandtenders: 'ottawa-tenders-bidsandtenders.jnterada.workers.dev',
  biddingo:       'ottawa-tenders-biddingo.jnterada.workers.dev',
  municipal:      'ottawa-tenders-municipal.jnterada.workers.dev',
};

const CLOSING_SOON_DAYS = 7;
const DISMISS_STORAGE_KEY = 'tenderwatch_dismissed';

// ─── State ──────────────────────────────────────────────────────────────────
let allTenders = [];
let filteredTenders = [];
let dismissedIds = new Set(JSON.parse(localStorage.getItem(DISMISS_STORAGE_KEY) || '[]'));

// ─── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadTenders();
  updateLastUpdated();
});

// ─── Data loading ────────────────────────────────────────────────────────────
async function loadTenders() {
  setLoading(true);
  allTenders = [];

  const results = await Promise.allSettled([
    fetchFromWorker('bidsandtenders'),
    fetchFromWorker('biddingo'),
    fetchFromWorker('municipal'),
  ]);

  results.forEach(result => {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      allTenders.push(...result.value);
    }
  });

  // Deduplicate by id
  const seen = new Set();
  allTenders = allTenders.filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  // Apply local dismiss state
  allTenders = allTenders.map(t => ({
    ...t,
    dismissed: dismissedIds.has(t.id),
  }));

  // Sort: closing soonest first within each tier
  allTenders.sort((a, b) => {
    const da = a.closingDate ? new Date(a.closingDate) : new Date('2099-01-01');
    const db = b.closingDate ? new Date(b.closingDate) : new Date('2099-01-01');
    return da - db;
  });

  populateMunicipalityFilter();
  applyFilters();
  setLoading(false);
  updateLastUpdated();
}

async function fetchFromWorker(platform) {
  try {
    const url = `${WORKER_URLS[platform]}/tenders`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[${platform}] Failed to load tenders:`, err.message);
    return [];
  }
}

// ─── Refresh ─────────────────────────────────────────────────────────────────
async function triggerRefresh() {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('loading');
  btn.disabled = true;

  // Trigger all 3 workers
  await Promise.allSettled([
    fetch(`${WORKER_URLS.bidsandtenders}/refresh`),
    fetch(`${WORKER_URLS.biddingo}/refresh`),
    fetch(`${WORKER_URLS.municipal}/refresh`),
  ]);

  // Wait a moment for workers to finish then reload
  showToast('Scrape triggered — reloading in 5 seconds…');
  await delay(5000);
  await loadTenders();

  btn.classList.remove('loading');
  btn.disabled = false;
}

// ─── Filters ─────────────────────────────────────────────────────────────────
function applyFilters() {
  const municipality = document.getElementById('filterMunicipality').value;
  const platform     = document.getElementById('filterPlatform').value;
  const tier         = document.getElementById('filterTier').value;
  const search       = document.getElementById('filterSearch').value.toLowerCase().trim();

  filteredTenders = allTenders.filter(t => {
    if (t.dismissed) return true; // Always show dismissed in their own section
    if (municipality && t.municipalityId !== municipality) return false;
    if (platform && t.platform !== platform) return false;
    if (tier === 'high' && t.tier !== 'high') return false;
    if (tier === 'amber' && t.tier === 'low') return false;
    if (search && !t.title.toLowerCase().includes(search) && !t.municipality.toLowerCase().includes(search)) return false;
    return true;
  });

  renderAll();
}

function clearFilters() {
  document.getElementById('filterMunicipality').value = '';
  document.getElementById('filterPlatform').value     = '';
  document.getElementById('filterTier').value         = '';
  document.getElementById('filterSearch').value       = '';
  applyFilters();
}

function populateMunicipalityFilter() {
  const select = document.getElementById('filterMunicipality');
  const current = select.value;

  // Get unique municipalities from all tenders
  const munis = [...new Map(allTenders.map(t => [t.municipalityId, t.municipality])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));

  select.innerHTML = '<option value="">All municipalities</option>';
  munis.forEach(([id, name]) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = name;
    if (id === current) opt.selected = true;
    select.appendChild(opt);
  });
}

// ─── Rendering ───────────────────────────────────────────────────────────────
function renderAll() {
  const now = new Date();
  const closingSoon = filteredTenders.filter(t =>
    !t.dismissed && t.closingDate &&
    new Date(t.closingDate) > now &&
    daysBetween(now, new Date(t.closingDate)) <= CLOSING_SOON_DAYS
  );
  const high      = filteredTenders.filter(t => !t.dismissed && t.tier === 'high');
  const amber     = filteredTenders.filter(t => !t.dismissed && t.tier === 'amber');
  const low       = filteredTenders.filter(t => !t.dismissed && t.tier === 'low');
  const dismissed = filteredTenders.filter(t => t.dismissed);

  // Stats
  const active = filteredTenders.filter(t => !t.dismissed);
  document.getElementById('statTotal').textContent   = active.length;
  document.getElementById('statHigh').textContent    = high.length;
  document.getElementById('statAmber').textContent   = amber.length;
  document.getElementById('statLow').textContent     = low.length;
  document.getElementById('statClosing').textContent = closingSoon.length;

  // Closing soon section
  const closingSection = document.getElementById('closingSoonSection');
  closingSection.style.display = closingSoon.length ? '' : 'none';
  document.getElementById('closingSoonCount').textContent = closingSoon.length;
  renderList('closingSoonList', closingSoon, null, 'closingSoonEmpty');

  // Tier sections
  document.getElementById('highCount').textContent    = high.length;
  document.getElementById('amberCount').textContent   = amber.length;
  document.getElementById('lowCount').textContent     = low.length;
  document.getElementById('dismissedCount').textContent = dismissed.length;

  renderList('highList',  high,      'highEmpty');
  renderList('amberList', amber,     'amberEmpty');
  renderList('lowList',   low,       'lowEmpty');
  renderList('dismissedList', dismissed, null, true);

  // Show/hide dismissed section
  document.getElementById('dismissedSection').style.display = dismissed.length ? '' : 'none';
}

function renderList(listId, tenders, emptyId, isDismissed = false) {
  const list = document.getElementById(listId);
  if (!list) return;

  // Clear previous cards (keep empty state element)
  const emptyEl = emptyId ? document.getElementById(emptyId) : null;
  list.innerHTML = '';
  if (emptyEl) list.appendChild(emptyEl);

  if (tenders.length === 0) {
    if (emptyEl) emptyEl.style.display = '';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  tenders.forEach(t => {
    list.appendChild(createCard(t, isDismissed));
  });
}

function createCard(tender, isDismissed = false) {
  const card = document.createElement('div');
  const now = new Date();
  const closing = tender.closingDate ? new Date(tender.closingDate) : null;
  const daysLeft = closing ? daysBetween(now, closing) : null;
  const isUrgent = daysLeft !== null && daysLeft <= CLOSING_SOON_DAYS && daysLeft >= 0;

  card.className = [
    'tender-card',
    `tier-${tender.tier}`,
    isUrgent ? 'closing-urgent' : '',
    isDismissed ? 'dismissed-card' : '',
  ].filter(Boolean).join(' ');

  // Meta tags
  const metaTags = [
    `<span class="meta-tag municipality">${escHtml(tender.municipality)}</span>`,
    `<span class="meta-tag platform">${platformLabel(tender.platform)}</span>`,
  ];

  if (tender.matchedKeyword) {
    const klass = tender.tier === 'amber' ? 'keyword amber' : 'keyword';
    metaTags.push(`<span class="meta-tag ${klass}">🔑 ${escHtml(tender.matchedKeyword)}</span>`);
  }

  if (closing) {
    const label = isUrgent
      ? `<span class="meta-tag closing-soon">⚠ Closes in ${daysLeft}d</span>`
      : `<span class="meta-tag closing">Closes ${formatDate(closing)}</span>`;
    metaTags.push(label);
  }

  if (tender.scrapedAt) {
    metaTags.push(`<span class="meta-tag scraped">Updated ${timeAgo(new Date(tender.scrapedAt))}</span>`);
  }

  // Actions
  const viewBtn = `<a href="${escHtml(tender.url)}" target="_blank" rel="noopener" class="btn-action view">
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
    View
  </a>`;

  const dismissBtn = isDismissed
    ? `<button class="btn-action restore" onclick="restoreTender('${tender.id}')">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>
        Restore
      </button>`
    : `<button class="btn-action dismiss" onclick="dismissTender('${tender.id}')">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        Dismiss
      </button>`;

  card.innerHTML = `
    <div class="tender-main">
      <div class="tender-title">
        <a href="${escHtml(tender.url)}" target="_blank" rel="noopener">${escHtml(tender.title)}</a>
      </div>
      <div class="tender-meta">${metaTags.join('')}</div>
    </div>
    <div class="tender-actions">
      ${viewBtn}
      ${dismissBtn}
    </div>
  `;

  return card;
}

// ─── Dismiss / restore ────────────────────────────────────────────────────────
function dismissTender(id) {
  dismissedIds.add(id);
  saveDismissed();
  const tender = allTenders.find(t => t.id === id);
  if (tender) tender.dismissed = true;
  applyFilters();
  showToast('Tender dismissed');
}

function restoreTender(id) {
  dismissedIds.delete(id);
  saveDismissed();
  const tender = allTenders.find(t => t.id === id);
  if (tender) tender.dismissed = false;
  applyFilters();
  showToast('Tender restored');
}

function saveDismissed() {
  localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify([...dismissedIds]));
}

// ─── Section collapse toggle ──────────────────────────────────────────────────
function toggleSection(listId, chevronId) {
  const list = document.getElementById(listId);
  const chevron = document.getElementById(chevronId);
  list.classList.toggle('collapsed');
  if (chevron) {
    chevron.style.transform = list.classList.contains('collapsed') ? '' : 'rotate(180deg)';
  }
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function setLoading(on) {
  const btn = document.getElementById('refreshBtn');
  if (on) {
    btn.classList.add('loading');
  } else {
    btn.classList.remove('loading');
  }
}

function updateLastUpdated() {
  const el = document.getElementById('lastUpdated');
  el.textContent = `Last refreshed: ${new Date().toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}`;
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function platformLabel(p) {
  if (p === 'bidsandtenders') return 'bids&tenders';
  if (p === 'biddingo') return 'Biddingo';
  return 'Municipal site';
}

function formatDate(date) {
  return date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysBetween(a, b) {
  return Math.ceil((b - a) / (1000 * 60 * 60 * 24));
}

function timeAgo(date) {
  const diff = Date.now() - date.getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}
