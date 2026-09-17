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
    if (url) sources.push({ label: `Kaynak ${idx + 1}${quality ? ' · ' + quality : ''}`, url, server: 'falcon', quality, type: 'iframe' });
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
  // Bitmiş maçları ele (başlangıçtan 2s45dk geçmişse yayında değildir)
  const MATCH_TTL = 165 * 60 * 1000;
  const nowMs = Date.now();
  let result = falconRaw
    .filter(m => {
      const d = m.date || m.match_date || m.start_timestamp;
      return !(typeof d === 'number' && nowMs - d > MATCH_TTL);
    })
    .map(m => normalizeMatch(m)).filter(m => m.sources.length > 0);
  result = result.filter(m => !isExcludedMatch(m));
  result = deduplicateMatches(result);
  console.log(`[API] Filtrelenmiş maç sayısı: ${result.length}`);

  // Sahadan programına göre yayıncı kanalı Kaynak 1 yap (fail-soft)
  try {
    const { program } = await fetchSahadan();
    const domain = await betistDomain();
    if (program.length > 0) {
      let hits = 0;
      const usedProg = new Set();
      result = result.map(m => {
        const hit = findSahadanChannel(m, program);
        if (hit) {
          hits++;
          if (hit.progIdx != null) usedProg.add(hit.progIdx);
          const ch = BETIST_IDS.find(c => c.id === hit.id);
          m.sources.unshift({
            label: `Kaynak 1 · ${ch ? ch.name : hit.name}`,
            url: `${domain}/channel?id=${hit.id}`,
            server: 'betist', quality: '', type: 'iframe',
          });
          // Falcon kaynaklarını Kaynak 1, 2... diye yeniden numaralandır
          let n = 0;
          m.sources = m.sources.map(s => {
            if (s.server === 'betist') return s;
            n++;
            const q = s.quality || '';
            return { ...s, label: `Kaynak ${n}${q ? ' · ' + q : ''}` };
          });
        }
        return m;
      });
      console.log(`[API] Kanal eşleşmesi: ${hits}/${result.length}`);
      // Falcon'da olmayıp programda olan CANLI maçları ekstra kart olarak ekle
      program.forEach((p, pi) => {
        if (usedProg.has(pi)) return;
        if (!p.live) return;
        const hit = mapSahadanChannels(p.channels);
        if (!hit) return;
        const ch = BETIST_IDS.find(c => c.id === hit.id);
        const extra = {
          _id: `sahadan_${pi}_${Date.now()}`,
          title: `${p.home} vs ${p.away}`,
          home: p.home, away: p.away,
          competition: '', category: '', tournament: '',
          time: '',
          sources: [{
            label: `Kaynak 1 · ${ch ? ch.name : hit.name}`,
            url: `${domain}/channel?id=${hit.id}`,
            server: 'betist', quality: '', type: 'iframe',
          }],
        };
        const t1 = canonicalTeam(extra.home), t2 = canonicalTeam(extra.away);
        const key = (t1 && t2) ? [t1, t2].sort().join('___') : null;
        const existing = key ? result.find(mm => {
          const e1 = canonicalTeam(mm.home), e2 = canonicalTeam(mm.away);
          return (e1 && e2) && [e1, e2].sort().join('___') === key;
        }) : null;
        if (existing) {
          mergeSources(existing, extra);
          existing.sources.sort((a, b) =>
            (a.server === 'betist' ? 0 : 1) - (b.server === 'betist' ? 0 : 1));
        } else {
          result.push(extra);
        }
      });
    }
  } catch (err) {
    console.warn('[API] Sahadan atlandı:', err.message);
  }
  return result;
}

function mergeSources(target, from) {
  const existingUrls = new Set(target.sources.map(s => s.url));
  for (const src of from.sources) {
    if (!existingUrls.has(src.url)) {
      target.sources.push(src);
      existingUrls.add(src.url);
    }
  }
}

function deduplicateMatches(matches) {
  const map = new Map();

  for (const match of matches) {
    const t1 = canonicalTeam(match.home);
    const t2 = canonicalTeam(match.away);

    const key = (t1 && t2)
      ? [t1, t2].sort().join('___')
      : canonicalTeam(match.title);

    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, { ...match, sources: [...match.sources], _t1: t1, _t2: t2 });
    } else {
      mergeSources(map.get(key), match);
    }
  }

  // 2. tur: yazım farkıyla kaçan tekrarları benzerlikle birleştir
  const merged = [];
  for (const m of map.values()) {
    let placed = false;
    for (const done of merged) {
      const s1 = Math.max(
        teamSimilarity(m._t1, done._t1) + teamSimilarity(m._t2, done._t2),
        teamSimilarity(m._t1, done._t2) + teamSimilarity(m._t2, done._t1)
      ) / 2;
      if (s1 >= 0.88) {
        mergeSources(done, m);
        placed = true;
        break;
      }
    }
    if (!placed) merged.push(m);
  }

  return merged.map(m => {
    delete m._t1; delete m._t2;
    return m;
  });
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
const ABBREV = { atl: 'atletico', utd: 'united', man: 'manchester' };

