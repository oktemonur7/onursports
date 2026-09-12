/**
 * api.js — Falcon & Kobra API katmanı v3
 * - Sadece canlı maçlar (type=live)
 * - U23 ve kadın maçları filtrelendi
 */

const API_BASE = 'https://ntv.cx/api/get-matches';
const KOBRA_PLAYER_BASE = 'https://hesgoal.team/ntvplayer.html?id=';
const EMBED_BASE = 'https://embed.st/embed/';
const KOBRA_SOURCES = ['echo', 'admin', 'delta', 'golf'];

// ─── Kobra URL Çözümleme ──────────────────────────────────────────────────

function resolveKobraSourceUrl(srcObj) {
  const srcType = (srcObj.source || '').toLowerCase();
  const sid = srcObj.id || '';
  if (!sid) return null;
  if (KOBRA_SOURCES.includes(srcType)) {
    return `${KOBRA_PLAYER_BASE}${EMBED_BASE}${srcType}/${sid}/1`;
  }
  return null;
}

// ─── Kalite Etiketi ───────────────────────────────────────────────────────

function resolveQualityLabel(srcObj) {
  const haystack = [srcObj.url, srcObj.name, srcObj.label, srcObj.quality, srcObj.title]
    .filter(Boolean).join(' ').toUpperCase();
  if (haystack.includes('FHD') || haystack.includes('1080')) return 'FHD';
  if (haystack.includes('DLHD') || haystack.includes('HD') || haystack.includes('720')) return 'HD';
  return '';
}

// ─── U23 / Kadın Maç Filtresi ─────────────────────────────────────────────

const EXCLUDE_PATTERNS = [
  /\bu\s*23\b/i, /\bu-23\b/i, /\bu21\b/i, /\bu-21\b/i, /\bu20\b/i, /\bu-20\b/i,
  /\bu19\b/i, /\bu18\b/i, /\bu17\b/i, /\bu16\b/i,
  /\bwomen\b/i, /\bwoman\b/i, /\bwomens\b/i,
  /\bfeminine\b/i, /\bfeminin\b/i,
  /\bladies\b/i, /\blady\b/i,
  /\bkadın\b/i, /\bkadin\b/i,
  /\bfem\b/i,
];

function isExcludedMatch(match) {
  const text = [match.title, match.home, match.away, match.competition].filter(Boolean).join(' ');
  return EXCLUDE_PATTERNS.some(p => p.test(text));
}

// ─── Canlı Maç Kontrolü ──────────────────────────────────────────────────

function isLiveMatch(raw) {
  // Farklı API'lerde farklı alan adları olabilir
  if (raw.status === 'live' || raw.status === 'in_progress' || raw.status === 'inprogress') return true;
  if (raw.live === true || raw.is_live === true || raw.isLive === true) return true;
  if (raw.live === 1 || raw.is_live === 1) return true;
  if (raw.state === 'live' || raw.state === 'playing') return true;
  // type=live ile çekildiği için kaynak yoksa bile canlı sayıyoruz
  return true; // API zaten live filtreli döndürüyor
}

// ─── Takım Adı Normalizasyonu ─────────────────────────────────────────────

function normalizeTeamName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\bfc\b|\bsc\b|\bac\b|\bfk\b|\bsk\b/g, '')
    .replace(/\s+/g, ' ').trim();
}

function teamsMatch(a1, a2, b1, b2) {
  const na1 = normalizeTeamName(a1), na2 = normalizeTeamName(a2);
  const nb1 = normalizeTeamName(b1), nb2 = normalizeTeamName(b2);
  if (na1 === nb1 && na2 === nb2) return true;
  const minLen = 4;
  if (na1.length >= minLen && na2.length >= minLen) {
    const homeMatch = nb1.includes(na1) || na1.includes(nb1);
    const awayMatch = nb2.includes(na2) || na2.includes(nb2);
    if (homeMatch && awayMatch) return true;
  }
  return false;
}

// ─── Başlıktan Takım Ayrıştır ────────────────────────────────────────────

function parseTeamsFromTitle(title) {
  if (!title) return null;
  const parts = title.split(/\s+(?:vs\.?|v\.?|–|-)\s+/i);
  if (parts.length >= 2) return { home: parts[0].trim(), away: parts.slice(1).join(' vs ').trim() };
  return null;
}

// ─── Tek Sunucu Fetch ─────────────────────────────────────────────────────

async function fetchServer(server) {
  // type=live → sadece canlı maçlar
  const url = `${API_BASE}?server=${server}&type=live`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.all || data.matches || data.data || [];
  } catch (err) {
    console.warn(`[API] ${server} fetch hatası:`, err.message);
    return [];
  }
}

// ─── Maç Normalize ───────────────────────────────────────────────────────

function normalizeMatch(raw, server) {
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
    let resolvedUrl = null;
    const quality = resolveQualityLabel(src);
    if (server === 'falcon') {
      resolvedUrl = src.url || src.link || src.stream || null;
      if (resolvedUrl) sources.push({ label: `F-${idx + 1}${quality ? ' ' + quality : ''}`, url: resolvedUrl, server: 'falcon', quality, raw: src });
    } else if (server === 'kobra') {
      resolvedUrl = src.url || src.link || null;
      if (!resolvedUrl) resolvedUrl = resolveKobraSourceUrl(src);
      if (resolvedUrl) sources.push({ label: `K-${idx + 1}${quality ? ' ' + quality : ''}`, url: resolvedUrl, server: 'kobra', quality, raw: src });
    }
  });

  return { _id: raw.id || raw._id || `${server}_${Math.random()}`, _server: server, title, home, away, competition, time, sources, raw };
}

// ─── Birleştir ────────────────────────────────────────────────────────────

function mergeMatches(falconList, kobraList) {
  const merged = [];

  falconList.forEach(fm => {
    merged.push({ id: fm._id, title: fm.title, home: fm.home, away: fm.away, competition: fm.competition, time: fm.time, sources: [...fm.sources] });
  });

  kobraList.forEach(km => {
    const existing = merged.find(m => teamsMatch(m.home, m.away, km.home, km.away));
    if (existing) {
      let ki = 1;
      km.sources.forEach(src => {
        existing.sources.push({ ...src, label: `K-${ki}${src.quality ? ' ' + src.quality : ''}` });
        ki++;
      });
    } else {
      merged.push({ id: km._id, title: km.title, home: km.home, away: km.away, competition: km.competition, time: km.time, sources: km.sources.map((src, i) => ({ ...src, label: `K-${i + 1}${src.quality ? ' ' + src.quality : ''}` })) });
    }
  });

  return merged.filter(m => m.sources.length > 0);
}

// ─── Ana Fetch ───────────────────────────────────────────────────────────

async function fetchAllMatches() {
  console.log('[API] Falcon & Kobra çekiliyor (sadece canlı)…');

  const [falconRaw, kobraRaw] = await Promise.all([
    fetchServer('falcon'),
    fetchServer('kobra'),
  ]);

  console.log(`[API] Falcon: ${falconRaw.length} | Kobra: ${kobraRaw.length}`);

  const falconList = falconRaw.map(m => normalizeMatch(m, 'falcon'));
  const kobraList  = kobraRaw.map(m => normalizeMatch(m, 'kobra'));

  let result = mergeMatches(falconList, kobraList);

  // U23 ve kadın maçlarını filtrele
  const before = result.length;
  result = result.filter(m => !isExcludedMatch(m));
  console.log(`[API] Sonuç: ${result.length} maç (${before - result.length} filtrelendi)`);

  return result;
}

window.AppAPI = { fetchAllMatches };
