/**
 * api.js v6
 * - Sadece Falcon — Kobra kaldırıldı.
 * - Kadın (W), altyapı ve istenmeyen spor filtresi.
 */

const API_BASE = 'https://ntv.cx/api/get-matches';

function resolveQualityLabel(srcObj) {
  const h = [srcObj.url, srcObj.name, srcObj.label, srcObj.quality, srcObj.title, srcObj.channelName]
    .filter(Boolean).join(' ').toUpperCase();
  if (h.includes('FHD') || h.includes('1080')) return 'FHD';
  if (h.includes('DLHD') || h.includes('HD') || h.includes('720')) return 'HD';
  return '';
}

// Kadın, (W), U23/altyapı ve istenmeyen spor türleri
const EXCLUDE_PATTERNS = [
  /\(\s*w\s*\)/i,
  /\[\s*w\s*\]/i,
  /\bwomen\b/i,
  /\bwomens\b/i,
  /\bwoman\b/i,
  /\bfeminine\b/i,
  /\bfeminin\b/i,
  /\bladies\b/i,
  /\blady\b/i,
  /\bkadın\b/i,
  /\bkadin\b/i,
  /\bfem\b/i,
  /\bu\s*23\b/i, /\bu-23\b/i, /\bu23\b/i,
  /\bu\s*21\b/i, /\bu-21\b/i, /\bu21\b/i,
  /\bu\s*20\b/i, /\bu-20\b/i, /\bu20\b/i,
  /\bu\s*19\b/i, /\bu-19\b/i, /\bu19\b/i,
  /\bu\s*18\b/i, /\bu-18\b/i, /\bu18\b/i,
  /\bu\s*17\b/i, /\bu-17\b/i, /\bu17\b/i,
  /\bu\s*16\b/i, /\bu-16\b/i, /\bu16\b/i,
  /\bu\s*15\b/i, /\bu-15\b/i, /\bu15\b/i,

  // İstenmeyen spor türleri
  /\bbasket\b/i,
  /\bbasketball\b/i,
  /\bnba\b/i,
  /\beuroleague\b/i,
  /\btennis\b/i,
  /\btenis\b/i,
  /\batp\b/i,
  /\bwta\b/i,
  /\bamerican[- ]?football\b/i,
  /\bnfl\b/i,
  /\bfight\b/i,
  /\bufc\b/i,
  /\bmma\b/i,
  /\bboxing\b/i,
  /\bboks\b/i,
  /\bmotor[- ]?sports?\b/i,
  /\bmotorsport\b/i,
  /\bformula[- ]?1\b/i,
  /\bf1\b/i,
  /\bmotogp\b/i,
  /\bgrand prix\b/i,
  /\bnascar\b/i,
  /\brugby\b/i,
  /\bafl\b/i,
  /\bbaseball\b/i,
  /\bmlb\b/i,
  /\bcricket\b/i
];

function isExcludedMatch(match) {
  const text = [
    match.title,
    match.home,
    match.away,
    match.competition,
    match.category,
    match.tournament
  ].filter(Boolean).join(' ');
  return EXCLUDE_PATTERNS.some(p => p.test(text));
}

function parseTeamsFromTitle(title) {
  if (!title) return null;
  const parts = title.split(/\s+(?:vs\.?|v\.?|–|-)\s+/i);
  if (parts.length >= 2) {
    return { home: parts[0].trim(), away: parts.slice(1).join(' vs ').trim() };
  }
  return null;
}

async function fetchServer(server) {
  const url = `${API_BASE}?server=${server}&type=both`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rawList = (data.live && data.live.length > 0)
      ? data.live
      : (data.all || data.matches || data.data || []);
    return rawList;
  } catch (err) {
    console.warn(`[API] ${server} hatası:`, err.message);
    return [];
  }
}

function normalizeMatch(raw) {
  const homeRaw = raw.teams?.home?.name || raw.home || raw.home_name || '';
  const awayRaw = raw.teams?.away?.name || raw.away || raw.away_name || '';
  const title = raw.title || raw.name || raw.match_title || `${homeRaw} vs ${awayRaw}`;
  let home = homeRaw, away = awayRaw;
  if (!home || !away) {
    const parsed = parseTeamsFromTitle(title);
    if (parsed) { home = parsed.home; away = parsed.away; }
  }
  const time = raw.time || raw.match_time || raw.start_time || '';
  const competition = raw.competition?.name || raw.league?.name || raw.tournament || raw.league || raw.category || '';
  const rawSources = raw.sources || raw.streams || raw.links || [];
  const sources = [];

  rawSources.forEach((src, idx) => {
    const quality = resolveQualityLabel(src);
    const url = src.url || src.link || src.stream || null;
    if (url) sources.push({ label: `F-${idx + 1}${quality ? ' ' + quality : ''}`, url, server: 'falcon', quality });
  });

  return {
    _id: raw.id || raw._id || `falcon_${Math.random()}`,
    title,
    home,
    away,
    competition,
    category: raw.category || raw.tournament || raw.sport || '',
    tournament: raw.tournament || raw.league?.name || '',
    time,
    sources,
  };
}

async function fetchAllMatches() {
  console.log('[API] Falcon maçları çekiliyor…');
  const falconRaw = await fetchServer('falcon');
  let result = falconRaw.map(m => normalizeMatch(m)).filter(m => m.sources.length > 0);
  result = result.filter(m => !isExcludedMatch(m));
  console.log(`[API] Filtrelenmiş maç sayısı: ${result.length}`);
  return result;
}

window.AppAPI = { fetchAllMatches };
