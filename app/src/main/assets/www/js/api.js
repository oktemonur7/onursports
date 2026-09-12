/**
 * api.js v4
 * - Kobra: tüm source tipler desteklendi (sadece echo/admin/delta/golf değil)
 * - type=both, live filtre client tarafında
 */

const API_BASE = 'https://ntv.cx/api/get-matches';
const KOBRA_PLAYER_BASE = 'https://hesgoal.team/ntvplayer.html?id=';
const EMBED_BASE = 'https://embed.st/embed/';

function resolveKobraSourceUrl(srcObj) {
  const srcType = (srcObj.source || '').toLowerCase().trim();
  const sid = (srcObj.id || '').toString().trim();
  if (!sid) return null;
  // Herhangi bir geçerli source type + id kombinasyonu için URL üret
  if (srcType) {
    return `${KOBRA_PLAYER_BASE}${EMBED_BASE}${srcType}/${sid}/1`;
  }
  return null;
}

function resolveQualityLabel(srcObj) {
  const h = [srcObj.url, srcObj.name, srcObj.label, srcObj.quality, srcObj.title]
    .filter(Boolean).join(' ').toUpperCase();
  if (h.includes('FHD') || h.includes('1080')) return 'FHD';
  if (h.includes('DLHD') || h.includes('HD') || h.includes('720')) return 'HD';
  return '';
}

const EXCLUDE_PATTERNS = [
  /\bu\s*23\b/i, /\bu-23\b/i, /\bu21\b/i, /\bu-21\b/i,
  /\bu20\b/i, /\bu-20\b/i, /\bu19\b/i, /\bu18\b/i,
  /\bu17\b/i, /\bu16\b/i, /\bu15\b/i,
  /\bwomen\b/i, /\bwoman\b/i, /\bwomens\b/i,
  /\bfeminine\b/i, /\bfeminin\b/i, /\bladies\b/i,
  /\bkadın\b/i, /\bkadin\b/i,
];

function isExcludedMatch(match) {
  const text = [match.title, match.home, match.away, match.competition].filter(Boolean).join(' ');
  return EXCLUDE_PATTERNS.some(p => p.test(text));
}

function isLiveMatch(raw) {
  const status = (raw.status || raw.state || '').toLowerCase();
  if (status) {
    return ['live', 'in_progress', 'inprogress', 'playing', 'active', '1', 'ongoing'].includes(status);
  }
  if (raw.live !== undefined) return raw.live === true || raw.live === 1 || raw.live === '1';
  if (raw.is_live !== undefined) return raw.is_live === true || raw.is_live === 1;
  return true; // status alanı yoksa dahil et
}

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
    if ((nb1.includes(na1) || na1.includes(nb1)) && (nb2.includes(na2) || na2.includes(nb2))) return true;
  }
  return false;
}

function parseTeamsFromTitle(title) {
  if (!title) return null;
  const parts = title.split(/\s+(?:vs\.?|v\.?|–|-)\s+/i);
  if (parts.length >= 2) return { home: parts[0].trim(), away: parts.slice(1).join(' vs ').trim() };
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
    return data.all || data.matches || data.data || [];
  } catch (err) {
    console.warn(`[API] ${server} hatası:`, err.message);
    return [];
  }
}

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
    const quality = resolveQualityLabel(src);
    if (server === 'falcon') {
      const url = src.url || src.link || src.stream || null;
      if (url) sources.push({ label: `F-${idx + 1}${quality ? ' ' + quality : ''}`, url, server: 'falcon', quality });
    } else if (server === 'kobra') {
      let url = src.url || src.link || null;
      if (!url) url = resolveKobraSourceUrl(src);
      if (url) sources.push({ label: `K-${idx + 1}${quality ? ' ' + quality : ''}`, url, server: 'kobra', quality });
    }
  });

  return { _id: raw.id || raw._id || `${server}_${Math.random()}`, _server: server, title, home, away, competition, time, sources, raw };
}

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

async function fetchAllMatches() {
  console.log('[API] Çekiliyor…');
  const [falconRaw, kobraRaw] = await Promise.all([fetchServer('falcon'), fetchServer('kobra')]);
  console.log(`[API] Falcon: ${falconRaw.length} | Kobra: ${kobraRaw.length}`);

  const falconLive = falconRaw.filter(m => isLiveMatch(m));
  const kobraLive  = kobraRaw.filter(m => isLiveMatch(m));

  const falconList = falconLive.map(m => normalizeMatch(m, 'falcon'));
  const kobraList  = kobraLive.map(m => normalizeMatch(m, 'kobra'));

  let result = mergeMatches(falconList, kobraList);
  result = result.filter(m => !isExcludedMatch(m));
  console.log(`[API] Sonuç: ${result.length} canlı maç`);
  return result;
}

window.AppAPI = { fetchAllMatches };