function canonicalTeam(name) {
  // 1) Kısaltmaları aç, 2) alias sözlüğü, 3) kural tabanlı
  const base = cleanTeamName(name).split(' ').map(w => ABBREV[w] || w).join(' ');
  const id = aliasIdSpaced(base);
  if (id) return 'alias:' + id;
  let t = base;
  if (/\bdeportivo\b/.test(t) && /\b(rc|coruna|lacoruna)\b/.test(t)) {
    t = 'deportivo lacoruna';
  }
  return t.replace(/\s+/g, ' ').trim();
}

// aliases.js yoksa sessizce null (liste dışı isimler fuzzy'ye düşer)
const PARTICLES = new Set(['de','la','du','des','del','di','da','do','der','den','het','van','al','el','los','las']);
const AFFIX = new Set(['fc','fk','bk','sk','nk','ff','ac','ca','cs','cf','cd','ud','sd','sc','rs','ec','sp','pr','as','us','ss','rc','rcd','rsc','kaa','kv','sv','sl','fsv','sg','afc','kulubu','kulübü','klubu','klub','club','saf','rj','jk']);

// Elle eklenen özel eşleşmeler (jenerik kuralların yakalayamadıkları)
const EXTRA_ALIASES = {
  elimai: 'yelimay', yelimay: 'yelimay', elimay: 'yelimay',
  yelimaysemey: 'yelimay', elimaysemey: 'yelimay',
  alqana: 'alqana', elqanah: 'alqana', elqana: 'alqana', qanah: 'alqana',
  welcoelekter: 'tartuwelco', tartuwelco: 'tartuwelco', tartujkwelco: 'tartuwelco',
  hoffenheim: 'tsghoffenheim', tsghoffenheim: 'tsghoffenheim',
  salzburg: 'salzburg', rbsalzburg: 'salzburg', redbullsalzburg: 'salzburg',
};

function aliasId(name) {
  if (!name) return null;
  return aliasIdSpaced(cleanTeamName(name));
}

function aliasIdSpaced(spaced) {
  if (typeof TEAM_ALIASES === 'undefined' || !spaced) return null;
  const nospace = s => s.replace(/ /g, '');
  const drop = (words, set) => words.filter(w => !set.has(w)).join(' ');
  const words = spaced.split(' ');
  const single = words.map(w => w === 'r' ? 'real' : w).join(' ');
  const cands = [
    nospace(spaced),
    nospace(single),
    nospace(drop(words, PARTICLES)),
    nospace(drop(words, AFFIX)),
    nospace(drop(drop(words, AFFIX).split(' '), PARTICLES)),
  ];
  for (const c of cands) {
    if (!c) continue;
    if (EXTRA_ALIASES[c]) return EXTRA_ALIASES[c];
    if (TEAM_ALIASES[c]) return TEAM_ALIASES[c];
  }
  // Alt dize eşleşmesi: hoffenheim -> tsghoffenheim gibi.
  // Birden fazla adaya uyuyorsa eşleşme yok.
  for (const c of cands) {
    if (!c || c.length < 5) continue;
    const found = substringCanonical(c);
    if (found) return found;
  }
  return null;
}

let _aliasKeys = null;
function substringCanonical(c) {
  if (!_aliasKeys) _aliasKeys = Object.keys(TEAM_ALIASES);
  let hit = null;
  for (const k of _aliasKeys) {
    if (k.length < 5) continue;
    if (k.includes(c) || c.includes(k)) {
      const cid = TEAM_ALIASES[k];
      if (hit && hit !== cid) return null;
      hit = cid;
    }
  }
  return hit;
}

function teamSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  // Alias id'ler sadece birebir tutarsa eşittir (realmadrid/realsociedad karışmasın)
  const aliasA = a.startsWith('alias:'), aliasB = b.startsWith('alias:');
  if (aliasA || aliasB) return 0;
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

// ─── Sahadan TV programı (Vercel serverless) ─────────────────────────────
// Hangi maç hangi kanalda: Kaynak 1 o kanal olur.
const SAHADAN_URL = 'https://onusports-webtest.vercel.app/api/sahadan';
let _sahadanCache = { program: [], ts: 0 };
const SAHADAN_TTL = 120 * 1000;

// Sahadan kanal adı -> Betist id (normalize edilmiş)
const SAHADAN_TO_BETIST = {
  beinsports1: 'zirve', beinsports2: 'b2', beinsports3: 'b3',
  beinsports4: 'b4', beinsports5: 'b5',
  beinsportsmax1: 'bm1', beinsportsmax2: 'bm2',
  ssport1: 'ss', ssport2: 'ss2', ssportplus: 'ex6', ssport: 'ss',
  tivibuspor1: 't1', tivibuspor2: 't2', tivibuspor3: 't3', tivibuspor4: 't4',
  trtspor: 'trtspor', aspor: 'as',
  tabiispor: 'ex7', tabiispor1: 'ex1', tabiispor2: 'ex2',
  tabiispor3: 'ex3', tabiispor4: 'ex4', tabiispor5: 'ex5',
};

