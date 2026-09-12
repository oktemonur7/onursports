/**
 * ui.js v3
 * - 3 sütun grid
 * - Kartlarda kaynak bilgisi yok
 * - Topbar keypress bildirimi
 */

const UI = (() => {
  let matches = [];
  let activeCardIndex = 0;
  let popupOpen = false;
  let popupSourceIndex = 0;
  let popupMatch = null;
  let refreshTimer = null;
  const COLS = 3;

  const $ = id => document.getElementById(id);

  // ─── Render ──────────────────────────────────────────────────────────

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

      const homeText = escHtml(match.home || match.title || '');
      const awayText = escHtml(match.away || '');
      // Boşluk bırakmadan title oluştur (template literal whitespace önlemi)
      const titleHtml = awayText
        ? `${homeText}<span class="vs">vs</span>${awayText}`
        : homeText;
      const timeHtml = match.time
        ? `<div class="card-time">${escHtml(match.time)}</div>`
        : '';

      card.innerHTML = `<div class="card-title">${titleHtml}</div>${timeHtml}`;
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

      const container = $('match-grid-wrap');
      if (container) {
        const targetRect = target.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const safeMargin = 24;

        if (targetRect.top < containerRect.top + safeMargin) {
          container.scrollBy({
            top: targetRect.top - containerRect.top - safeMargin,
            behavior: 'smooth'
          });
        } else if (targetRect.bottom > containerRect.bottom - safeMargin) {
          container.scrollBy({
            top: targetRect.bottom - containerRect.bottom + safeMargin,
            behavior: 'smooth'
          });
        }
      }
    }
  }

  // ─── Popup ────────────────────────────────────────────────────────────

  function openPopup(matchIdx) {
    popupMatch = matches[matchIdx];
    if (!popupMatch || popupMatch.sources.length === 0) return;
    popupOpen = true;
    popupSourceIndex = 0;

    const title = popupMatch.home && popupMatch.away
      ? `${popupMatch.home} vs ${popupMatch.away}`
      : popupMatch.title || '';

    $('popup-match-title').textContent = title;
    $('popup-match-info').textContent = '';


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
      sourceList.appendChild(btn);
    });

    $('source-popup-overlay').classList.add('popup-overlay--visible');
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
    // CRITICAL: ref'leri closePopup()'dan ÖNCE kaydet
    const matchTitle = popupMatch.home && popupMatch.away
      ? `${popupMatch.home} vs ${popupMatch.away}`
      : popupMatch.title || '';
    const src = popupMatch.sources[sourceIdx];
    if (!src || !src.url) return;

    closePopup();
    setTimeout(() => {
      Player.open(matchTitle, src, () => { focusCard(activeCardIndex); });
    }, 150);
  }

  // ─── D-Pad ───────────────────────────────────────────────────────────

  let keyLocked = false;

  function handleKeyDown(e) {
    const key = e.key || e.keyCode;

    if (Player.isOpen()) {
      if (isBackKey(key)) { e.preventDefault(); Player.close(); return; }
      // Herhangi bir tuşta topbar'ı göster
      Player.onKeyDuringPlayback();
      return;
    }

    if (keyLocked) { e.preventDefault(); return; }

    if (popupOpen) {
      switch (key) {
        case 'ArrowUp':    case 38: e.preventDefault(); focusSourceBtn(popupSourceIndex - 1); break;
        case 'ArrowDown':  case 40: e.preventDefault(); focusSourceBtn(popupSourceIndex + 1); break;
        case 'ArrowLeft':  case 37: e.preventDefault(); focusSourceBtn(popupSourceIndex - 1); break;
        case 'ArrowRight': case 39: e.preventDefault(); focusSourceBtn(popupSourceIndex + 1); break;
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

    // Ana liste — 3 sütun grid
    switch (key) {
      case 'ArrowUp':    case 38: e.preventDefault(); focusCard(activeCardIndex - COLS); break;
      case 'ArrowDown':  case 40: e.preventDefault(); focusCard(activeCardIndex + COLS); break;
      case 'ArrowLeft':  case 37: e.preventDefault(); focusCard(activeCardIndex - 1); break;
      case 'ArrowRight': case 39: e.preventDefault(); focusCard(activeCardIndex + 1); break;
      case 'Enter':
        e.preventDefault();
        keyLocked = true;
        openPopup(activeCardIndex);
        setTimeout(() => { keyLocked = false; }, 500);
        break;
    }
  }

  function isBackKey(key) {
    return key === 'Escape' || key === 'Backspace' || key === 8 || key === 27
      || key === 'GoBack' || key === 'BrowserBack';
  }

  // ─── Loading / Error ─────────────────────────────────────────────────

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

  function scheduleRefresh(loadFn, intervalMs = 5 * 60 * 1000) {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => loadFn(), intervalMs);
  }

  function init() {
    document.addEventListener('keydown', handleKeyDown);
    $('source-popup-overlay')?.addEventListener('click', e => {
      if (e.target === $('source-popup-overlay')) closePopup();
    });
    $('error-retry-btn')?.addEventListener('click', () => {
      if (window.AppMain?.load) window.AppMain.load();
    });
  }

  window.handleBackPress = () => {
    if (Player.isOpen()) { Player.close(); return; }
    if (popupOpen) { closePopup(); return; }
    if (typeof TvBridge !== 'undefined') TvBridge.exitApp();
  };

  return { init, renderMatchList, showLoading, hideLoading, showError, scheduleRefresh };
})();

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.UI = UI;
window.escHtml = escHtml;
