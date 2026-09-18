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

  let hls = null;

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
        <video id="player-video" style="position:absolute;inset:0;width:100%;height:100%;background:#000;display:none" controls playsinline></video>
        <iframe
          id="player-iframe"
          class="player-iframe"
          allowfullscreen
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          frameborder="0"
          scrolling="no"
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
    }, 10000);
  }

  function open(matchTitle, source, onClose) {
    close();
    onCloseCallback = onClose;
    console.log('[Player] open:', matchTitle, '|', source.label, '|', (source.url || '').slice(0, 120));

    playerOverlay = _createOverlay();
    document.body.appendChild(playerOverlay);

    document.getElementById('player-match-title').textContent = matchTitle;
    document.getElementById('player-source-label').textContent = source.label;

    const iframe = document.getElementById('player-iframe');
    const video = document.getElementById('player-video');
    const loading = document.getElementById('player-loading');

    if (source.type === 'hls' && source.url) {
      // TR: direkt HLS (iframe yolu değişmedi)
      iframe.style.display = 'none';
      video.style.display = 'block';
      if (window.Hls && window.Hls.isSupported()) {
        hls = new window.Hls({ maxBufferLength: 30, manifestLoadingMaxRetry: 2 });
        hls.on(window.Hls.Events.ERROR, (_e, data) => {
          if (data && data.fatal) {
            loading.style.display = 'flex';
            const sp = loading.querySelector('span');
            if (sp) sp.textContent = 'Yayın hatası — başka kaynağı deneyin.';
          }
        });
        hls.loadSource(source.url);
        hls.attachMedia(video);
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          const p = video.play && video.play();
          if (p && p.catch) p.catch(() => {});
        });
      } else if (video.canPlayType && video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = source.url;
        const p = video.play && video.play();
        if (p && p.catch) p.catch(() => {});
      }
      video.onplaying = () => { loading.style.display = 'none'; };
      video.onerror = () => {
        loading.style.display = 'flex';
        const sp = loading.querySelector('span');
        if (sp) sp.textContent = 'Yayın açılamadı — başka kaynağı deneyin.';
      };
      setTimeout(() => {
        if (video && !video.paused && !video.ended) loading.style.display = 'none';
      }, 12000);
    } else {
      video.style.display = 'none';
      iframe.addEventListener('load', () => { loading.style.display = 'none'; }, { once: true });

      setTimeout(() => { iframe.src = source.url; }, 100);
    }

    // Topbar 3 sn sonra gizle
    requestAnimationFrame(() => playerOverlay.classList.add('player-overlay--visible'));
    _showTopbar();
  }

  function close() {
    if (!playerOverlay) return;
    clearTimeout(topbarTimer);
    try { hls && hls.destroy(); } catch (_) {}
    hls = null;
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
