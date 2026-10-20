/**
 * Rally Web App — HTML Shell
 * Shared <head> + page wrapper for all web preview pages.
 * Page data is injected into window.__RALLY__ for instant render (no loading flash).
 *
 * @param {object} opts
 * @param {string}  opts.title       - <title> and og:title
 * @param {string}  opts.description - meta description and og:description
 * @param {string}  opts.ogImage     - og:image URL
 * @param {string}  opts.ogUrl       - canonical og:url
 * @param {string}  opts.bodyClass   - extra class on #app (e.g. 'org-bg')
 * @param {string}  opts.bodyContent - inner HTML string
 * @param {any}     opts.pageData    - JSON-serialisable data injected as window.__RALLY__
 */
module.exports = function shell({ title, description, ogImage, ogUrl, bodyClass = '', bodyContent = '', pageData = null }) {
  const safePageData = pageData ? JSON.stringify(pageData).replace(/<\/script>/gi, '<\\/script>') : 'null';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
  <meta name="theme-color" content="#3D6F92">
  <title>${title ? `${title} | Rally` : 'Rally — Find Sports Events Near You'}</title>
  <meta name="description" content="${description || 'Find and join exciting sports events near you on Rally.'}">
  <meta name="robots" content="noindex,nofollow">

  <!-- Open Graph -->
  <meta property="og:title" content="${title || 'Rally'}">
  <meta property="og:description" content="${description || 'Find and join exciting sports events near you.'}">
  <meta property="og:image" content="${ogImage || 'https://backend2.rallysports.ae/public/rally-logo-bg.png'}">
  <meta property="og:url" content="${ogUrl || 'https://backend2.rallysports.ae'}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Rally">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title || 'Rally'}">
  <meta name="twitter:description" content="${description || 'Find and join exciting sports events near you.'}">
  <meta name="twitter:image" content="${ogImage || 'https://backend2.rallysports.ae/public/rally-logo-bg.png'}">

  <!-- App Store Smart Banners (iOS only) -->
  <meta name="apple-itunes-app" content="app-id=6526470249">

  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">

  <!-- Client Timezone Auto-detection -->
  <script>
    (function() {
      try {
        var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz) {
          window.viewerTimeZone = tz;
          var curMatch = document.cookie.match(/(?:^|;\s*)viewer_tz=([^;]+)/);
          var curTz = curMatch ? decodeURIComponent(curMatch[1]) : '';
          if (curTz !== tz) {
            document.cookie = 'viewer_tz=' + encodeURIComponent(tz) + ';path=/;max-age=31536000;SameSite=Lax';
          }
        }
      } catch (e) {}
    })();
  </script>

  <!-- Rally Web CSS -->
  <link rel="stylesheet" href="/public/webapp/styles/rally-web.css">
</head>
<body>
  <div id="app"${bodyClass ? ` class="${bodyClass}"` : ''}>
    ${bodyContent}
  </div>

  <!-- Immediate local time hydration to prevent layout shift before app.js executes -->
  <script>
    (function() {
      function pad(n) { return n < 10 ? '0' + n : n; }
      function fmtRange(start, end) {
        if (!start) return '';
        var s = new Date(start);
        if (isNaN(s.getTime())) return '';
        var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        var pTime = function(d) {
          var h = d.getHours();
          var m = pad(d.getMinutes());
          var ampm = h >= 12 ? 'PM' : 'AM';
          var h12 = h % 12 || 12;
          return { hm: h12 + ':' + m, full: h12 + ':' + m + ' ' + ampm, ampm: ampm };
        };
        var sT = pTime(s);
        var dayStr = days[s.getDay()] + ' ' + s.getDate() + ' ' + months[s.getMonth()];
        if (end) {
          var en = new Date(end);
          if (!isNaN(en.getTime())) {
            var eT = pTime(en);
            if (sT.ampm === eT.ampm) {
              return dayStr + ', ' + sT.hm + ' - ' + eT.full;
            }
            return dayStr + ', ' + sT.full + ' - ' + eT.full;
          }
        }
        return dayStr + ', ' + sT.full;
      }
      try {
        var els = document.querySelectorAll('.js-event-datetime');
        for (var i = 0; i < els.length; i++) {
          var el = els[i];
          var st = el.getAttribute('data-event-start');
          var en = el.getAttribute('data-event-end');
          if (st) {
            var txt = fmtRange(st, en);
            if (txt) {
              var target = el.querySelector('.featured-card-date-text') || el.querySelector('.event-card-meta-text') || el;
              target.textContent = txt;
            }
          }
        }
      } catch (e) {}
    })();
  </script>

  <!-- MEMBERS MODAL -->
  <div class="modal-backdrop" id="members-modal" onclick="closeMembersModal(event)">
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <div>
          <div class="modal-title" id="modal-title">Members</div>
          <div class="modal-subtitle" id="modal-subtitle"></div>
        </div>
        <button class="modal-close" onclick="closeMembersModal(event)" aria-label="Close">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-spots-row">
        <span class="modal-spots-text" id="modal-spots-text">0/0</span>
        <span class="modal-spots-label" id="modal-spots-label">Spots Available</span>
      </div>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" id="modal-progress" style="width:0%"></div>
      </div>
      <div class="modal-grid" id="modal-grid">
        <!-- Populated dynamically -->
      </div>
    </div>
  </div>

  <!-- Page data pre-injected by server for instant render (no API round-trip on load) -->
  <script>window.__RALLY__ = ${safePageData};</script>
  <!-- App JS -->
  <script src="/public/webapp/js/app.js" defer></script>
</body>
</html>`;
};
