(function () {
  'use strict';

  var REPO = 'Yuri-Lima/resonara';
  var RELEASES_URL = 'https://github.com/' + REPO + '/releases';
  var LATEST_API = 'https://api.github.com/repos/' + REPO + '/releases/latest';
  // Static fallbacks if API is rate-limited (updated with each release tag)
  var FALLBACK_TAG = 'v1.0.0';
  var FALLBACK = {
    macDmg:
      'https://github.com/' +
      REPO +
      '/releases/download/' +
      FALLBACK_TAG +
      '/Resonara-1.0.0-arm64.dmg',
    macZip:
      'https://github.com/' +
      REPO +
      '/releases/download/' +
      FALLBACK_TAG +
      '/Resonara-1.0.0-arm64-mac.zip',
    winSetup:
      'https://github.com/' +
      REPO +
      '/releases/download/' +
      FALLBACK_TAG +
      '/Resonara%20Setup%201.0.0.exe',
    page: RELEASES_URL + '/tag/' + FALLBACK_TAG,
  };

  // Current year in footers
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  // Smooth active nav for same-page anchors
  var path = location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav-links a[href]').forEach(function (a) {
    try {
      var u = new URL(a.href, location.origin);
      var p = u.pathname.replace(/\/$/, '') || '/';
      if (p === path || (path.endsWith('/docs') && p.endsWith('/index.html'))) {
        if (!u.hash) a.setAttribute('aria-current', 'page');
      }
    } catch (_) {}
  });

  // Reveal cards lightly on scroll (respect reduced motion)
  var reduceMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.style.opacity = '1';
            e.target.style.transform = 'none';
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    document.querySelectorAll('.card, .step, .dl-card').forEach(function (el) {
      el.style.opacity = '0';
      el.style.transform = 'translateY(12px)';
      el.style.transition = 'opacity 0.5s ease, transform 0.5s ease, border-color 0.2s ease';
      io.observe(el);
    });
  }

  function detectPlatform() {
    var ua = navigator.userAgent || '';
    var platform = navigator.platform || '';
    if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'windows';
    if (/Mac/i.test(platform) || /Mac OS/i.test(ua)) return 'mac';
    if (/Linux/i.test(platform) || /Linux/i.test(ua)) return 'linux';
    return 'unknown';
  }

  function pickAssets(release) {
    var assets = (release && release.assets) || [];
    var byName = function (re) {
      for (var i = 0; i < assets.length; i++) {
        if (re.test(assets[i].name || '')) return assets[i].browser_download_url;
      }
      return null;
    };
    return {
      tag: (release && release.tag_name) || FALLBACK_TAG,
      page: (release && release.html_url) || FALLBACK.page,
      macDmg: byName(/\.dmg$/i) || FALLBACK.macDmg,
      macZip: byName(/arm64-mac\.zip$|\.zip$/i) || FALLBACK.macZip,
      winSetup: byName(/Setup.*\.exe$|\.exe$/i) || FALLBACK.winSetup,
    };
  }

  function setHref(selector, url) {
    if (!url) return;
    document.querySelectorAll(selector).forEach(function (el) {
      el.setAttribute('href', url);
      // Ensure links open/download correctly from GitHub Pages
      if (/\.(dmg|exe|zip)$/i.test(url) || /releases\/download\//.test(url)) {
        el.setAttribute('rel', 'noopener');
      }
    });
  }

  function applyLinks(info) {
    var plat = detectPlatform();
    var primary =
      plat === 'windows' ? info.winSetup : plat === 'mac' ? info.macDmg : info.page;

    // Generic "Download" / "Get Resonara" / "Releases" buttons
    setHref('[data-download="primary"]', primary || info.page);
    setHref('[data-download="releases"]', info.page);
    setHref('[data-download="mac"]', info.macDmg);
    setHref('[data-download="mac-zip"]', info.macZip);
    setHref('[data-download="windows"]', info.winSetup);

    // Status line
    var status = document.getElementById('release-status');
    if (status) {
      status.innerHTML =
        'Latest release: <strong>' +
        info.tag +
        '</strong> · ' +
        '<a href="' +
        info.page +
        '">View all assets</a>';
    }

    // Platform hint on primary CTA
    document.querySelectorAll('[data-download="primary"]').forEach(function (el) {
      if (plat === 'mac' && !el.dataset.lockedLabel) {
        el.textContent = el.dataset.macLabel || 'Download for macOS';
      } else if (plat === 'windows' && !el.dataset.lockedLabel) {
        el.textContent = el.dataset.winLabel || 'Download for Windows';
      }
    });
  }

  // Apply fallbacks immediately so buttons work before API returns
  applyLinks(pickAssets(null));

  // Refresh from GitHub API (latest release assets)
  fetch(LATEST_API, {
    headers: { Accept: 'application/vnd.github+json' },
  })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (release) {
      applyLinks(pickAssets(release));
    })
    .catch(function () {
      // Keep static fallbacks — still point at real v1.0.0 asset URLs
      applyLinks(pickAssets(null));
    });
})();