function normChannel(name) {
  return (name || '').toLowerCase()
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/[^a-z0-9]/g, '');
}

async function fetchSahadan() {
  const now = Date.now();
  if (_sahadanCache.program.length > 0 && (now - _sahadanCache.ts < SAHADAN_TTL)) {
    return { program: _sahadanCache.program };
  }
  const res = await fetch(SAHADAN_URL, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Sahadan HTTP ${res.status}`);
  const data = await res.json();
  _sahadanCache = { program: data.program || [], ts: now };
  return { program: _sahadanCache.program };
}

function findSahadanChannel(match, program) {
  const t1 = canonicalTeam(match.home);
  const t2 = canonicalTeam(match.away);
  if (!t1 || !t2) return null;
  let best = null, bestScore = 0;
  for (let pi = 0; pi < program.length; pi++) {
    const p = program[pi];
    const b1 = canonicalTeam(p.home);
    const b2 = canonicalTeam(p.away);
    if (!b1 || !b2) continue;
    if ([b1, b2].sort().join('___') === [t1, t2].sort().join('___')) {
      const hit = mapSahadanChannels(p.channels);
      if (hit) return { ...hit, progIdx: pi };
      continue;
    }
    const orders = [[[t1, b1], [t2, b2]], [[t1, b2], [t2, b1]]];
    let s = 0, min = 0;
    for (const [[x1, y1], [x2, y2]] of orders) {
      if (clubGuard(x1, y1) || clubGuard(x2, y2)) continue;
      const avg = (teamSimilarity(x1, y1) + teamSimilarity(x2, y2)) / 2;
      const mn = Math.min(teamSimilarity(x1, y1), teamSimilarity(x2, y2));
      if (avg > s) { s = avg; min = mn; }
    }
    if (s >= 0.68 && min >= 0.4 && s > bestScore) {
      const hit = mapSahadanChannels(p.channels);
      if (hit) { best = { ...hit, progIdx: pi }; bestScore = s; }
    }
  }
  return best;
}

function mapSahadanChannels(channels) {
  for (const c of channels || []) {
    const key = normChannel(c);
    if (key === 'tabii') continue; // tek başına "tabii" başka şey, pas geç
    const id = SAHADAN_TO_BETIST[key];
    if (id) return { id, name: c };
  }
  return null;
}

// ─── Betist kanal listesi (domain sık değişir: açılışta canlı olan bulunur) ──
const BETIST_IDS = [
  { name: 'beIN Sports 1', id: 'zirve' },
  { name: 'beIN Sports 2', id: 'b2' },
  { name: 'beIN Sports 3', id: 'b3' },
  { name: 'beIN Sports 4', id: 'b4' },
  { name: 'beIN Sports 5', id: 'b5' },
  { name: 'beIN Sports MAX 1', id: 'bm1' },
  { name: 'beIN Sports MAX 2', id: 'bm2' },
  { name: 'S Sport 1', id: 'ss' },
  { name: 'S Sport 2', id: 'ss2' },
  { name: 'S Sport Plus', id: 'ex6' },
  { name: 'Tabii Spor', id: 'ex7' },
  { name: 'Tabii Spor 1', id: 'ex1' },
  { name: 'Tabii Spor 2', id: 'ex2' },
  { name: 'Tabii Spor 3', id: 'ex3' },
  { name: 'Tabii Spor 4', id: 'ex4' },
  { name: 'Tabii Spor 5', id: 'ex5' },
  { name: 'TRT Spor', id: 'trtspor' },
  { name: 'A Spor', id: 'as' },
  { name: 'Tivibu Spor 1', id: 't1' },
  { name: 'Tivibu Spor 2', id: 't2' },
  { name: 'Tivibu Spor 3', id: 't3' },
  { name: 'Tivibu Spor 4', id: 't4' },
];
const BETIST_FALLBACK = 'https://betist258tv.live';
let _betistDomain = null, _betistDomainTs = 0;
const BETIST_DOMAIN_TTL = 60 * 60 * 1000;

async function betistDomain() {
  const now = Date.now();
  if (_betistDomain && (now - _betistDomainTs < BETIST_DOMAIN_TTL)) return _betistDomain;
  // Site uyarısı: "bir sonraki alan adı bir sayı artarak devam edecektir"
  const nums = [];
  for (let n = 256; n <= 290; n++) nums.push(n);
  nums.sort((a, b) => (Math.abs(a - 258) - Math.abs(b - 258)) || (b - a));
  const probe = async (n) => {
    const base = `https://betist${n}tv.live`;
    try {
      const res = await fetch(`${base}/channel?id=zirve`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) return base;
    } catch (_) {}
    return null;
  };
  const results = await Promise.all(nums.map(probe));
  _betistDomain = results.find(Boolean) || BETIST_FALLBACK;
  _betistDomainTs = now;
  console.log('[API] Betist domain:', _betistDomain);
  return _betistDomain;
}

window.AppAPI = { fetchAllMatches };
