/**
 * api.js — Falcon & Kobra API katmanı
 * Maçları çeker, normalize eder, birleştirir.
 */

const API_BASE = 'https://ntv.cx/api/get-matches';
const KOBRA_PLAYER_BASE = 'https://hesgoal.team/ntvplayer.html?id=';
const EMBED_BASE = 'https://embed.st/embed/';
const KOBRA_SOURCES = ['echo', 'admin', 'delta', 'golf'];

// ─── Kobra URL Çözümleme ───────────────────────────────────────────────────

function resolveKobraSourceUrl(srcObj) {
  const srcType = (srcObj.source || '').toLowerCase();
  const sid = srcObj.id || '';
  if (!sid) return null;
  if (KOBRA_SOURCES.includes(srcType)) {
    return `${KOBRA_PLAYER_BASE}${EMBED_BASE}${srcType}/${sid}/1`;
  }
  return null;
}

// ─── Kalite Etiketi ────────────────────────────────────────────────────────

function resolveQualityLabel(srcObj) {
  const haystack = [
    srcObj.url || '',
    srcObj.name || '',
    srcObj.label || '',
    srcObj.quality || '',
    srcObj.title || '',
  ].join(' ').toUpperCase();

  if (haystack.includes('FHD') || haystack.includes('1080')) return 'FHD';
  if (haystack.includes('DLHD') || haystack.includes('HD') || haystack.includes('720')) return 'HD';
  return '';
}

// ─── Takım Adı Normalizasyonu ──────────────────────────────────────────────

function normalizeTeamName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '')   // özel karakterleri sil
    .replace(/\bfc\b|\bsc\b|\bac\b|\bfk\b|\bsk\b/g, '')  // kulüp ön/son ekleri
    .replace(/\s+/g, ' ')
    .trim();
}

function teamsMatch(a1, a2, b1, b2) {
  const na1 = normalizeTeamName(a1);
  const na2 = normalizeTeamName(a2);
  const nb1 = normalizeTeamName(b1);
  const nb2 = normalizeTeamName(b2);

  // Tam eşleşme
  if (na1 === nb1 && na2 === nb2) return true;

  // Kısmi eşleşme (birinin adı diğerinin içinde geçiyorsa)
  const minLen = 4;
  if (na1.length >= minLen && na2.length >= minLen) {
    const homeMatch = nb1.includes(na1) || na1.includes(nb1);
    const awayMatch = nb2.includes(na2) || na2.includes(nb2);
    if (homeMatch && awayMatch) return true;
  }

  return false;
}

// ─── Maç Başlığından Takım İsimlerini Ayrıştır ───────────────────────────

function parseTeamsFromTitle(title) {
  if (!title) return null;
  // "A vs B", "A v. B", "A - B", "A v B"
  const sep = /\s+(?:vs\.?|v\.?|–|-)\s+/i;
  const parts = title.split(sep);
  if (parts.length >= 2) {
    return { home: parts[0].trim(), away: parts.slice(1).join(' vs ').trim() };
  }
  return null;
}

// ─── Tek Sunucu Fetch ──────────────────────────────────────────────────────

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
    console.warn(`[API] ${server} fetch hatası:`, err.message);
    return [];
  }
}

// ─── Maç Listesini Normalize Et ───────────────────────────────────────────

