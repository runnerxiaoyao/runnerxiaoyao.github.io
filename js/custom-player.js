(function () {
  function initAPlayer() {
    if (!window.APlayer) return;
    if (window.__aplayer_inited) return;
    window.__aplayer_inited = true;

    // Helper: normalize list items to APlayer audio format
    function normalizeList(list) {
      if (!Array.isArray(list)) return [];
      return list.map(function (it) {
        // Accept either {name,artist,url,cover} or simple string url
        if (typeof it === 'string') {
          return { name: '', artist: '', url: it };
        }
        return {
          name: it.name || it.title || '',
          artist: it.artist || it.author || '',
          url: it.url || it.src || it.path || '',
          cover: it.cover || it.image || ''
        };
      }).filter(function (a) { return a.url; });
    }

    // 创建容器（固定悬浮播放器）
    var el = document.createElement('div');
    el.id = 'aplayer';
    document.body.appendChild(el);

    // Use window.__aplayer_list once at first load (do not switch list on page change)
    var list = normalizeList(window.__aplayer_list || []);
    if (list.length === 0) {
      // try single default file under /music/
      list = [{ name: 'Background', artist: '', url: '/music/background.mp3' }];
    }

    var ap = new APlayer({
      container: el,
      fixed: true,
      autoplay: true,
      loop: 'all',
      order: 'list',
      preload: 'auto',
      lrcType: 0,
      audio: list
    });

  // expose for debugging
  try { window.__aplayer_instance = ap; console.debug('[aplayer] initialized playlist:', list); } catch (e) {}

    // Store player state globally to prevent re-muting
    window.__aplayer_state = window.__aplayer_state || { unmuted: false };

    // Try to bypass autoplay restrictions by muted play then unmute
    function attemptAutoplay() {
      try {
        if (ap.audio) ap.audio.muted = true;
        var p = ap.play && ap.play();
        if (p && typeof p.then === 'function') {
          p.then(function () {
            setTimeout(function () {
              try { 
                if (ap.audio) {
                  ap.audio.muted = false;
                  ap.audio.volume = 1;
                  window.__aplayer_state.unmuted = true;
                }
              } catch (e) {}
            }, 500);
          }).catch(function () {
            // Show fallback button if autoplay fails
            playBtn.style.display = 'block';
          });
        } else {
          playBtn.style.display = 'block';
        }
      } catch (e) {
        playBtn.style.display = 'block';
      }
    }

    // Delay autoplay attempt to ensure DOM is ready
    setTimeout(attemptAutoplay, 1000);

    // Ensure user interaction can start playback and unmute (only once and ignore clicks inside player)
    function userStartOnce(ev) {
      try {
        var insidePlayer = ev && ev.target && (ev.target.closest && ev.target.closest('#aplayer'));
        if (insidePlayer) return;
        
        // Start playback and ensure unmuted
        if (ap.audio) {
          ap.audio.muted = false;
          ap.audio.volume = 1;
          window.__aplayer_state.unmuted = true;
        }
        ap.play && ap.play().catch(function () {});
        playBtn.style.display = 'none';
      } catch (e) {}
      document.removeEventListener('click', userStartOnce, true);
      document.removeEventListener('touchstart', userStartOnce, true);
    }
    document.addEventListener('click', userStartOnce, true);
    document.addEventListener('touchstart', userStartOnce, true);

    // Prevent re-muting on page navigation
    function preventRemuting() {
      if (window.__aplayer_state && window.__aplayer_state.unmuted && ap.audio) {
        try {
          ap.audio.muted = false;
          ap.audio.volume = 1;
        } catch (e) {}
      }
    }

    // Hook into PJAX navigation to prevent re-muting and ensure continuous playback
    function onPageChange() {
      preventRemuting();
      
      // Ensure music continues playing and hide play button on article pages
      setTimeout(function() {
        try {
          var isArticlePage = window.location.pathname.match(/\/\d{4}\/\d{2}\/\d{2}\//);
          if (isArticlePage) {
            // Force continue playback if it was playing before
            if (window.__aplayer_state && window.__aplayer_state.unmuted) {
              if (ap.audio && ap.audio.paused) {
                ap.play && ap.play().catch(function () {});
              }
            }
            // Always hide play button on article pages
            playBtn.style.display = 'none';
          }
        } catch (e) {}
      }, 500);
    }
    
    document.addEventListener('pjax:complete', onPageChange);
    document.addEventListener('pjax:success', onPageChange);
    
    // Also hook into regular page navigation (non-PJAX)
    window.addEventListener('popstate', onPageChange);
    window.addEventListener('load', onPageChange);
    
    // Also check periodically to prevent accidental muting
    setInterval(preventRemuting, 2000);

    // Prevent music pausing when clicking homepage cards
    document.addEventListener('click', function(e) {
      try {
        var cardLink = e.target.closest && e.target.closest('.recent-post-item a, .post-card a, [href*="/2024/"], [href*="/2025/"]');
        if (cardLink && window.__aplayer_state && window.__aplayer_state.unmuted) {
          // Mark that we're navigating to an article to prevent pausing
          window.__aplayer_navigating = true;
          setTimeout(function() {
            window.__aplayer_navigating = false;
          }, 2000);
        }
      } catch (e) {}
    });

    // Modified visibility handling: don't pause when navigating between pages
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && !window.__aplayer_navigating) {
        ap.pause && ap.pause();
      }
    });

    // Stop per-page playlist switching: keep one global playlist for the whole site
    function updatePlaylistFromWindow() { /* disabled on purpose */ }

    // Floating fallback play button (hidden by default)
    var playBtn = document.createElement('button');
    playBtn.id = 'aplayer-play-btn';
    playBtn.style.cssText = 'position:fixed;right:20px;bottom:140px;z-index:9999;padding:8px 12px;border-radius:20px;background:#1e88e5;color:#fff;border:none;display:none;box-shadow:0 4px 8px rgba(0,0,0,0.2);font-size:12px;';
    playBtn.innerText = '播放音乐';
    document.body.appendChild(playBtn);
    playBtn.addEventListener('click', function () {
      try {
        // Try multiple ways to unmute: APlayer api, instance audio property, and raw <audio> element
        try { if (ap.audio) ap.audio.muted = false; } catch (e) {}
        try { if (ap.audio) ap.audio.volume = 1; } catch (e) {}
        try {
          var raw = document.querySelector('#aplayer audio');
          if (raw) { raw.muted = false; raw.volume = 1; }
        } catch (e) {}
        
        // Mark as unmuted globally
        window.__aplayer_state.unmuted = true;
        
        ap.play && ap.play().catch(function () {});
        playBtn.style.display = 'none';
      } catch (e) {}
    });

    // Hook PJAX complete disabled to avoid changing playlist or forcing play
    // document.addEventListener('pjax:complete', function () {});

    // Hide play button when playback actually starts
    try {
      if (ap.on) {
        ap.on('play', function () { try { playBtn.style.display = 'none'; } catch (e) {} });
      }
    } catch (e) {}
    // document.addEventListener('pjax:success', function () {});

    // Also listen for custom btf hooks if present
    if (window.btf && typeof window.btf.addGlobalFn === 'function') {
      // no-op here; template already destroys non-fixed players on pjax send
    }
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(initAPlayer);
})();

