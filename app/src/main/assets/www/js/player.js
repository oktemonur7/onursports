/**
 * player.js — Video / iframe oynatıcı yönetimi
 */

const Player = (() => {
  let playerOverlay = null;
  let onCloseCallback = null;

  function _createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'player-overlay';
    overlay.className = 'player-overlay';
    overlay.innerHTML = `
      <div class="player-topbar">
        <span class="player-match-title" id="player-match-title"></span>
        <span class="player-source-label" id="player-source-label"></span>
        <button class="player-close-btn" id="player-close-btn" tabindex="0" aria-label="Kapat">✕ KAPAT</button>
      </div>
      <div class="player-frame-wrap">
        <iframe
          id="player-iframe"
          class="player-iframe"
          allowfullscreen
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          frameborder="0"
          scrolling="no"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
        ></iframe>
        <div class="player-loading" id="player-loading">
          <div class="spinner"></div>
          <span>Yayın yükleniyor…</span>
        </div>
      </div>
    `;
    return overlay;
  }

  function open(matchTitle, source, onClose) {
    close(); // varsa önceki overlay'i temizle

    onCloseCallback = onClose;

    playerOverlay = _createOverlay();
    document.body.appendChild(playerOverlay);

    // Başlık & etiket güncelle
    document.getElementById('player-match-title').textContent = matchTitle;
    document.getElementById('player-source-label').textContent = source.label;

    // Kapat butonu
    const closeBtn = document.getElementById('player-close-btn');
    closeBtn.addEventListener('click', close);
    closeBtn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(); }
    });

    // İframe yükle
    const iframe = document.getElementById('player-iframe');
    const loading = document.getElementById('player-loading');

    iframe.addEventListener('load', () => {
      loading.style.display = 'none';
    }, { once: true });

    // Kısa gecikme sonra src ata (loading göster)
    setTimeout(() => {
      iframe.src = source.url;
    }, 100);

    // Focus kapat butonuna
    setTimeout(() => closeBtn.focus(), 200);

    // Overlay animasyonu
    requestAnimationFrame(() => playerOverlay.classList.add('player-overlay--visible'));
  }

  function close() {
    if (!playerOverlay) return;

    playerOverlay.classList.remove('player-overlay--visible');

    // İframe'i boşalt (yayını durdur)
    const iframe = document.getElementById('player-iframe');
    if (iframe) iframe.src = 'about:blank';

    setTimeout(() => {
      playerOverlay?.remove();
      playerOverlay = null;
      onCloseCallback?.();
      onCloseCallback = null;
    }, 250);
  }

  function isOpen() {
    return playerOverlay !== null;
  }

  return { open, close, isOpen };
})();

window.Player = Player;