function normalizeMatch(raw, server) {
  // Takım isimleri
  const homeRaw = raw.teams?.home?.name || raw.home || raw.home_name || '';
  const awayRaw = raw.teams?.away?.name || raw.away || raw.away_name || '';

  // Başlık
  const title = raw.title || raw.name || raw.match_title || `${homeRaw} vs ${awayRaw}`;

  // Başlıktan takım ayrıştır (teams yoksa)
  let home = homeRaw;
  let away = awayRaw;
  if (!home || !away) {
    const parsed = parseTeamsFromTitle(title);
    if (parsed) { home = parsed.home; away = parsed.away; }
  }

  // Saat
  const time = raw.time || raw.match_time || raw.start_time || '';

  // Lig/yarışma
  const competition = raw.competition?.name || raw.league?.name
    || raw.tournament || raw.league || raw.category || '';

  // Kaynaklar
  const rawSources = raw.sources || raw.streams || raw.links || [];
  const sources = [];

  rawSources.forEach((src, idx) => {
    let resolvedUrl = null;
    const quality = resolveQualityLabel(src);

    if (server === 'falcon') {
      resolvedUrl = src.url || src.link || src.stream || null;
      if (resolvedUrl) {
        sources.push({
          label: `F-${idx + 1}${quality ? ' ' + quality : ''}`,
          url: resolvedUrl,
          server: 'falcon',
          quality,
          raw: src,
        });
      }
    } else if (server === 'kobra') {
      resolvedUrl = src.url || src.link || null;
      if (!resolvedUrl) {
        resolvedUrl = resolveKobraSourceUrl(src);
      }
      if (resolvedUrl) {
        sources.push({
          label: `K-${idx + 1}${quality ? ' ' + quality : ''}`,
          url: resolvedUrl,
          server: 'kobra',
          quality,
          raw: src,
        });
      }
    }
  });

  return {
    _id: raw.id || raw._id || `${server}_${Date.now()}_${Math.random()}`,
    _server: server,
    title,
    home,
    away,
    competition,
    time,
    sources,
    raw,
  };
}

// ─── Maç Listelerini Birleştir ─────────────────────────────────────────────

function mergeMatches(falconList, kobraList) {
  const merged = [];

  // Falcon maçları ana liste olarak başlat
  falconList.forEach(fm => {
    merged.push({
      id: fm._id,
      title: fm.title,
      home: fm.home,
      away: fm.away,
      competition: fm.competition,
      time: fm.time,
      sources: [...fm.sources],   // Falcon kaynakları önce
    });
  });

  // Kobra maçlarını eşleştir veya ekle
  kobraList.forEach(km => {
    // Mevcut maçla eşleşiyor mu?
    const existing = merged.find(m =>
      teamsMatch(m.home, m.away, km.home, km.away)
    );

    if (existing) {
      // Kobra kaynaklarını yeniden numaralandır (K-1, K-2…)
      let kobraIdx = 1;
      km.sources.forEach(src => {
        const quality = src.quality;
        existing.sources.push({
          ...src,
          label: `K-${kobraIdx}${quality ? ' ' + quality : ''}`,
        });
        kobraIdx++;
      });
    } else {
      // Yeni maç olarak ekle
      merged.push({
        id: km._id,
        title: km.title,
        home: km.home,
        away: km.away,
        competition: km.competition,
        time: km.time,
        sources: km.sources.map((src, i) => ({
          ...src,
          label: `K-${i + 1}${src.quality ? ' ' + src.quality : ''}`,
        })),
      });
    }
  });

  // Kaynaksız maçları filtrele
  return merged.filter(m => m.sources.length > 0);
}

// ─── Ana Fetch Fonksiyonu ──────────────────────────────────────────────────

async function fetchAllMatches() {
  console.log('[API] Falcon & Kobra çekiliyor…');

  const [falconRaw, kobraRaw] = await Promise.all([
    fetchServer('falcon'),
    fetchServer('kobra'),
  ]);

  console.log(`[API] Falcon: ${falconRaw.length} maç | Kobra: ${kobraRaw.length} maç`);

  const falconList = falconRaw.map(m => normalizeMatch(m, 'falcon'));
  const kobraList  = kobraRaw.map(m => normalizeMatch(m, 'kobra'));

  const result = mergeMatches(falconList, kobraList);
  console.log(`[API] Birleştirme sonrası: ${result.length} maç`);

  return result;
}

// Dışa aktar
window.AppAPI = { fetchAllMatches, resolveKobraSourceUrl };
