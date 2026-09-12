/**
 * ui.js — Maç listesi render + D-Pad navigasyon + Popup yönetimi
 */

const UI = (() => {
  // ─── State ───────────────────────────────────────────────────────────────
  let matches = [];
  let activeCardIndex = 0;
  let popupOpen = false;
  let popupSourceIndex = 0;
  let popupMatch = null;
  let refreshTimer = null;

  // ─── DOM referansları ──────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  // ─── Render: Maç Listesi ───────────────────────────────────────────────

  function renderMatchList(matchList) {
    matches = matchList;
    const grid = $('match-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (matches.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📺</div>
          <div class="empty-text">Şu an canlı maç yok</div>
          <div class="empty-sub">Birazdan tekrar deneyin</div>
        </div>`;
      return;
    }

    matches.forEach((match, idx) => {
      const card = document.createElement('div');
      card.className = 'match-card';
      card.dataset.idx = idx;
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `${match.title}, ${match.sources.length} kaynak`);

      // Falcon / Kobra kaynak rozetleri
      const falconCount = match.sources.filter(s => s.server === 'falcon').length;
      const kobraCount  = match.sources.filter(s => s.server === 'kobra').length;

      const badges = [
        falconCount > 0 ? `<span class="badge badge--falcon">F×${falconCount}</span>` : '',
        kobraCount  > 0 ? `<span class="badge badge--kobra">K×${kobraCount}</span>`  : '',
      ].join('');

      card.innerHTML = `
        <div class="card-header">
          <span class="card-competition">${escHtml(match.competition || 'Canlı')}</span>
          <span class="card-time">${escHtml(match.time || '')}</span>
        </div>
        <div class="card-teams">
          <span class="card-team card-home">${escHtml(match.home || match.title)}</span>
          <span class="card-vs">vs</span>
          <span class="card-team card-away">${escHtml(match.away || '')}</span>
        </div>
        <div class="card-footer">
          <div class="card-badges">${badges}</div>
          <span class="card-source-count">${match.sources.length} kaynak</span>
        </div>
      `;

      card.addEventListener('click', () => openPopup(idx));
      card.addEventListener('focus', () => { activeCardIndex = idx; });
      grid.appendChild(card);
    });

    // İlk kartı focus'la
    focusCard(activeCardIndex);
  }

  function focusCard(idx) {
    if (idx < 0) idx = 0;
    if (idx >= matches.length) idx = matches.length - 1;
    activeCardIndex = idx;

    const cards = document.querySelectorAll('.match-card');
    cards.forEach(c => c.classList.remove('match-card--focused'));

    const target = cards[idx];
    if (target) {
      target.classList.add('match-card--focused');
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // ─── Popup: Kaynak Seçimi ──────────────────────────────────────────────

  function openPopup(matchIdx) {
    popupMatch = matches[matchIdx];
    if (!popupMatch || popupMatch.sources.length === 0) return;

    popupOpen = true;
    popupSourceIndex = 0;

    const overlay = $('source-popup-overlay');
    const popup   = $('source-popup');

    // Maç bilgisini güncelle
    $('popup-match-title').textContent = popupMatch.title;
    $('popup-match-info').textContent  =
      `${popupMatch.competition || ''}${popupMatch.time ? '  •  ' + popupMatch.time : ''}`;

    // Kaynak butonlarını oluştur
    const sourceList = $('popup-source-list');
    sourceList.innerHTML = '';

    popupMatch.sources.forEach((src, i) => {
      const btn = document.createElement('button');
      btn.className = `source-btn source-btn--${src.server}`;
      btn.dataset.idx = i;
      btn.tabIndex = 0;
      btn.setAttribute('aria-label', `Kaynak ${src.label}`);

      const serverIcon = src.server === 'falcon' ? '🦅' : '🐍';

      btn.innerHTML = `
        <span class="source-icon">${serverIcon}</span>
        <span class="source-label">${escHtml(src.label)}</span>
        <span class="source-quality ${src.quality ? 'source-quality--' + src.quality.toLowerCase() : ''}">
          ${src.quality || ''}
        </span>
      `;

      btn.addEventListener('click', () => playSource(i));
      btn.addEventListener('focus', () => { popupSourceIndex = i; });
      sourceList.appendChild(btn);
    });

    // Göster
    overlay.classList.add('popup-overlay--visible');
    popup.classList.add('source-popup--visible');

    // İlk kaynağa focus
    setTimeout(() => focusSourceBtn(0), 100);
  }

  function closePopup() {
    if (!popupOpen) return;
    popupOpen = false;
    popupMatch = null;

    const overlay = $('source-popup-overlay');
    const popup   = $('source-popup');

    overlay.classList.remove('popup-overlay--visible');
    popup.classList.remove('source-popup--visible');

    // Maç listesine geri dön
    setTimeout(() => focusCard(activeCardIndex), 150);
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
    const src = popupMatch.sources[sourceIdx];
    if (!src || !src.url) return;

    closePopup();

    // Kısa gecikme sonra player aç
    setTimeout(() => {
      Player.open(popupMatch.title, src, () => {
        // Player kapandığında maç listesine dön
        focusCard(activeCardIndex);
      });
    }, 200);
  }

  // ─── D-Pad Key Handler ────────────────────────────────────────────────

  function handleKeyDown(e) {
    const key = e.key || e.keyCode;

    // Player açıksa sadece ESC/Back dinle
    if (Player.isOpen()) {
      if (isBackKey(key)) {
        e.preventDefault();
        Player.close();
      }
      return;
    }

    // Popup açıksa
    if (popupOpen) {
      switch (key) {
        case 'ArrowLeft':
        case 37:
          e.preventDefault();
          focusSourceBtn(popupSourceIndex - 1);
          break;
        case 'ArrowRight':
        case 39:
          e.preventDefault();
          focusSourceBtn(popupSourceIndex + 1);
          break;
        case 'ArrowUp':
        case 38:
          e.preventDefault();
          focusSourceBtn(popupSourceIndex - 1);
          break;
        case 'ArrowDown':
        case 40:
          e.preventDefault();
          focusSourceBtn(popupSourceIndex + 1);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          playSource(popupSourceIndex);
          break;
        case 'Escape':
        case 'Backspace':
        case 8:
        case 27:
          e.preventDefault();
          closePopup();
          break;
      }
      return;
    }

    // Maç listesinde
    switch (key) {
      case 'ArrowUp':
      case 38:
        e.preventDefault();
        focusCard(activeCardIndex - 1);
        break;
      case 'ArrowDown':
      case 40:
        e.preventDefault();
        focusCard(activeCardIndex + 1);
        break;
      case 'ArrowLeft':
      case 37:
        e.preventDefault();
        focusCard(activeCardIndex - 3); // 3 sütunlu grid
        break;
      case 'ArrowRight':
      case 39:
        e.preventDefault();
        focusCard(activeCardIndex + 3); // 3 sütunlu grid
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        openPopup(activeCardIndex);
        break;
    }
  }

  function isBackKey(key) {
    return key === 'Escape' || key === 'Backspace'
      || key === 8 || key === 27
      || key === 'GoBack' || key === 'BrowserBack';
  }

  // ─── Loading & Error UI ────────────────────────────────────────────────

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

  // ─── Zaman Göstergesi ─────────────────────────────────────────────────

  function updateClock() {
    const el = $('header-clock');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }

  // ─── Otomatik Yenileme ─────────────────────────────────────────────────

  function scheduleRefresh(loadFn, intervalMs = 5 * 60 * 1000) {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      console.log('[UI] Otomatik yenileme…');
      loadFn();
    }, intervalMs);
  }

  // ─── Init ─────────────────────────────────────────────────────────────

  function init() {
    document.addEventListener('keydown', handleKeyDown);

    // Popup overlay tıklaması ile kapatma
    $('source-popup-overlay')?.addEventListener('click', e => {
      if (e.target === $('source-popup-overlay')) closePopup();
    });

    // Yenile butonu
    $('error-retry-btn')?.addEventListener('click', () => {
      if (window.AppMain?.load) window.AppMain.load();
    });

    // Saat
    updateClock();
    setInterval(updateClock, 30000);
  }

  // Global back handler (MainActivity.kt'dan çağrılır)
  window.handleBackPress = () => {
    if (Player.isOpen()) { Player.close(); return; }
    if (popupOpen) { closePopup(); return; }
  };

  return {
    init,
    renderMatchList,
    showLoading,
    hideLoading,
    showError,
    scheduleRefresh,
  };
})();

// ─── Yardımcı ──────────────────────────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

window.UI = UI;
window.escHtml = escHtml;
