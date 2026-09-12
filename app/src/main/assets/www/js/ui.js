/**
 * ui.js — Maç listesi render + D-Pad navigasyon + Popup yönetimi
 * v2: header kaldırıldı, kompakt kartlar, d-pad düzeltildi, null bug fix
 */

const UI = (() => {
  // ─── State ───────────────────────────────────────────────────────────────
  let matches = [];
  let activeCardIndex = 0;
  let popupOpen = false;
  let popupSourceIndex = 0;
  let popupMatch = null;
  let refreshTimer = null;
  const COLS = 2; // grid sütun sayısı

  const $ = id => document.getElementById(id);

  // ─── Render: Maç Listesi ──────────────────────────────────────────────

  function renderMatchList(matchList) {
    matches = matchList;
    const grid = $('match-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (matches.length === 0) {
      grid.innerHTML = `<div class="empty-state"><div class="empty-icon">📺</div><div class="empty-text">Şu an canlı maç yok</div></div>`;
      return;
    }

    matches.forEach((match, idx) => {
      const card = document.createElement('div');
      card.className = 'match-card';
      card.dataset.idx = idx;
      card.tabIndex = 0;
      card.setAttribute('role', 'button');

      const falconCount = match.sources.filter(s => s.server === 'falcon').length;
      const kobraCount  = match.sources.filter(s => s.server === 'kobra').length;
      const badges = [
        falconCount > 0 ? `<span class="badge badge--falcon">F×${falconCount}</span>` : '',
        kobraCount  > 0 ? `<span class="badge badge--kobra">K×${kobraCount}</span>`  : '',
      ].join('');

      const title = match.home && match.away
        ? `${escHtml(match.home)} <span class="vs">vs</span> ${escHtml(match.away)}`
        : escHtml(match.title || '');

      card.innerHTML = `
        <div class="card-title">${title}</div>
        <div class="card-meta">
          <div class="card-badges">${badges}</div>
          ${match.time ? `<span class="card-time">${escHtml(match.time)}</span>` : ''}
        </div>
      `;

      card.addEventListener('click', () => openPopup(idx));
      card.addEventListener('focus', () => { activeCardIndex = idx; });
      grid.appendChild(card);
    });

    focusCard(activeCardIndex);
  }

  function focusCard(idx) {
    const cards = document.querySelectorAll('.match-card');
    if (!cards.length) return;
    if (idx < 0) idx = 0;
    if (idx >= cards.length) idx = cards.length - 1;
    activeCardIndex = idx;

    cards.forEach(c => c.classList.remove('match-card--focused'));
    const target = cards[idx];
    if (target) {
      target.classList.add('match-card--focused');
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // ─── Popup: Kaynak Seçimi ─────────────────────────────────────────────

  function openPopup(matchIdx) {
    popupMatch = matches[matchIdx];
    if (!popupMatch || popupMatch.sources.length === 0) return;

    popupOpen = true;
    popupSourceIndex = 0;

    const overlay = $('source-popup-overlay');

    const title = popupMatch.home && popupMatch.away
      ? `${popupMatch.home} vs ${popupMatch.away}`
      : popupMatch.title || '';

    $('popup-match-title').textContent = title;
    $('popup-match-info').textContent =
      [popupMatch.competition, popupMatch.time].filter(Boolean).join('  •  ');

    const sourceList = $('popup-source-list');
    sourceList.innerHTML = '';

    popupMatch.sources.forEach((src, i) => {
      const btn = document.createElement('button');
      btn.className = `source-btn source-btn--${src.server}`;
      btn.dataset.idx = i;
      btn.tabIndex = 0;

      btn.innerHTML = `
        <span class="source-label">${escHtml(src.label)}</span>
        ${src.quality ? `<span class="source-quality source-quality--${src.quality.toLowerCase()}">${src.quality}</span>` : ''}
      `;

      // Click kaldırıldı - sadece keydown ile yönetiliyor (double-fire engeli)
      sourceList.appendChild(btn);
    });

    overlay.classList.add('popup-overlay--visible');
    setTimeout(() => focusSourceBtn(0), 80);
  }

  function closePopup() {
    if (!popupOpen) return;
    popupOpen = false;
    popupMatch = null;

    $('source-popup-overlay').classList.remove('popup-overlay--visible');
    setTimeout(() => focusCard(activeCardIndex), 100);
  }

  function focusSourceBtn(idx) {
    const btns = document.querySelectorAll('.source-btn');
    if (!btns.length) return;
    if (idx < 0) idx = btns.length - 1;
    if (idx >= btns.length) idx = 0;
    popupSourceIndex = idx;

    btns.forEach(b => b.classList.remove('source-btn--focused'));
    btns[idx]?.classList.add('source-btn--focused');
    btns[idx]?.focus({ preventScroll: true });
  }

  function playSource(sourceIdx) {
    if (!popupMatch) return;

    // BUG FIX: closePopup() popupMatch'i null yapıyor.
    // Bu yüzden önce local değişkenlere kopyala.
    const matchTitle = popupMatch.home && popupMatch.away
      ? `${popupMatch.home} vs ${popupMatch.away}`
      : popupMatch.title || '';
    const src = popupMatch.sources[sourceIdx];

    if (!src || !src.url) return;

    closePopup();

    setTimeout(() => {
      Player.open(matchTitle, src, () => {
        focusCard(activeCardIndex);
      });
    }, 150);
  }

  // ─── D-Pad Key Handler ────────────────────────────────────────────────

  let keyLocked = false; // Çift tetiklenmeyi önle

  function handleKeyDown(e) {
    if (keyLocked) { e.preventDefault(); return; }
    const key = e.key || e.keyCode;

    // Player açıksa sadece BACK dinle
    if (Player.isOpen()) {
      if (isBackKey(key)) { e.preventDefault(); Player.close(); }
      return;
    }

    // Popup açıksa
    if (popupOpen) {
      switch (key) {
        case 'ArrowUp':    case 38:
          e.preventDefault(); focusSourceBtn(popupSourceIndex - 1); break;
        case 'ArrowDown':  case 40:
          e.preventDefault(); focusSourceBtn(popupSourceIndex + 1); break;
        case 'ArrowLeft':  case 37:
          e.preventDefault(); focusSourceBtn(popupSourceIndex - 1); break;
        case 'ArrowRight': case 39:
          e.preventDefault(); focusSourceBtn(popupSourceIndex + 1); break;
        case 'Enter':
          e.preventDefault();
          keyLocked = true;
          playSource(popupSourceIndex);
          setTimeout(() => { keyLocked = false; }, 500);
          break;
        case 'Escape': case 'Backspace': case 8: case 27:
          e.preventDefault(); closePopup(); break;
      }
      return;
    }

    // Maç listesi — DÜZELTİLMİŞ YÖNLER
    switch (key) {
      case 'ArrowUp':    case 38:
        e.preventDefault(); focusCard(activeCardIndex - COLS); break;  // bir satır yukarı
      case 'ArrowDown':  case 40:
        e.preventDefault(); focusCard(activeCardIndex + COLS); break;  // bir satır aşağı
      case 'ArrowLeft':  case 37:
        e.preventDefault(); focusCard(activeCardIndex - 1); break;     // bir önceki kart
      case 'ArrowRight': case 39:
        e.preventDefault(); focusCard(activeCardIndex + 1); break;     // bir sonraki kart
      case 'Enter':
        e.preventDefault();
        keyLocked = true;
        openPopup(activeCardIndex);
        setTimeout(() => { keyLocked = false; }, 500);
        break;
    }
  }

  function isBackKey(key) {
    return key === 'Escape' || key === 'Backspace'
      || key === 8 || key === 27
      || key === 'GoBack' || key === 'BrowserBack';
  }

  // ─── Loading & Error UI ──────────────────────────────────────────────

  function showLoading() {
    $('loading-screen').style.display = 'flex';
    $('match-grid').style.display = 'none';
    $('error-screen').style.display = 'none';
  }

  function hideLoading() {
    $('loading-screen').style.display = 'none';
    $('match-grid').style.display = 'grid';
  }

  function showError(msg) {
    $('loading-screen').style.display = 'none';
    $('match-grid').style.display = 'none';
    $('error-screen').style.display = 'flex';
    $('error-msg').textContent = msg || 'Bağlantı hatası';
  }

  // ─── Otomatik Yenileme ────────────────────────────────────────────────

  function scheduleRefresh(loadFn, intervalMs = 5 * 60 * 1000) {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => loadFn(), intervalMs);
  }

  // ─── Init ─────────────────────────────────────────────────────────────

  function init() {
    document.addEventListener('keydown', handleKeyDown);

    // Popup overlay dışına tıklama ile kapat
    $('source-popup-overlay')?.addEventListener('click', e => {
      if (e.target === $('source-popup-overlay')) closePopup();
    });

    $('error-retry-btn')?.addEventListener('click', () => {
      if (window.AppMain?.load) window.AppMain.load();
    });
  }

  // ─── Global Back Handler (MainActivity.kt'dan çağrılır) ──────────────

  window.handleBackPress = () => {
    if (Player.isOpen()) { Player.close(); return; }
    if (popupOpen) { closePopup(); return; }
    // Ana ekranda geri → uygulamayı tamamen kapat
    if (typeof TvBridge !== 'undefined') {
      TvBridge.exitApp();
    }
  };

  return { init, renderMatchList, showLoading, hideLoading, showError, scheduleRefresh };
})();

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.UI = UI;
window.escHtml = escHtml;
