(function () {
  'use strict';

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
})();
