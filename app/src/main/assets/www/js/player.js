/**
 * player.js v2
 * - Close butonu yok
 * - Topbar 3 sn sonra otomatik gizlenir, herhangi tuşa basınca tekrar gösterir
 * - Geri tuşu ile kapatılır
 */

const Player = (() => {
  let playerOverlay = null;
  let onCloseCallback = null;
  let topbarTimer = null;

  function _createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'player-overlay';
    overlay.className = 'player-overlay';
    overlay.innerHTML = `
      <div class="player-topbar" id="player-topbar">
        <span class="player-match-title" id="player-match-title"></span>
        <span class="player-source-label" id="player-source-label"></span>
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

  function _showTopbar() {
    const topbar = document.getElementById('player-topbar');
    if (!topbar) return;
    topbar.classList.remove('player-topbar--hidden');
    clearTimeout(topbarTimer);
    topbarTimer = setTimeout(() => {
      topbar.classList.add('player-topbar--hidden');
    }, 3000);
  }

  function open(matchTitle, source, onClose) {
    close();
    onCloseCallback = onClose;

    playerOverlay = _createOverlay();
    document.body.appendChild(playerOverlay);

    document.getElementById('player-match-title').textContent = matchTitle;
    document.getElementById('player-source-label').textContent = source.label;

    const iframe = document.getElementById('player-iframe');
    const loading = document.getElementById('player-loading');

    iframe.addEventListener('load', () => { loading.style.display = 'none'; }, { once: true });

    setTimeout(() => { iframe.src = source.url; }, 100);

    // Topbar 3 sn sonra gizle
    requestAnimationFrame(() => playerOverlay.classList.add('player-overlay--visible'));
    _showTopbar();
  }

  function close() {
    if (!playerOverlay) return;
    clearTimeout(topbarTimer);
    playerOverlay.classList.remove('player-overlay--visible');

    const iframe = document.getElementById('player-iframe');
    if (iframe) iframe.src = 'about:blank';

    setTimeout(() => {
      playerOverlay?.remove();
      playerOverlay = null;
      onCloseCallback?.();
      onCloseCallback = null;
    }, 250);
  }

  function isOpen() { return playerOverlay !== null; }

  // Herhangi bir tuşa basınca topbar'ı göster
  function onKeyDuringPlayback() { _showTopbar(); }

  return { open, close, isOpen, onKeyDuringPlayback };
})();

window.Player = Player;
