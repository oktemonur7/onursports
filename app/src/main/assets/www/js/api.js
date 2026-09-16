/**
 * api.js v6
 * - Sadece Falcon — Kobra kaldırıldı.
 * - Kadın (W), altyapı ve istenmeyen spor filtresi.
 */

const API_BASE = 'https://ntv.cx/api/get-matches';
// TR kaynakları Vercel serverless üzerinden gelir (HLS relay dahil).
const BETINE_URL = 'https://onusports-webtest.vercel.app/api/betine';
let _betineCache = { events: [], ts: 0 };
const BETINE_TTL = 60 * 1000;

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
  /\bcricket\b/i,
  /\be-?soccer\b/i,
  /\besoccer\b/i,
  /\be-?football\b/i,
  /\befootball\b/i,
  /\bsnooker\b/i,
  /\bice[- ]?hockey\b/i,
  /\bbuz hokeyi\b/i,
  /\bbuz-hokeyi\b/i
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
    if (url) sources.push({ label: `F-${idx + 1}${quality ? ' ' + quality : ''}`, url, server: 'falcon', quality, type: 'iframe' });
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

  // TR eşleşmelerini en başa ekle (fail-soft: olmazsa Falcon devam eder)
  try {
    const { events } = await fetchBetine();
    if (events.length > 0) {
      let hits = 0;
      result = result.map(m => {
        const video = findBetineVideo(m, events);
        if (video) {
          hits++;
          m.sources.unshift({ label: 'TR', url: video, server: 'betine', quality: '', type: 'hls' });
        }
        return m;
      });
      console.log(`[API] TR eşleşmesi: ${hits}/${result.length}`);
    }
  } catch (err) {
    console.warn('[API] TR atlandı:', err.message);
  }
  return result;
}

// ─── TR (Betine) eşleştirme ──────────────────────────────────────────

function cleanTeamName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[ıİ]/g, 'i').replace(/ç/g, 'c').replace(/ş/g, 's')
    .replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ğ/g, 'g')
    .replace(/^\d{3,4}\s+/, '')
    .replace(/\b(fc|fk|bk|sk|nk|ff|kulubu|kulübü|klubu|klub|club|saf|rj|sp|pr|sc|rs|ec|ac|ca|cr|cf|cd|cs)\b/gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Kısaltmalar ve takma adlar: atl madrid -> atletico madrid,
// rc deportivo / deportivo coruna -> deportivo lacoruna
const ABBREV = { atl: 'atletico', utd: 'united' };

function canonicalTeam(name) {
  let t = cleanTeamName(name);
  t = t.split(' ').map(w => ABBREV[w] || w).join(' ');
  if (/\bdeportivo\b/.test(t) && /\b(rc|coruna|lacoruna)\b/.test(t)) {
    t = 'deportivo lacoruna';
  }
  return t.replace(/\s+/g, ' ').trim();
}

function teamSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (longer.includes(shorter) && shorter.length >= 4) {
    return 0.9 + 0.1 * (shorter.length / longer.length);
  }
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1), cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

function clubGuard(a, b) {
  if (!a || !b) return false;
  const ta = a.split(' '), tb = b.split(' ');
  if (ta.length < 2 || tb.length < 2) return false;
  if (ta[0] !== tb[0]) return false;
  if (a.includes(b) || b.includes(a)) return false;
  const ra = ta.slice(1), rb = tb.slice(1);
  const [short, long] = ra.length <= rb.length ? [ra, rb] : [rb, ra];
  const covered = short.every(t => long.some(u => teamSimilarity(t, u) >= 0.5));
  if (covered) return false;
  return teamSimilarity(a, b) < 0.85;
}

function parseBetineTeams(name) {
  if (!name) return null;
  const parts = name.split(/\s+(?:–|-|vs\.?|v\.?)\s+/i);
  if (parts.length >= 2) {
    return { home: parts[0].trim(), away: parts.slice(1).join(' ').trim() };
  }
  return null;
}

function findBetineVideo(match, events) {
  const t1 = canonicalTeam(match.home);
  const t2 = canonicalTeam(match.away);
  if (!t1 || !t2) return null;
  let best = null, bestScore = 0;
  for (const ev of events) {
    if (ev.type && !/futbol|football|soccer/i.test(ev.type)) continue;
    if (!ev.video) continue;
    const bt = parseBetineTeams(ev.name);
    if (!bt) continue;
    const b1 = canonicalTeam(bt.home);
    const b2 = canonicalTeam(bt.away);
    if (!b1 || !b2) continue;
    if ([b1, b2].sort().join('___') === [t1, t2].sort().join('___')) return ev.video;
    const orders = [[[t1, b1], [t2, b2]], [[t1, b2], [t2, b1]]];
    let s = 0, min = 0;
    for (const [[x1, y1], [x2, y2]] of orders) {
      if (clubGuard(x1, y1) || clubGuard(x2, y2)) continue;
      const avg = (teamSimilarity(x1, y1) + teamSimilarity(x2, y2)) / 2;
      const mn = Math.min(teamSimilarity(x1, y1), teamSimilarity(x2, y2));
      if (avg > s) { s = avg; min = mn; }
    }
    if (s >= 0.68 && min >= 0.4 && s > bestScore) {
      best = ev.video; bestScore = s;
    }
  }
  return best;
}

async function fetchBetine() {
  const now = Date.now();
  if (_betineCache.events.length > 0 && (now - _betineCache.ts < BETINE_TTL)) {
    return { events: _betineCache.events };
  }
  const res = await fetch(BETINE_URL, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`TR HTTP ${res.status}`);
  const data = await res.json();
  // TV WebView file:// ile çalışır: göreli relay adreslerini mutlak yap
  const events = (data.events || []).map(ev => {
    if (ev.video && ev.video.startsWith('/')) {
      return { ...ev, video: 'https://onusports-webtest.vercel.app' + ev.video };
    }
    return ev;
  });
  _betineCache = { events, ts: now };
  return { events: _betineCache.events };
}

window.AppAPI = { fetchAllMatches };
