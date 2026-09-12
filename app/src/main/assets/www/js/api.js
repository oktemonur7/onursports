/**
 * api.js v5
 * - Falcon ve Kobra live/all dizilerini eksiksiz okur.
 * - Kadın (W) ve U23/altyapı maçlarını eksiksiz filtreler.
 * - Gelişmiş takım adı eşleştirmesi ile Falcon + Kobra kaynaklarını tek maç altında birleştirir.
 */

const API_BASE = 'https://ntv.cx/api/get-matches';
const KOBRA_PLAYER_BASE = 'https://hesgoal.team/ntvplayer.html?id=';
const EMBED_BASE = 'https://embed.st/embed/';

function resolveKobraSourceUrl(srcObj) {
  const srcType = (srcObj.source || '').toLowerCase().trim();
  const sid = (srcObj.id || '').toString().trim();
  if (!sid) return null;
  if (srcType) {
    // Direkt embed.st — hesgoal.team aracısını atlıyoruz
    return `${EMBED_BASE}${srcType}/${sid}/1`;
  }
  return null;
}

function resolveQualityLabel(srcObj) {
  const h = [srcObj.url, srcObj.name, srcObj.label, srcObj.quality, srcObj.title, srcObj.channelName]
    .filter(Boolean).join(' ').toUpperCase();
  if (h.includes('FHD') || h.includes('1080')) return 'FHD';
  if (h.includes('DLHD') || h.includes('HD') || h.includes('720')) return 'HD';
  return '';
}

// Kadın, (W), (w), U23, U21, U19, U17 vb. filtre regex'leri
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

function normalizeTeamName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[^\w\sğüşıöçĞÜŞİÖÇ]/g, ' ')
    .replace(/\bfc\b|\bsc\b|\bac\b|\bfk\b|\bsk\b|\btown\b|\bcity\b|\bunited\b|\bv\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function teamsMatch(a1, a2, b1, b2) {
  const na1 = normalizeTeamName(a1), na2 = normalizeTeamName(a2);
  const nb1 = normalizeTeamName(b1), nb2 = normalizeTeamName(b2);
  if (!na1 || !na2 || !nb1 || !nb2) return false;
  if (na1 === nb1 && na2 === nb2) return true;

  const minLen = 3;
  if (na1.length >= minLen && na2.length >= minLen) {
    const homeMatch = nb1.includes(na1) || na1.includes(nb1);
    const awayMatch = nb2.includes(na2) || na2.includes(nb2);
    if (homeMatch && awayMatch) return true;
  }
  return false;
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
    // Önce doğrudan live listesi varsa onu, yoksa all listesini al
    const rawList = (data.live && data.live.length > 0)
      ? data.live
      : (data.all || data.matches || data.data || []);
    return rawList;
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

  const category = raw.category || raw.tournament || raw.sport || '';
  const tournament = raw.tournament || raw.league?.name || '';

  return {
    _id: raw.id || raw._id || `${server}_${Math.random()}`,
    _server: server,
    title,
    home,
    away,
    competition,
    category,
    tournament,
    time,
    sources,
    raw
  };
}

function mergeMatches(falconList, kobraList) {
  const merged = [];

  // 1. Falcon maçlarını ekle
  falconList.forEach(fm => {
    merged.push({
      id: fm._id,
      title: fm.title,
      home: fm.home,
      away: fm.away,
      competition: fm.competition,
      category: fm.category,
      tournament: fm.tournament,
      time: fm.time,
      sources: [...fm.sources]
    });
  });

  // 2. Kobra maçlarını eşleştir veya yeni olarak ekle
  kobraList.forEach(km => {
    const existing = merged.find(m => teamsMatch(m.home, m.away, km.home, km.away));
    if (existing) {
      let ki = 1;
      km.sources.forEach(src => {
        existing.sources.push({ ...src, label: `K-${ki}${src.quality ? ' ' + src.quality : ''}` });
        ki++;
      });
    } else {
      merged.push({
        id: km._id,
        title: km.title,
        home: km.home,
        away: km.away,
        competition: km.competition,
        category: km.category,
        tournament: km.tournament,
        time: km.time,
        sources: km.sources.map((src, i) => ({ ...src, label: `K-${i + 1}${src.quality ? ' ' + src.quality : ''}` }))
      });
    }
  });

  return merged.filter(m => m.sources.length > 0);
}

async function fetchAllMatches() {
  console.log('[API] Canlı maçlar çekiliyor…');
  const [falconRaw, kobraRaw] = await Promise.all([fetchServer('falcon'), fetchServer('kobra')]);

  const falconList = falconRaw.map(m => normalizeMatch(m, 'falcon'));
  const kobraList  = kobraRaw.map(m => normalizeMatch(m, 'kobra'));

  let result = mergeMatches(falconList, kobraList);
  result = result.filter(m => !isExcludedMatch(m));
  console.log(`[API] Filtrelenmiş birleşik maç sayısı: ${result.length}`);
  return result;
}

window.AppAPI = { fetchAllMatches };
